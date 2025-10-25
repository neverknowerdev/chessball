import { createPublicClient, http } from 'viem';
import { chain } from '@/config/chains';

// Create a public client for reading contract data
export const publicClient = createPublicClient({
    chain: chain,
    transport: http(process.env.RPC_URL || 'https://mainnet.base.org')
});

// Utility function to wait for transaction receipt
export function waitForTransactionReceipt(hash: string) {
    return publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        confirmations: 0,
        pollingInterval: 200
    });
}