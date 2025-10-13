import { NextRequest, NextResponse } from 'next/server';
import { type Address, parseEventLogs } from 'viem';
import { publicClient } from '@/lib/providers';
import { sendTransactionWithRetry } from '@/lib/paymaster';
import { CONTRACT_ABI, CONTRACT_ADDRESS, RELAYER_ADDRESS } from '@/lib/contract';
import { base } from 'viem/chains';
import { checkAuthSignatureAndMessage } from '@/lib/auth';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { sendWebhookMessage } from '@/lib/webhook';

interface ChangeTeamNameRequest {
    walletAddress: string;
    signature: string;
    message: string;
    newTeamName: string;
}

(BigInt.prototype as any).toJSON = function () {
    return this.toString()
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body: ChangeTeamNameRequest = await req.json();
        const { walletAddress, signature, message, newTeamName } = body;

        // Log the received data to console
        console.log('=== API RECEIVED AUTHENTICATION DATA ===');
        console.log('Wallet Address:', walletAddress);
        console.log('Signature:', signature);
        console.log('Message:', message);
        console.log('New Team Name:', newTeamName);
        console.log('Timestamp:', new Date().toISOString());
        console.log('=====================================');

        // Validate input data
        if (!walletAddress || !newTeamName) {
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

        // Validate team name length
        if (newTeamName.length === 0 || newTeamName.length > 100) {
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
            functionName: 'changeTeamNameRelayer',
            args: [walletAddress as Address, newTeamName],
            chain: base,
            account: RELAYER_ADDRESS
        });

        const paymasterReceipt = await sendTransactionWithRetry(simulation.request);

        const logs = parseEventLogs({
            abi: CONTRACT_ABI,
            logs: paymasterReceipt.logs,
        });

        await sendWebhookMessage(logs);

        console.log('Changing team name with relayer:', {
            walletAddress,
            newTeamName,
            contractAddress: CONTRACT_ADDRESS
        });

        console.log('Transaction sent successfully:', paymasterReceipt.receipt.transactionHash);

        return NextResponse.json({
            success: true,
            message: 'Team name changed successfully',
            transactionHash: paymasterReceipt.receipt.transactionHash
        });

    } catch (error) {
        console.error('Error in change-team-name API:', error);

        if (error instanceof BaseError) {
            console.log("error is a BaseError");
            const revertError = error.walk(err => err instanceof ContractFunctionRevertedError)
            if (revertError instanceof ContractFunctionRevertedError) {
                console.log("revertError", revertError);
                const errorName = revertError.data?.errorName ?? '';
                console.log("errorName", errorName);
                // Handle custom validation errors from contract simulation
                switch (errorName) {
                    case 'ChangeTeamName_NameIsRequired':
                        return NextResponse.json(
                            { success: false, error: 'Team name is required by the contract', errorName: errorName },
                            { status: 400 }
                        );
                    case 'ChangeTeamName_TeamDoesNotExist':
                        return NextResponse.json(
                            { success: false, error: 'Team does not exist', errorName: errorName },
                            { status: 400 }
                        );
                    case 'ChangeTeamName_TeamNameAlreadyExists':
                        return NextResponse.json(
                            { success: false, error: 'This team name is already taken. Please choose a different name.', errorName: errorName },
                            { status: 400 }
                        );
                    case 'ChangeTeamName_Unauthorized':
                        return NextResponse.json(
                            { success: false, error: 'You are not authorized to change this team name', errorName: errorName },
                            { status: 403 }
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
            } else if (error.message.includes("Team does not exist")) {
                errorMessage = "Team does not exist. Please create a team first.";
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