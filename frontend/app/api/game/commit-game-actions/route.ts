import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { publicClient } from '@/lib/providers';
import { parseEventLogs, Log } from 'viem';
import { CONTRACT_ADDRESS, CONTRACT_ABI, getGameFromContract, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { chain } from '@/config/chains';
import { decodeSymmetricKey, encodeData, bigintToBuffer } from '@/lib/encrypting';
import { sendWebhookMessage } from '@/lib/webhook';
import { FIELD_HEIGHT, FIELD_WIDTH, MoveType, serializeMoves, TeamEnum } from '@/lib/game';
import { sendTransactionWithRetry } from '@/lib/paymaster';

/**
 * Game Actions Commit Endpoint
 * 
 * This endpoint validates game actions and directly calls the smart contract
 * using commitGameActions function. It simulates the transaction first
 * to ensure it will succeed, then executes it using the relayer client.
 */
(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

// Interface for the request body
interface CommitGameActionsRequest {
    game_id: string;
    team_id: string;
    team_enum: number; // 1 for team1, 2 for team2
    wallet_address: string;
    signature: string;
    message: string;
    moves: Array<{
        playerId: number;
        moveType: string; // 0: PASS, 1: TACKLE, 2: RUN, 3: SHOT
        oldPosition: { x: number; y: number };
        newPosition: { x: number; y: number };
    }>;
}

export async function POST(request: NextRequest) {
    try {
        const body: CommitGameActionsRequest = await request.json();

        // Validate required fields
        if (!body.game_id || !body.team_id || !body.team_enum || !body.wallet_address || !body.signature || !body.message || !body.moves) {
            return NextResponse.json(
                { error: 'Missing required fields', errorName: 'MISSING_FIELDS' },
                { status: 400 }
            );
        }

        // Validate team enum
        if (body.team_enum !== 1 && body.team_enum !== 2) {
            return NextResponse.json(
                { error: 'Invalid team enum. Must be 1 (team1) or 2 (team2)', errorName: 'INVALID_TEAM_ENUM' },
                { status: 400 }
            );
        }

        // Validate moves array
        if (!Array.isArray(body.moves) || body.moves.length === 0) {
            return NextResponse.json(
                { error: 'Moves array must be non-empty', errorName: 'EMPTY_MOVES' },
                { status: 400 }
            );
        }

        // Validate each move
        for (const move of body.moves) {
            if (typeof move.playerId !== 'number' ||
                !move.oldPosition || !move.newPosition ||
                typeof move.oldPosition.x !== 'number' || typeof move.oldPosition.y !== 'number' ||
                typeof move.newPosition.x !== 'number' || typeof move.newPosition.y !== 'number') {
                return NextResponse.json(
                    { error: 'Invalid move data structure', errorName: 'INVALID_MOVE_DATA' },
                    { status: 400 }
                );
            }

            if (move.moveType != "pass" && move.moveType != "tackle" && move.moveType != "run" && move.moveType != "shot") {
                return NextResponse.json(
                    { error: 'Invalid move type. Must be PASS, TACKLE, RUN, SHOT', errorName: 'INVALID_MOVE_TYPE' },
                    { status: 400 }
                );
            }

            // Validate positions (assuming field dimensions)
            if (move.oldPosition.x < 0 || move.oldPosition.x > FIELD_WIDTH + 1 || move.oldPosition.y < 0 || move.oldPosition.y > FIELD_HEIGHT ||
                move.newPosition.x < 0 || move.newPosition.x > FIELD_WIDTH + 1 || move.newPosition.y < 0 || move.newPosition.y > FIELD_HEIGHT) {
                return NextResponse.json(
                    { error: 'Invalid position coordinates', errorName: 'INVALID_POSITION' },
                    { status: 400 }
                );
            }
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

        const gameInfo = await getGameFromContract(body.game_id);
        if (!gameInfo.success) {
            return NextResponse.json(
                { error: 'Game not found', errorName: 'GAME_NOT_FOUND' },
                { status: 404 }
            );
        }

        console.log('Processing game actions commit for game:', body.game_id);
        console.log('Team:', body.team_enum === 1 ? 'Team 1' : 'Team 2');
        console.log('Number of moves:', body.moves.length);

        const gameEnginePrivateKey = process.env.GAME_ENGINE_PRIVATE_KEY || process.env.TESTNET_GAME_ENGINE_PRIVATE_KEY;
        if (!gameEnginePrivateKey) {
            throw new Error('GAME_ENGINE_PRIVATE_KEY is not set');
        }

        const userMoves = body.moves.map(move => ({
            playerId: move.playerId,
            moveType: move.moveType as MoveType,
            oldPosition: { x: move.oldPosition.x, y: move.oldPosition.y },
            newPosition: { x: move.newPosition.x, y: move.newPosition.y },
            teamEnum: body.team_enum === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2,
            playerKey: () => `${body.team_enum === 1 ? '1_' : '2_'}${move.playerId}`
        }));

        console.log('userMoves', body.team_enum, body.moves);

        // Decrypt the symmetric key using the game engine's private key
        // Convert hex string (from contract bytes) to Buffer for decryption
        const encryptedKeyBuffer = Buffer.from(gameInfo.data.encryptedKey.slice(2), 'hex'); // Remove '0x' prefix
        const symmetricKey = decodeSymmetricKey(encryptedKeyBuffer, gameEnginePrivateKey);

        // Serialize moves to BigInt and encrypt them
        const serializedMoves = serializeMoves(userMoves);
        const movesBigInt = BigInt(serializedMoves);
        const movesBuffer = bigintToBuffer(movesBigInt);
        const encryptedMovesBuffer = encodeData(movesBuffer, gameInfo.data.gameState.movesMade, symmetricKey);

        // Convert to hex string for contract
        const encryptedMoves = '0x' + encryptedMovesBuffer.toString('hex').padStart(64, '0');


        // Simulate the transaction first to ensure it will succeed
        console.log('Simulating commitGameActions transaction...');
        console.log('body.wallet_address', body.wallet_address);
        console.log('body.game_id', body.game_id);
        console.log('body.team_enum', body.team_enum);
        console.log('encryptedMoves', encryptedMoves);
        const { request: simulationRequest } = await publicClient.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'commitGameActionsRelayer',
            args: [body.wallet_address, body.game_id, body.team_enum, encryptedMoves, gameInfo.data.gameState.movesMade + 1],
            chain: chain,
            account: RELAYER_ADDRESS
        });

        console.log('Transaction simulation successful, executing...');
        console.log('simulationRequest', simulationRequest)

        // Execute the transaction using the retry logic
        const paymasterReceipt = await sendTransactionWithRetry(simulationRequest);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        const gameActionCommittedLog: Log = logs.find(log => log.eventName === 'gameActionCommitted') as Log;

        console.log('gameActionCimmitted?', gameActionCommittedLog);

        await sendWebhookMessage(logs);
        // two players made moves - need to calculate

        if (paymasterReceipt.receipt.status === 'success') {
            return NextResponse.json({
                success: true,
                message: 'Game actions committed successfully to blockchain',
                transactionHash: paymasterReceipt.receipt.transactionHash,
                gameId: body.game_id,
                teamEnum: body.team_enum,
                movesCount: body.moves.length,
                blockNumber: Number(paymasterReceipt.receipt.blockNumber),
                gasUsed: Number(paymasterReceipt.receipt.gasUsed),
                isTwoTeamCommited: gameActionCommittedLog ? true : false
            });
        } else {
            return NextResponse.json(
                { error: 'Transaction failed', errorName: 'TRANSACTION_FAILED', transactionHash: paymasterReceipt.receipt.transactionHash },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error('Error committing game actions:', error);
        console.error('Error details:', error.details);
        console.error('Error message:', error.message);

        // Handle specific contract errors
        if (error.message?.includes('GameDoesNotExist')) {
            return NextResponse.json(
                { error: 'Game does not exist', errorName: 'GAME_DOES_NOT_EXIST' },
                { status: 400 }
            );
        }

        // Handle gas/transaction errors
        if (error.message?.includes('transaction underpriced') || error.message?.includes('gas')) {
            return NextResponse.json(
                { error: 'Transaction failed due to gas issues. Please try again.', errorName: 'GAS_ERROR' },
                { status: 500 }
            );
        }

        if (error.message?.includes('TeamNotInGame')) {
            return NextResponse.json(
                { error: 'Team is not part of this game', errorName: 'TEAM_NOT_IN_GAME' },
                { status: 400 }
            );
        }

        if (error.message?.includes('NotTeamTurn')) {
            return NextResponse.json(
                { error: 'Not your team\'s turn', errorName: 'NOT_TEAM_TURN' },
                { status: 400 }
            );
        }

        if (error.message?.includes('InvalidMove')) {
            return NextResponse.json(
                { error: 'Invalid move detected', errorName: 'INVALID_MOVE' },
                { status: 400 }
            );
        }

        if (error.message?.includes('GameAlreadyFinished')) {
            return NextResponse.json(
                { error: 'Game is already finished', errorName: 'GAME_ALREADY_FINISHED' },
                { status: 400 }
            );
        }

        // Generic error response
        return NextResponse.json(
            {
                error: 'Failed to commit game actions',
                errorName: 'COMMIT_FAILED',
                details: error.message || 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
