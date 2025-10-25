import React, { useEffect, useState } from 'react';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { joinOpponentFindingRoom, leaveOpponentFindingRoom, getOpponentFindingChannel, getCurrentChannelMembers, type OpponentFindingPresence } from '@/lib/ably';
import { authUserWithSignature } from '@/lib/auth';
import { useSignMessage } from 'wagmi';

interface SearchOpponentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCancel: () => void;
    userInfo: {
        team_name: string;
        team_id: number;
        user_wallet_address: string;
        username: string;
        elo_rating: number;
    } | null;
}

export const SearchOpponentModal: React.FC<SearchOpponentModalProps> = ({
    isOpen,
    onClose,
    onCancel,
    userInfo,
}) => {
    const [isSearching, setIsSearching] = useState(false);
    const [isOpponentFound, setIsOpponentFound] = useState(false);
    const [channel, setChannel] = useState<any>(null);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const { signMessageAsync } = useSignMessage();
    const { composeCast } = useComposeCast();

    // Generate shareable game URL
    const getGameUrl = () => {
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/`;
        }
        return '';
    };

    // Share via Base/Farcaster using useComposeCast
    const shareToBase = async () => {
        try {
            const gameUrl = getGameUrl();
            await composeCast({
                text: `🎮 Join my game! I'm looking for an opponent with ${userInfo?.elo_rating} ELO rating. Let's play! 🏆`,
                embeds: [gameUrl],
            });
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 3000);
        } catch (error) {
            console.error('Error sharing to Base:', error);
        }
    };

    // Share using Web Share API (native mobile/desktop sharing)
    const shareNative = async () => {
        const gameUrl = getGameUrl();
        const shareData = {
            title: `Join ${userInfo?.username}'s Game`,
            text: `🎮 Join my game! Looking for an opponent with ${userInfo?.elo_rating} ELO rating.`,
            url: gameUrl,
        };

        try {
            if (typeof navigator.share === 'function') {
                if (navigator.canShare && navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                } else if (!navigator.canShare) {
                    // canShare not supported, just try to share
                    await navigator.share(shareData);
                }
                setShareSuccess(true);
                setTimeout(() => setShareSuccess(false), 3000);
                setShowShareMenu(false);
            } else {
                // Fallback: copy to clipboard
                await copyToClipboard(gameUrl);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error('Error sharing:', error);
                // Fallback to clipboard
                await copyToClipboard(gameUrl);
            }
        }
    };

    // Copy link to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 3000);
            setShowShareMenu(false);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    // Share to specific platforms (fallback URLs)
    const shareToTwitter = () => {
        const gameUrl = getGameUrl();
        const text = encodeURIComponent(`🎮 Join my game! Looking for an opponent with ${userInfo?.elo_rating} ELO rating.`);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(gameUrl)}`, '_blank');
        setShowShareMenu(false);
    };

    const shareToTelegram = () => {
        const gameUrl = getGameUrl();
        const text = encodeURIComponent(`🎮 Join my game! Looking for an opponent with ${userInfo?.elo_rating} ELO rating. ${gameUrl}`);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${text}`, '_blank');
        setShowShareMenu(false);
    };

    const shareToWhatsApp = () => {
        const gameUrl = getGameUrl();
        const text = encodeURIComponent(`🎮 Join my game! Looking for an opponent with ${userInfo?.elo_rating} ELO rating. ${gameUrl}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
        setShowShareMenu(false);
    };

    // Function to create game request
    const createGameRequest = async (opponentMember: OpponentFindingPresence) => {
        if (!userInfo) return;
        console.log('Creating game request with opponent:', opponentMember);

        try {
            setIsOpponentFound(true);
            const { signature, message } = await authUserWithSignature(userInfo.user_wallet_address, signMessageAsync);
            console.log('Creating game request with opponent:', opponentMember);

            const response = await fetch('/api/game/create-game-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    team1_id: userInfo.team_id,
                    team2_id: opponentMember.team_id,
                    wallet_address: userInfo.user_wallet_address,
                    signature,
                    message
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('Failed to create game request:', result.error);
                setIsOpponentFound(false);
                return;
            }

            const gameRequestId = result.data.game_request_id;
            console.log('Game request created successfully:', result);

            setIsSearching(false);
            setIsOpponentFound(false);
            onClose();
        } catch (error) {
            console.error('Error creating game request:', error);
            setIsOpponentFound(false);
        }
    };

    // Join opponent finding room when modal opens
    useEffect(() => {
        if (isOpen && userInfo && !isSearching) {
            const joinRoom = async () => {
                try {
                    setIsSearching(true);

                    const presenceData: OpponentFindingPresence = {
                        ...userInfo,
                        timestamp: Date.now()
                    };

                    const members = await getCurrentChannelMembers();
                    console.log('Current channel members:', members);

                    if (members.length > 0) {
                        console.log('Already have members in the channel');
                        const oldestMember = members.sort((a, b) => a.timestamp - b.timestamp)[0];
                        console.log('Oldest member in channel:', oldestMember);
                        createGameRequest(oldestMember);
                        return;
                    }

                    const opponentChannel = await joinOpponentFindingRoom(presenceData);
                    setChannel(opponentChannel);

                    opponentChannel.presence.subscribe('enter', (member: any) => {
                        console.log('New user joined opponent finding room:', member.data);
                    });

                    opponentChannel.presence.subscribe('leave', (member: any) => {
                        console.log('User left opponent finding room:', member.data);
                    });

                    opponentChannel.presence.subscribe('update', (member: any) => {
                        console.log('User updated presence:', member.data);
                    });

                } catch (error) {
                    console.error('Failed to join opponent finding room:', error);
                    setIsSearching(false);
                }
            };

            joinRoom();
        }

        return () => {
            if (channel && !isOpen) {
                leaveOpponentFindingRoom();
                setChannel(null);
                setIsSearching(false);
            }
        };
    }, [isOpen, userInfo, isSearching]);

    // Handle cancel search
    const handleCancelSearch = async () => {
        if (channel) {
            await leaveOpponentFindingRoom();
            setChannel(null);
        }
        setIsSearching(false);
        setShowShareMenu(false);
        onCancel();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 relative">
                <div className="text-center">
                    {/* Search icon */}
                    <div className="mb-4">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${isOpponentFound ? 'bg-green-100' : 'bg-blue-100'}`}>
                            {isOpponentFound ? (
                                <svg className="w-8 h-8 text-green-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                <svg className="w-8 h-8 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                        </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {isOpponentFound ? 'Opponent Found!' : 'Searching for Opponent'}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-600 mb-6">
                        {isOpponentFound ? 'Inviting them to play...' : 'Looking for players with similar skill level...'}
                    </p>

                    {/* Progress indicator with animated ball */}
                    <div className="mb-6">
                        <div className="relative w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <img src="/ball.svg" alt="Ball" className="absolute top-0 w-3 h-3 ball-animation" />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <span>Searching...</span>
                            <span>2-5 min</span>
                        </div>
                    </div>

                    {/* Share Success Message */}
                    {shareSuccess && (
                        <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm text-green-700 font-medium">Shared successfully!</span>
                        </div>
                    )}

                    {/* Share Game Block */}
                    <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-800">Share game with friends</span>
                            </div>
                        </div>

                        {/* Primary Share Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Share to Base/Farcaster */}
                            <button
                                onClick={shareToBase}
                                className="flex items-center justify-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 transition-colors text-xs font-medium"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                                </svg>
                                Cast on Base
                            </button>

                            {/* Native Share or More Options */}
                            <button
                                onClick={() => setShowShareMenu(!showShareMenu)}
                                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                </svg>
                                More Options
                            </button>
                        </div>

                        {/* Share Menu Dropdown */}
                        {showShareMenu && (
                            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200 shadow-lg">
                                <div className="space-y-2">
                                    {/* Native Share */}
                                    {typeof navigator.share === 'function' && (
                                        <button
                                            onClick={shareNative}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            <span className="font-medium">Share via...</span>
                                        </button>
                                    )}

                                    {/* Copy Link */}
                                    <button
                                        onClick={() => copyToClipboard(getGameUrl())}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <span className="font-medium">Copy Link</span>
                                    </button>

                                    {/* Twitter/X */}
                                    <button
                                        onClick={shareToTwitter}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                        <span className="font-medium">Share on X</span>
                                    </button>

                                    {/* Telegram */}
                                    <button
                                        onClick={shareToTelegram}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                                        </svg>
                                        <span className="font-medium">Share on Telegram</span>
                                    </button>

                                    {/* WhatsApp */}
                                    <button
                                        onClick={shareToWhatsApp}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                        </svg>
                                        <span className="font-medium">Share on WhatsApp</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cancel button */}
                    <button
                        onClick={handleCancelSearch}
                        className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors font-medium mt-2"
                    >
                        Cancel Search
                    </button>
                </div>
            </div>

            {/* Custom CSS for ball animation */}
            <style jsx>{`
                .ball-animation {
                    animation: moveBall 8s linear infinite;
                }
                
                @keyframes moveBall {
                    0% {
                        left: 0;
                    }
                    100% {
                        left: calc(100% - 12px);
                    }
                }
            `}</style>
        </div>
    );
};