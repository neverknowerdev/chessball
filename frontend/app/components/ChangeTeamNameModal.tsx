"use client";

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

interface ChangeTeamNameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    currentTeamName: string;
    walletAddress?: string;
}

export function ChangeTeamNameModal({
    isOpen,
    onClose,
    onSuccess,
    currentTeamName,
    walletAddress
}: ChangeTeamNameModalProps) {
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();

    // Use provided walletAddress or fall back to connected address
    const activeAddress = walletAddress || address;

    const [teamName, setTeamName] = useState(currentTeamName);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setTeamName(currentTeamName);
            setError(null);
        }
    }, [isOpen, currentTeamName]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        const trimmedName = teamName.trim();

        if (!trimmedName) {
            setError('Team name cannot be empty');
            return;
        }

        if (trimmedName.length < 3) {
            setError('Team name must be at least 3 characters long');
            return;
        }

        if (trimmedName.length > 100) {
            setError('Team name must be less than 100 characters');
            return;
        }

        if (trimmedName === currentTeamName) {
            setError('New name must be different from current name');
            return;
        }

        if (!activeAddress) {
            setError('Please connect your wallet');
            return;
        }

        setIsLoading(true);

        try {
            // Create message for signing
            const timestamp = Date.now();
            const message = `Change team name to: ${trimmedName}\nTimestamp: ${timestamp}`;

            // Sign the message
            const signature = await signMessageAsync({ message });

            // Log authentication data
            console.log('=== CHANGE TEAM NAME AUTHENTICATION ===');
            console.log('Wallet Address:', activeAddress);
            console.log('Message:', message);
            console.log('Signature:', signature);
            console.log('New Team Name:', trimmedName);
            console.log('Timestamp:', new Date(timestamp).toISOString());
            console.log('=====================================');

            // Call the API
            const response = await fetch('/api/change-team-name', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress: activeAddress,
                    signature,
                    message,
                    newTeamName: trimmedName,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to change team name');
            }

            console.log('Team name changed successfully:', data);

            // Success callback
            if (onSuccess) {
                onSuccess();
            }

            // Close modal
            onClose();

            // Optional: Show success toast/notification
            // toast.success('Team name changed successfully!');

        } catch (err) {
            console.error('Error changing team name:', err);

            if (err instanceof Error) {
                if (err.message.includes('User rejected')) {
                    setError('Signature request was rejected');
                } else if (err.message.includes('already taken')) {
                    setError('This team name is already taken. Please choose a different name.');
                } else if (err.message.includes('does not exist')) {
                    setError('Team does not exist. Please create a team first.');
                } else if (err.message.includes('not authorized')) {
                    setError('You are not authorized to change this team name');
                } else {
                    setError(err.message);
                }
            } else {
                setError('Failed to change team name. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-900">Change Team Name</h2>
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Current Name
                            </label>
                            <div className="px-4 py-2 bg-gray-100 rounded-lg text-gray-600">
                                {currentTeamName}
                            </div>
                        </div>

                        <div className="mb-6">
                            <label htmlFor="newTeamName" className="block text-sm font-medium text-gray-700 mb-2">
                                New Team Name *
                            </label>
                            <input
                                type="text"
                                id="newTeamName"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                disabled={isLoading}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                                placeholder="Enter new team name"
                                maxLength={100}
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                {teamName.trim().length}/100 characters
                            </p>
                            {error && (
                                <p className="mt-2 text-sm text-red-600">{error}</p>
                            )}
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                            <div className="flex items-start">
                                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <p className="text-sm text-yellow-800 font-medium">Important</p>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        You'll be asked to sign a message to verify ownership. Changing your team name is permanent and cannot be undone.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading || !teamName.trim() || teamName.trim() === currentTeamName || !activeAddress}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Changing...
                                    </>
                                ) : (
                                    'Change Name'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}