import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { sendWebhookMessage } from '@/lib/webhook';

interface CreateGameRequestRequest {
    wallet_address: string;
    signature: string;
    message: string;
    team1_id: number;
    team2_id: number;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(request: NextRequest) {
    try {
        const { team1_id, team2_id, signature, message, wallet_address } = await request.json();

        // Validate required fields
        if (!team1_id || !team2_id || !signature || !message || !wallet_address) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
            return NextResponse.json(
                { success: false, error: 'Invalid wallet address format' },
                { status: 400 }
            );
        }

        // Validate team IDs
        if (team1_id <= 0 || team2_id <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid team IDs' },
                { status: 400 }
            );
        }

        if (team1_id === team2_id) {
            return NextResponse.json(
                { success: false, error: 'Teams cannot be the same' },
                { status: 400 }
            );
        }

        // Validate signature and message
        const { isValid, error } = await checkAuthSignatureAndMessage(signature, message, wallet_address);
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
            functionName: 'createGameRequestRelayer',
            args: [wallet_address as Address, team1_id, team2_id],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        console.log('Creating game request with relayer:', {
            wallet_address,
            team1_id,
            team2_id,
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

        return NextResponse.json({
            success: true,
            message: 'Game request created successfully',
            data: {
                gameRequestId: paymasterReceipt.receipt.transactionHash, // Using transaction hash as temporary ID
                team1_id,
                team2_id,
                status: 'pending',
                transactionHash: paymasterReceipt.receipt.transactionHash
            }
        });

    } catch (error) {
        console.error('Error creating game request:', error);

        if (error instanceof BaseError) {
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                const errorName = revertError.data?.errorName ?? '';
                console.log("Contract error:", errorName);

                // Handle custom validation errors from contract
                switch (errorName) {
                    case 'TeamsCannotBeSame':
                        return NextResponse.json(
                            { success: false, error: 'Teams cannot be the same', errorName: errorName },
                            { status: 400 }
                        );
                    case 'DoesNotExist':
                        return NextResponse.json(
                            { success: false, error: 'One or both teams do not exist', errorName: errorName },
                            { status: 400 }
                        );
                    case 'TeamAlreadyHasActiveGame':
                        return NextResponse.json(
                            { success: false, error: 'One or both teams already have an active game', errorName: errorName },
                            { status: 400 }
                        );
                    default:
                        return NextResponse.json(
                            { success: false, error: 'Failed to create game request', errorName: errorName },
                            { status: 400 }
                        );
                        break;
                }
            }
        }

        // Provide user-friendly error messages
        let errorMessage = 'Failed to create game request';
        if (error instanceof Error) {
            if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for transaction';
            } else if (error.message.includes('User rejected')) {
                errorMessage = 'Transaction was cancelled';
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
