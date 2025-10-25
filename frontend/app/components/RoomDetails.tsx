import React, { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { authUserWithSignature } from '@/lib/auth';
import { toast } from 'react-toastify';

interface Team {
    id: number;
    name: string;
    elo_rating: number;
    country: number;
    primary_wallet: string;
}

interface Room {
    id: number;
    created_at: string;
    minimum_elo_rating: number;
    status: string;
    guest_team_id: number | null;
    game_request_id: number | null;
    host_team: Team;
    guest_team: Team | null;
}

interface RoomDetailsProps {
    roomId: number;
    userTeamId: number;
    onBack: () => void;
    onGameStarting: (gameRequestId: number) => void;
}

export default function RoomDetails({
    roomId,
    userTeamId,
    onBack,
    onGameStarting
}: RoomDetailsProps) {
    const [room, setRoom] = useState<Room | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { composeCast } = useComposeCast();

    // Check if user is host
    const isHost = room?.host_team.id === userTeamId;

    // Fetch room details
    const fetchRoom = async () => {
        try {
            const response = await fetch(`/api/waiting-rooms/${roomId}`);
            const data = await response.json();

            if (data.success) {
                setRoom(data.room);

                // Check if game request was created
                if (data.room.game_request_id) {
                    onGameStarting(data.room.game_request_id);
                }
            } else {
                toast.error('Room not found');
                onBack();
            }
        } catch (error) {
            console.error('Error fetching room:', error);
            toast.error('Failed to load room details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoom();

        // Generate share URL
        if (typeof window !== 'undefined') {
            setShareUrl(`${window.location.origin}/room/${roomId}`);
        }

        // Poll for updates every 3 seconds
        const interval = setInterval(fetchRoom, 3000);
        return () => clearInterval(interval);
    }, [roomId]);

    // Share via Base/Farcaster using useComposeCast
    const shareToBase = async () => {
        if (!room) return;
        try {
            await composeCast({
                text: `🎮 Join my TactiBall game room! ${room.host_team.name} is waiting for an opponent. ${room.minimum_elo_rating > 0 ? `Min ELO: ${formatElo(room.minimum_elo_rating)}` : 'All skill levels welcome!'} 🏆`,
                embeds: [shareUrl],
            });
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 3000);
            setShowShareMenu(false);
        } catch (error) {
            console.error('Error sharing to Base:', error);
        }
    };

    // Share using Web Share API (native mobile/desktop sharing)
    const shareNative = async () => {
        if (!room) return;
        const shareData = {
            title: `Join ${room.host_team.name}'s Game Room`,
            text: `🎮 Join my TactiBall game room! ${room.minimum_elo_rating > 0 ? `Min ELO: ${formatElo(room.minimum_elo_rating)}` : 'All skill levels welcome!'}`,
            url: shareUrl,
        };

        try {
            if (typeof navigator.share === 'function') {
                if (navigator.canShare && navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                } else if (!navigator.canShare) {
                    await navigator.share(shareData);
                }
                setShareSuccess(true);
                setTimeout(() => setShareSuccess(false), 3000);
                setShowShareMenu(false);
            } else {
                await copyToClipboard(shareUrl);
            }
        } catch (error) {
            if (error instanceof Error && error.name !== 'AbortError') {
                console.error('Error sharing:', error);
                await copyToClipboard(shareUrl);
            }
        }
    };

    // Copy link to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Room link copied to clipboard!');
            setShareSuccess(true);
            setTimeout(() => setShareSuccess(false), 3000);
            setShowShareMenu(false);
        } catch (error) {
            console.error('Failed to copy:', error);
            toast.error('Failed to copy link');
        }
    };

    // Share to specific platforms
    const shareToTwitter = () => {
        if (!room) return;
        const text = encodeURIComponent(`🎮 Join my TactiBall game room! ${room.host_team.name} is waiting for an opponent. ${room.minimum_elo_rating > 0 ? `Min ELO: ${formatElo(room.minimum_elo_rating)}` : 'All skill levels welcome!'}`);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank');
        setShowShareMenu(false);
    };

    const shareToTelegram = () => {
        if (!room) return;
        const text = encodeURIComponent(`🎮 Join my TactiBall game room! ${room.host_team.name} is waiting. ${shareUrl}`);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${text}`, '_blank');
        setShowShareMenu(false);
    };

    const shareToWhatsApp = () => {
        if (!room) return;
        const text = encodeURIComponent(`🎮 Join my TactiBall game room! ${room.host_team.name} is waiting for an opponent. ${shareUrl}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
        setShowShareMenu(false);
    };

    // Main share button handler
    const handleShare = async () => {
        setShowShareMenu(!showShareMenu);
    };

    // Join room
    const handleJoin = async () => {
        if (!address) {
            toast.error('Please connect your wallet');
            return;
        }

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch(`/api/waiting-rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team_id: userTeamId,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                toast.success('Joined room!');
                fetchRoom();
            } else {
                toast.error(data.error || 'Failed to join room');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            toast.error('Failed to join room');
        } finally {
            setProcessing(false);
        }
    };

    // Leave room
    const handleLeave = async () => {
        if (!address) return;

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch(`/api/waiting-rooms/${roomId}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team_id: userTeamId,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                toast.success(isHost ? 'Room cancelled' : 'Left room');
                onBack();
            } else {
                toast.error(data.error || 'Failed to leave room');
            }
        } catch (error) {
            console.error('Error leaving room:', error);
            toast.error('Failed to leave room');
        } finally {
            setProcessing(false);
        }
    };

    // Create game request (when both teams are ready)
    const handleStartGame = async () => {
        if (!address || !room?.guest_team_id) return;

        setProcessing(true);
        try {
            const { signature, message } = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch('/api/game/create-game-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    team1_id: room.host_team.id,
                    team2_id: room.guest_team_id,
                    wallet_address: address,
                    signature,
                    message
                })
            });

            const data = await response.json();

            if (data.success) {
                // Update room with game request ID
                await fetch(`/api/waiting-rooms/${roomId}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        game_request_id: data.data.gameRequestId
                    })
                });

                toast.success('Starting game...');
                onGameStarting(data.data.gameRequestId);
            } else {
                toast.error(data.error || 'Failed to start game');
            }
        } catch (error) {
            console.error('Error starting game:', error);
            toast.error('Failed to start game');
        } finally {
            setProcessing(false);
        }
    };

    const formatElo = (elo: number) => (elo / 100).toFixed(2);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gradient-to-b from-blue-900 to-purple-900 rounded-xl p-8 max-w-md w-full text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white mx-auto mb-4"></div>
                    <p className="text-white text-lg">Loading room...</p>
                </div>
            </div>
        );
    }

    if (!room) {
        return null;
    }

    const canJoin = !room.guest_team_id && !isHost;
    const isFull = !!room.guest_team_id;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-b from-blue-900 to-purple-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-white/20">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white/10"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>
                        <div className="flex-1">
                            <h1 className="text-2xl font-bold text-white">Game Room</h1>
                            <p className="text-blue-200 text-sm">Room #{roomId}</p>
                        </div>
                        <div className="relative">
                            <button
                                onClick={handleShare}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                                </svg>
                                Share
                            </button>

                            {/* Share Menu Dropdown */}
                            {showShareMenu && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                                    {/* Share Success Message */}
                                    {shareSuccess && (
                                        <div className="m-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center gap-2">
                                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-sm text-green-700 font-medium">Shared!</span>
                                        </div>
                                    )}

                                    <div className="p-2 space-y-1">
                                        {/* Cast on Base */}
                                        <button
                                            onClick={shareToBase}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 rounded-md transition-colors"
                                        >
                                            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                                            </svg>
                                            <span className="font-medium">Cast on Base</span>
                                        </button>

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

                                        <div className="border-t border-gray-200 my-1"></div>

                                        {/* Copy Link */}
                                        <button
                                            onClick={() => copyToClipboard(shareUrl)}
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
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Room Info Card */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 border-2 border-white/20">
                        <div className="mb-4">
                            <h2 className="text-xl font-bold text-white mb-2">Room Settings</h2>
                            {room.minimum_elo_rating > 0 && (
                                <p className="text-blue-200 text-sm">
                                    Minimum ELO: {formatElo(room.minimum_elo_rating)}
                                </p>
                            )}
                        </div>
                        <p className="text-blue-200 text-sm">
                            Created {new Date(room.created_at).toLocaleString()}
                        </p>
                    </div>

                    {/* Teams */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Host Team */}
                        <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 ${isHost ? 'border-yellow-500' : 'border-white/20'
                            }`}>
                            <div className="text-center">
                                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
                                    {room.host_team.name.substring(0, 2).toUpperCase()}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">{room.host_team.name}</h3>
                                <p className="text-blue-200 text-sm mb-2">ELO {formatElo(room.host_team.elo_rating)}</p>
                                <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-200 rounded-full text-xs font-semibold">
                                    HOST {isHost && '(You)'}
                                </span>
                            </div>
                        </div>

                        {/* Guest Team or Empty Slot */}
                        {room.guest_team ? (
                            <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 ${!isHost && room.guest_team.id === userTeamId ? 'border-yellow-500' : 'border-white/20'
                                }`}>
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">
                                        {room.guest_team.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-1">{room.guest_team.name}</h3>
                                    <p className="text-blue-200 text-sm mb-2">ELO {formatElo(room.guest_team.elo_rating)}</p>
                                    <span className="inline-block px-3 py-1 bg-red-500/20 text-red-200 rounded-full text-xs font-semibold">
                                        GUEST {!isHost && room.guest_team.id === userTeamId && '(You)'}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border-2 border-dashed border-white/30 flex items-center justify-center">
                                <div className="text-center">
                                    <svg className="w-12 h-12 text-white/30 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <p className="text-white/50 text-sm">Waiting for opponent...</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status Message */}
                    {isFull && (
                        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
                            <p className="text-green-200 text-center font-semibold">
                                🎮 Room is full! Ready to start the game.
                            </p>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="p-6 border-t border-white/20">
                    <div className="flex gap-4">
                        {canJoin ? (
                            <>
                                <button
                                    onClick={onBack}
                                    className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleJoin}
                                    disabled={processing}
                                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processing ? 'Joining...' : 'Join Room'}
                                </button>
                            </>
                        ) : isFull && isHost ? (
                            <>
                                <button
                                    onClick={handleLeave}
                                    disabled={processing}
                                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processing ? 'Cancelling...' : 'Cancel Room'}
                                </button>
                                <button
                                    onClick={handleStartGame}
                                    disabled={processing}
                                    className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {processing ? 'Starting...' : 'Start Game'}
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleLeave}
                                disabled={processing}
                                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Leaving...' : isHost ? 'Cancel Room' : 'Leave Room'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Click outside to close share menu */}
            {showShareMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowShareMenu(false)}
                />
            )}
        </div>
    );
}