import { NextRequest, NextResponse } from 'next/server';
import { type Address, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { sendWebhookMessage } from '@/lib/webhook';

interface CancelGameRequestRequest {
    walletAddress: string;
    signature: string;
    message: string;
    gameRequestId: number;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(request: NextRequest) {
    try {
        const { game_request_id, signature, message, wallet_address } = await request.json();
        console.log('Cancelling game request:', {
            game_request_id,
            signature,
            message,
            wallet_address
        });

        // Validate required fields
        if (!game_request_id || !signature || !message || !wallet_address) {
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

        // Validate game request ID
        if (game_request_id <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid game request ID' },
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
            functionName: 'cancelGameRequestRelayer',
            args: [wallet_address as Address, game_request_id],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        // const receipt = await publicClient.waitForTransactionReceipt({
        //     hash: result
        // });

        console.log('Cancelling game request with relayer:', {
            wallet_address,
            game_request_id,
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        return NextResponse.json({
            success: true,
            message: 'Game request cancelled successfully',
            data: {
                game_request_id,
                status: 'cancelled',
                transactionHash: paymasterReceipt.receipt.transactionHash
            }
        });

    } catch (error) {
        console.error('Error cancelling game request:', error);

        if (error instanceof BaseError) {
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                const errorName = revertError.data?.errorName ?? '';
                console.log("Contract error:", errorName);

                // Handle custom validation errors from contract
                switch (errorName) {
                    case 'DoesNotExist':
                        return NextResponse.json(
                            { success: false, error: 'Game request does not exist', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameOwnerShouldCall':
                        return NextResponse.json(
                            { success: false, error: 'Only the game request owner can cancel it', errorName: errorName },
                            { status: 400 }
                        );
                    case 'GameRequestNotExpired':
                        return NextResponse.json(
                            { success: false, error: 'Game request cannot be cancelled yet (wait 1 minute)', errorName: errorName },
                            { status: 400 }
                        );
                    default:
                        return NextResponse.json(
                            { success: false, error: 'Failed to cancel game request', errorName: errorName },
                            { status: 400 }
                        );
                        break;
                }
            }
        }

        // Provide user-friendly error messages
        let errorMessage = 'Failed to cancel game request';
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
