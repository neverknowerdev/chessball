import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ADDRESS, CONTRACT_ABI, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { parseEventLogs } from 'viem';
import { sendWebhookMessage } from '@/lib/webhook';

/**
 * Finish Game By Timeout Endpoint
 * 
 * This endpoint allows authorized users to finish a game by timeout using the
 * finishGameByTimeoutRelayer function. It simulates the transaction first to
 * ensure it will succeed, then executes it using the relayer client.
 */

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

// Interface for the request body
interface FinishGameByTimeoutRequest {
    game_id: string;
    wallet_address: string;
    signature: string;
    message: string;
}

export async function POST(request: NextRequest) {
    try {
        const body: FinishGameByTimeoutRequest = await request.json();

        // Validate required fields
        if (!body.game_id || !body.wallet_address || !body.signature || !body.message) {
            return NextResponse.json(
                { error: 'Missing required fields', errorName: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        // Validate game_id is a valid number
        if (isNaN(Number(body.game_id)) || Number(body.game_id) <= 0) {
            return NextResponse.json(
                { error: 'Invalid game ID', errorName: 'INVALID_GAME_ID' },
                { status: 400 }
            );
        }

        // Authenticate user
        const isAuthenticated = await checkAuthSignatureAndMessage(
            body.wallet_address,
            body.signature,
            body.message
        );

        if (!isAuthenticated) {
            return NextResponse.json(
                { error: 'Authentication failed', errorName: 'AUTH_FAILED' },
                { status: 401 }
            );
        }

        console.log('Processing finish game by timeout for game:', body.game_id);
        console.log('User wallet:', body.wallet_address);

        // Simulate the transaction first to ensure it will succeed
        console.log('Simulating finishGameByTimeoutRelayer transaction...');
        const { request: simulationRequest } = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'finishGameByTimeoutRelayer',
            args: [body.wallet_address, BigInt(body.game_id)],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        console.log('Transaction simulation successful, executing...');

        // Execute the actual transaction using relayer client
        const paymasterReceipt = await sendTransactionWithRetry(simulationRequest);

        console.log('Game finished by timeout successfully. Transaction hash:', paymasterReceipt.receipt.transactionHash);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        if (paymasterReceipt.receipt.status === 'success') {
            return NextResponse.json({
                success: true,
                message: 'Game finished by timeout successfully',
                transactionHash: paymasterReceipt.receipt.transactionHash,
                gameId: body.game_id,
                blockNumber: paymasterReceipt.receipt.blockNumber,
                gasUsed: paymasterReceipt.receipt.gasUsed
            });
        } else {
            return NextResponse.json(
                { error: 'Transaction failed', errorName: 'TRANSACTION_FAILED', transactionHash: paymasterReceipt.receipt.transactionHash },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Error finishing game by timeout:', error);

        // Handle specific contract errors
        if (error.message?.includes('GameDoesNotExist')) {
            return NextResponse.json(
                { error: 'Game does not exist', errorName: 'GAME_DOES_NOT_EXIST' },
                { status: 400 }
            );
        }

        if (error.message?.includes('GameIsNotActive')) {
            return NextResponse.json(
                { error: 'Game is not active', errorName: 'GAME_IS_NOT_ACTIVE' },
                { status: 400 }
            );
        }

        if (error.message?.includes('GameOwnerShouldCall')) {
            return NextResponse.json(
                { error: 'Only game participants can finish the game', errorName: 'NOT_GAME_OWNER' },
                { status: 400 }
            );
        }

        if (error.message?.includes('ActionsNotCommitted')) {
            return NextResponse.json(
                { error: 'No actions have been committed yet', errorName: 'NO_ACTIONS_COMMITTED' },
                { status: 400 }
            );
        }

        if (error.message?.includes('GameRequestTimeoutNotReached')) {
            return NextResponse.json(
                { error: 'Game timeout has not been reached yet', errorName: 'TIMEOUT_NOT_REACHED' },
                { status: 400 }
            );
        }

        if (error.message?.includes('FinishGameByTimeout_NoLastMove')) {
            return NextResponse.json(
                { error: 'Cannot finish game by timeout - no last move recorded', errorName: 'NO_LAST_MOVE' },
                { status: 400 }
            );
        }

        // Generic error response
        return NextResponse.json(
            {
                error: 'Failed to finish game by timeout',
                errorName: 'FINISH_GAME_FAILED',
                details: error.message || 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
