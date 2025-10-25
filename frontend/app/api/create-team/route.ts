import { NextRequest, NextResponse } from 'next/server';
import { type Address, parseEventLogs, Log } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { sendWebhookMessage } from '@/lib/webhook';


interface CreateTeamRequest {
    walletAddress: string;
    signature: string;
    message: string;
    teamName: string;
    countryId: number;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body: CreateTeamRequest = await req.json();
        const { walletAddress, signature, message, teamName, countryId } = body;

        // Log the received data to console
        console.log('=== API RECEIVED AUTHENTICATION DATA ===');
        console.log('Wallet Address:', walletAddress);
        console.log('Signature:', signature);
        console.log('Message:', message);
        console.log('Team Name:', teamName);
        console.log('Country ID:', countryId);
        console.log('Timestamp:', new Date().toISOString());
        console.log('=====================================');

        // Validate input data
        if (!walletAddress || !teamName || countryId === undefined) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate wallet address format (basic check)
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return NextResponse.json(
                { success: false, error: 'Invalid wallet address format' },
                { status: 400 }
            );
        }

        // Validate country ID range (assuming 0-255 for uint8)
        if (countryId < 0 || countryId > 255) {
            return NextResponse.json(
                { success: false, error: 'Invalid country ID' },
                { status: 400 }
            );
        }

        // Validate team name length
        if (teamName.length === 0 || teamName.length > 100) {
            return NextResponse.json(
                { success: false, error: 'Team name must be between 1 and 100 characters' },
                { status: 400 }
            );
        }

        // Validate signature and message
        if (!signature || !message) {
            return NextResponse.json(
                { success: false, error: 'Signature and message are required' },
                { status: 400 }
            );
        }

        const { isValid, error, timestamp, expiresAt } = await checkAuthSignatureAndMessage(signature, message, walletAddress);
        if (!isValid) {
            return NextResponse.json(
                { success: false, error: error },
                { status: 401 }
            );
        }

        // Simulate the transaction first using publicClient
        const simulation = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'createTeamRelayer',
            args: [walletAddress as Address, teamName, countryId],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        console.log('Creating team with relayer:', {
            walletAddress,
            teamName,
            countryId,
            contractAddress: CONTRACT_ADDRESS
        });

        console.log('Transaction sent successfully:', paymasterReceipt.receipt.transactionHash);

        return NextResponse.json({
            success: true,
            message: 'Team created successfully',
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

    } catch (error) {
        console.error('Error in create-team API:', error);

        if (error instanceof BaseError) {
            console.log("error is a BaseError");
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                console.log("revertError", revertError);
                const errorName = revertError.data?.errorName ?? '';
                console.log("errorName", errorName);
                // Handle custom validation errors from contract simulation
                switch (errorName) {
                    case 'CreateTeam_NameIsRequired':
                        return NextResponse.json(
                            { success: false, error: 'Team name is required by the contract', errorName: errorName },
                            { status: 400 }
                        );
                    case 'CreateTeam_TeamAlreadyExists':
                        return NextResponse.json(
                            { success: false, error: 'Team is already exist on smart-contract.', errorName: errorName },
                            { status: 400 }
                        );
                    case 'CreateTeam_TeamNameAlreadyExists':
                        return NextResponse.json(
                            { success: false, error: 'This team name is already taken. Please choose a different name.', errorName: errorName },
                            { status: 400 }
                        );
                    // add more custom error handlers here as needed
                    default:
                        break;
                }
            }
        }

        // Provide more specific error messages for blockchain-related errors
        let errorMessage = 'Internal server error';
        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for transaction';
            } else if (error.message.includes('nonce')) {
                errorMessage = 'Transaction nonce error';
            } else if (error.message.includes('gas')) {
                errorMessage = 'Gas estimation error';
            } else if (error.message.includes("User rejected")) {
                errorMessage = "Transaction was cancelled by user.";
            } else if (error.message.includes("Team already exists")) {
                errorMessage = "You already have a team. Each wallet can only create one team.";
            } else if (error.message.includes("Team name already exists")) {
                errorMessage = "This team name is already taken. Please choose a different name.";
            } else if (error.message.includes("Invalid signature")) {
                errorMessage = "Signature verification failed. Please try again.";
            } else {
                errorMessage = `Error: ${error.message}`;
            }
        }

        return NextResponse.json(
            { success: false, error: errorMessage },
            { status: 500 }
        );
    }
}
