"use server";
import { createPaymasterClient } from 'viem/account-abstraction'
import { createWalletClient, createPublicClient, http, type Hex } from 'viem';
import { basePreconf } from 'viem/chains';
import { chain } from '@/config/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { toCoinbaseSmartAccount } from 'viem/account-abstraction';
import { createBundlerClient } from 'viem/account-abstraction';
import { redis } from './redis';
import { UserOperationReceipt } from 'viem/account-abstraction';
import { CONTRACT_ABI } from './contract';

const COINBASE_PAYMASTER_RPC_URL = process.env.COINBASE_PAYMASTER_RPC_URL || process.env.TESTNET_COINBASE_PAYMASTER_RPC_URL;
const FLASHBLOCKS_RPC_URL = process.env.FLASHBLOCKS_RPC_URL || process.env.TESTNET_FLASHBLOCKS_RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || process.env.TESTNET_RELAYER_PRIVATE_KEY;

function getCoinbasePaymasterRpcUrl() {
    // Coinbase Paymaster Configuration
    if (!COINBASE_PAYMASTER_RPC_URL) {
        throw new Error('COINBASE_PAYMASTER_RPC_URL environment variable is required');
    }

    console.log('Using Coinbase Paymaster for transaction sponsorship');
    return COINBASE_PAYMASTER_RPC_URL;
}

// Create a dedicated flashblocks client with HTTP transport for faster confirmations
const flashblocksClient = createPublicClient({
    chain: chain,
    transport: http(FLASHBLOCKS_RPC_URL),
    pollingInterval: 100,
});

// Create smart account for Paymaster transactions
export async function createSmartAccount() {
    const privateKey = RELAYER_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('RELAYER_PRIVATE_KEY environment variable is required');
    }

    const owner = privateKeyToAccount(privateKey as Hex);

    // Create Coinbase smart wallet using the EOA signer
    const smartAccount = await toCoinbaseSmartAccount({
        client: flashblocksClient,
        owners: [owner],
        version: '1.1' // Specify version as required
    });

    return smartAccount;
}

// Create bundler client for UserOperations
export async function createRelayerBundlerClient() {
    const smartAccount = await createSmartAccount();

    return createBundlerClient({
        account: smartAccount,
        client: flashblocksClient, // Use flashblocks client for faster confirmations
        transport: http(FLASHBLOCKS_RPC_URL),
        chain: chain,
        paymaster: createPaymasterClient({
            transport: http(getCoinbasePaymasterRpcUrl())
        })
    });
}

// Legacy function for backward compatibility (now uses smart account)
export async function createRelayerClient() {
    const smartAccount = await createSmartAccount();

    // Return a wallet client that uses the smart account
    return createWalletClient({
        account: smartAccount,
        chain: chain,
        transport: http(FLASHBLOCKS_RPC_URL),
    });
}

