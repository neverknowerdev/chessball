import React, { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { authUserWithSignature } from '@/lib/auth';
import { toast } from 'react-toastify';

interface WaitingRoom {
  id: number;
  created_at: string;
  minimum_elo_rating: number;
  status: string;
  guest_team_id: number | null;
  host_team: {
    id: number;
    name: string;
    elo_rating: number;
    country: number;
  };
}

interface LobbyScreenProps {
  userTeamId: number;
  userTeamElo: number;
  onClose: () => void;
  onRoomSelected: (roomId: number) => void;
}

export default function LobbyScreen({ 
  userTeamId, 
  userTeamElo,
  onClose,
  onRoomSelected 
}: LobbyScreenProps) {
  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [minimumElo, setMinimumElo] = useState(0);
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Fetch rooms
  const fetchRooms = async () => {
    try {
      const response = await fetch('/api/waiting-rooms/list');
      const data = await response.json();
      
      if (data.success) {
        setRooms(data.rooms);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  // Create new room
  const handleCreateRoom = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    setCreating(true);
    try {
      const { signature, message } = await authUserWithSignature(address, signMessageAsync);
      
      const response = await fetch('/api/waiting-rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: userTeamId,
          minimum_elo_rating: minimumElo * 100, // Convert to internal format
          wallet_address: address,
          signature,
          message
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Room created!');
        setShowCreateModal(false);
        setMinimumElo(0);
        onRoomSelected(data.room.id);
      } else {
        toast.error(data.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  // Join room
  const handleJoinRoom = (roomId: number) => {
    onRoomSelected(roomId);
  };

  const formatElo = (elo: number) => (elo / 100).toFixed(2);

  return (
    <>
      {/* Main Lobby Modal */}
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gradient-to-b from-blue-900 to-purple-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-white/20">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Game Lobby</h1>
                <p className="text-blue-200 text-sm">Find an opponent or create your own room</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-200 transition-colors p-2 rounded-lg hover:bg-white/10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Create Room Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="mb-6 w-full bg-green-600 text-white px-6 py-4 rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Room
            </button>

            {/* Rooms List */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-white mx-auto mb-4"></div>
                <p className="text-white">Loading rooms...</p>
              </div>
            ) : rooms.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-12 text-center">
                <svg className="w-16 h-16 text-white/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-white text-lg mb-2">No rooms available</p>
                <p className="text-blue-200">Be the first to create a room!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {rooms.map((room) => {
                  const canJoin = !room.guest_team_id && 
                                 room.host_team.id !== userTeamId &&
                                 userTeamElo >= room.minimum_elo_rating;
                  const isFull = !!room.guest_team_id;
                  
                  return (
                    <div
                      key={room.id}
                      className={`bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 transition-all ${
                        isFull 
                          ? 'border-yellow-500/30' 
                          : 'border-white/20 hover:border-white/40'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                              {room.host_team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-white">{room.host_team.name}</h3>
                              <p className="text-blue-200 text-sm">
                                ELO {formatElo(room.host_team.elo_rating)}
                              </p>
                            </div>
                            {isFull && (
                              <span className="ml-2 px-3 py-1 bg-yellow-500/20 text-yellow-200 rounded-full text-xs font-semibold">
                                WAITING FOR START
                              </span>
                            )}
                          </div>
                          
                          <div className="flex gap-4 text-sm text-blue-200">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {new Date(room.created_at).toLocaleTimeString()}
                            </span>
                            {room.minimum_elo_rating > 0 && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Min ELO: {formatElo(room.minimum_elo_rating)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={!canJoin && room.host_team.id !== userTeamId}
                          className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                            room.host_team.id === userTeamId
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : canJoin
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                          }`}
                        >
                          {room.host_team.id === userTeamId 
                            ? 'View Room'
                            : canJoin 
                            ? 'Join'
                            : isFull
                            ? 'Full'
                            : 'Cannot Join'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Room</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum ELO Rating (Optional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumElo}
                onChange={(e) => setMinimumElo(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
              <p className="text-sm text-gray-500 mt-1">
                Only teams with ELO ≥ {minimumElo.toFixed(2)} can join
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setMinimumElo(0);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRoom}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}