// Redis-based nonce management for relayer
export async function getNextRelayerNonce(account: Hex): Promise<bigint> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        if (!redis) {
            throw new Error('Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables');
        }

        // Use Redis INCR for atomic increment
        const nonceStr = await redis.incr(nonceKey);
        const nonce = Number(nonceStr);

        // If this is the first time (nonce === 1), get the current nonce from blockchain
        if (nonce === 1) {
            console.log('Fetching initial nonce using flashblocks client');
            const blockchainNonce = await flashblocksClient.getTransactionCount({
                address: account,
                blockTag: 'pending'
            });

            // Set the nonce to blockchain nonce + 1
            await redis.set(nonceKey, Number(blockchainNonce) + 1);
            return BigInt(blockchainNonce as number);
        }

        return BigInt(nonce - 1); // Redis INCR returns the new value, so subtract 1
    } catch (error) {
        console.error('Error getting next relayer nonce:', error);
        throw new Error(`Failed to get next nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Reset nonce counter (useful for testing or if nonce gets out of sync)
export async function resetRelayerNonce(account: Hex): Promise<void> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        if (!redis) {
            throw new Error('Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables');
        }

        // Get current nonce from blockchain using flashblocks
        console.log('Resetting nonce using flashblocks client');
        const blockchainNonce = await flashblocksClient.getTransactionCount({
            address: account,
            blockTag: 'pending'
        });

        // Reset to blockchain nonce
        await redis.set(nonceKey, Number(blockchainNonce));
        console.log(`Reset nonce for ${account} to ${blockchainNonce}`);
    } catch (error) {
        console.error('Error resetting relayer nonce:', error);
        throw new Error(`Failed to reset nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Get current nonce without incrementing (for debugging)
export async function getCurrentRelayerNonce(account: Hex): Promise<bigint> {
    const nonceKey = `relayer_nonce:${account}`;

    try {
        if (!redis) {
            throw new Error('Redis client not available - check REDIS_URL and REDIS_TOKEN environment variables');
        }

        const nonceStr = await redis.get(nonceKey);
        const nonce = nonceStr !== null ? Number(nonceStr) : null;

        if (nonce === null) {
            // No nonce stored, get from blockchain using flashblocks
            console.log('Fetching current nonce using flashblocks client');
            const blockchainNonce = await flashblocksClient.getTransactionCount({
                address: account,
                blockTag: 'pending'
            });
            return BigInt(blockchainNonce as number);
        }

        return BigInt(nonce);
    } catch (error) {
        console.error('Error getting current relayer nonce:', error);
        throw new Error(`Failed to get current nonce: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Generic function to send transactions with retry logic using UserOperations
export async function sendTransactionWithRetry(request: any, maxRetries: number = 3): Promise<UserOperationReceipt> {
    const bundlerClient = await createRelayerBundlerClient();
    const smartAccount = await createSmartAccount();
    const accountAddress = smartAccount.address;

    console.log('Sending UserOperation for smart account:', accountAddress);
    console.log('Transaction will be sponsored by Coinbase Paymaster');
    console.log('Using flashblocks client for transaction processing');

    // Convert the contract call request to a UserOperation call
    const call = {
        abi: CONTRACT_ABI,
        functionName: request.functionName,
        to: request.address,
        args: request.args,
    };

    // Get current gas fees for EIP-1559 transaction
    const feeData = await flashblocksClient.getGasPrice();
    const maxFeePerGas = feeData * BigInt(2); // 2x gas price for maxFeePerGas
    const maxPriorityFeePerGas = feeData; // Use gas price as priority fee

    console.log('Gas fees - maxFeePerGas:', maxFeePerGas.toString(), 'maxPriorityFeePerGas:', maxPriorityFeePerGas.toString());

    let userOpHash: string;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            // Send UserOperation with Paymaster sponsorship
            console.log('Sending UserOperation with flashblocks optimization');
            userOpHash = await bundlerClient.sendUserOperation({
                account: smartAccount,
                calls: [call],
                maxFeePerGas,
                maxPriorityFeePerGas
            });

            console.log('UserOperation sent successfully. UserOp hash:', userOpHash);
            console.log('Transaction sponsored by Coinbase Paymaster: YES');

            // Wait for UserOperation receipt with flashblocks optimization
            console.log('Waiting for UserOperation receipt with flashblocks polling');
            const receipt = await bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash as `0x${string}`,
                pollingInterval: 100 // Optimized for flashblocks (faster than standard 200ms)
            });

            console.log('UserOperation receipt received');
            return receipt;

        } catch (error: any) {
            retryCount++;
            console.error(`UserOperation attempt ${retryCount} failed:`, error.message);

            // Paymaster specific error handling
            if (error.message?.includes('insufficient funds') ||
                error.message?.includes('gas estimation failed') ||
                error.message?.includes('execution reverted') ||
                error.message?.includes('paymaster') ||
                error.message?.includes('sponsor')) {
                console.error('Paymaster UserOperation failed:', error.message);
                throw error; // Don't retry for these errors
            }

            if (error.message?.includes('replacement transaction underpriced') && retryCount < maxRetries) {
                // Wait a bit before retry to let the previous transaction settle
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            }

            throw error;
        }
    }

    throw new Error('Failed to commit UserOperation after maximum retries');
}

export async function waitForPaymasterTransactionReceipt(hash: string | UserOperationReceipt) {
    console.log('UserOperation sent successfully. UserOp hash:', hash);
    console.log('Transaction sponsored by Coinbase Paymaster: YES');

    // If it's a UserOperationReceipt, extract the transaction hash
    const txHash = typeof hash === 'string' ? hash : hash.receipt.transactionHash;

    // Use flashblocks client for faster confirmation
    return await flashblocksClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 100 // Optimized for flashblocks
    });
}
