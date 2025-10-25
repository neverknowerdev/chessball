"use client";

import {
  useMiniKit,
  useAuthenticate,
  useAddFrame,
  useOpenUrl,
} from "@coinbase/onchainkit/minikit";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAccount, useSignMessage, useChainId, useSwitchChain } from "wagmi";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { SearchOpponentModal } from "./components/SearchOpponentModal";
import { GameRequestModal } from "./components/GameRequestModal";
import { subscribeToTeamChannel, unsubscribeFromTeamChannel } from '@/lib/ably';
import { getName } from "@coinbase/onchainkit/identity";
import { base } from 'viem/chains';
import { chain as configuredChain } from '@/config/chains';
import { authUserWithSignature, clearCachedAuthSignature } from '@/lib/auth';
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import countryList from '../public/countryList.json';
import React from "react";
import { LastGameResults } from './components/LastGameResults';
import { Leaderboard } from './components/Leaderboard';
import { GlobalStats } from './components/GlobalStats';
import LobbyScreen from './components/LobbyScreen';
import RoomDetails from './components/RoomDetails';
import moment from "moment";

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isSearchOpponentModalOpen, setIsSearchOpponentModalOpen] = useState(false);
  const [isGameRequestModalOpen, setIsGameRequestModalOpen] = useState(false);
  const [gameRequestData, setGameRequestData] = useState<{
    game_request_id: string;
    team1_info: any;
    team2_info: any;
  } | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const addFrame = useAddFrame();
  const openUrl = useOpenUrl();
  const [showLobby, setShowLobby] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

  // Function to map chain ID to network name
  const getNetworkName = (chainId: number): string => {
    const networks: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      3: 'Ropsten Testnet',
      4: 'Rinkeby Testnet',
      5: 'Goerli Testnet',
      10: 'Optimism',
      42: 'Kovan Testnet',
      56: 'BSC Mainnet',
      97: 'BSC Testnet',
      137: 'Polygon Mainnet',
      80001: 'Polygon Mumbai',
      8453: 'Base Mainnet',
      84532: 'Base Sepolia',
      11155111: 'Sepolia Testnet',
    };
    return networks[chainId] || `Unknown Network (Chain ID: ${chainId})`;
  };

  // Function to switch to configured chain
  const switchToConfiguredChain = useCallback(async () => {
    if (chainId !== configuredChain.id) {
      try {
        console.log(`🔄 Switching from ${getNetworkName(chainId)} to ${getNetworkName(configuredChain.id)}`);
        await switchChain({ chainId: configuredChain.id });
        console.log(`✅ Successfully switched to ${getNetworkName(configuredChain.id)}`);
      } catch (error) {
        console.error('❌ Failed to switch chain:', error);
        toast.error(`Failed to switch to ${getNetworkName(configuredChain.id)}. Please switch manually.`, {
          position: "top-center",
          autoClose: 5000,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });
      }
    }
  }, [chainId, switchChain]);

  // Load stats from localStorage on mount
  useEffect(() => {
    try {
      if (localStorage.getItem('userTeam')) {
        setTeamInfo(JSON.parse(localStorage.getItem('userTeam') || '{}'));
      }
    } catch (error) {
      console.error('Error loading team from localStorage:', error);
    }
  }, []);



  // Fetch global statistics

  // Fetch username from onchain identity
  const fetchUsername = useCallback(async (walletAddress: string) => {
    console.log('fetchUsername', walletAddress);

    console.log('context', context);
    if (context?.user?.username) {
      setUsername(context?.user?.username);
      return;
    }

    const savedUsername = localStorage.getItem('user_basename');
    const savedAddress = localStorage.getItem('user_address');
    if (savedAddress && savedAddress === walletAddress.toLowerCase()) {
      setUsername(savedUsername);
      return;
    }

    try {
      let nameResult = await getName({ address: walletAddress as `0x${string}`, chain: base });
      console.log('nameResult', nameResult);
      // Trim .eth and .base suffixes if present
      if (nameResult && typeof nameResult === 'string') {
        if (nameResult) {
          nameResult = nameResult.replace(/\.eth$/i, '').replace(/\.base$/i, '');
        }
        setUsername(nameResult);
      } else {
        // Fallback to shortened address if no name found
        nameResult = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setUsername(nameResult);
      }

      localStorage.setItem('user_basename', nameResult);
      localStorage.setItem('user_address', walletAddress.toLowerCase());
    } catch (error) {
      console.error('Error fetching username:', error);
      // Fallback to shortened address on error
      setUsername(`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    }
  }, []);

  // Fetch team info when wallet connects
  const fetchTeamInfo = useCallback(async (walletAddress: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/get-team-info?wallet=${walletAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('teamInfo', data);

      if (data.is_found) {
        setTeamInfo(data.team);
        localStorage.setItem('user_team_id', data.team.id);
        localStorage.setItem('userTeam', JSON.stringify(data.team));
      } else {
        setTeamInfo(null);
        localStorage.removeItem('user_team_id');
      }
    } catch (err) {
      console.error('Error fetching team info:', err);
      setError('Failed to fetch team information');
    } finally {
      setLoading(false);
    }
  }, []);


  const handlePlayNow = () => {
    if (!teamInfo) {
      toast.error("You need to create a team first!");
      return;
    }
    if (teamInfo.active_game_id) {
      toast.error("You have an ongoing game!");
      return;
    }

    // Open lobby instead of search modal
    setShowLobby(true);
  };

  const handleCancelSearch = useCallback(() => {
    setIsSearchOpponentModalOpen(false);
  }, []);

  const handleCreateTeam = useCallback(async (teamName: string, countryIndex: string) => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    setIsCreatingTeam(true);
    try {
      console.log("Creating team:", { teamName, countryIndex });

      // Convert country index string to number
      const countryIndexNum = parseInt(countryIndex);
      if (isNaN(countryIndexNum) || countryIndexNum <= 0) {
        throw new Error("Invalid country selection");
      }

      console.log('Creating team for address:', address);

      // Get or create authentication signature
      const authSignature = await authUserWithSignature(address, signMessageAsync);
      console.log("Authentication signature obtained:", authSignature);


      // Call the API endpoint
      const response = await fetch('/api/create-team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          signature: authSignature.signature,
          message: authSignature.message,
          teamName: teamName,
          countryId: countryIndexNum
        }),
      });

      const result = await response.json();

      console.log("response", response.status, result);

      if (!response.ok || !result.success) {
        console.log("Toast here");
        setIsCreateTeamModalOpen(false);

        let errorMessage = "Failed to create team: " + result.error;
        if (result.errorName) {
          errorMessage += " (ERR:" + result.errorName + ")";
        }

        // Check if this is a signature verification error and automatically clear cache
        const isSignatureError = result.error && result.error.includes("Signature verification failed");

        if (isSignatureError) {
          clearCachedAuthSignature();
          console.log("Signature verification failed - cleared cached signature");
        }

        // Show error toast
        toast.error(errorMessage, {
          position: "top-center",
          autoClose: 5000,
          closeOnClick: true,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });

        // Show follow-up toast only for signature errors
        if (isSignatureError) {
          setTimeout(() => {
            toast.info("Your signature was cleared, try your action again to generate new", {
              position: "top-center",
              autoClose: 4000,
              closeOnClick: true,
              hideProgressBar: false,
              draggable: true,
              progress: undefined,
            });
          }, 1000);
        }

        return;
      }

      console.log("Team created successfully:", result);

      // Show success toast notification
      toast.success(`Team "${teamName}" created successfully!`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });

      if (address) {
        fetchTeamInfo(address);
      }


      // Close modal and show success message
      setIsCreateTeamModalOpen(false);
    } catch (error) {
      console.error("Error creating team:", error);

      // Provide user-friendly error messages
      let errorMessage = "Failed to create team. Please try again.";
      console.log("Error creating team:", error);

      alert(errorMessage);
    } finally {
      setIsCreatingTeam(false);
    }
  }, [address, fetchTeamInfo]);

  // Watch for wallet connection changes
  useEffect(() => {
    if (isConnected && address) {
      // Log network information when wallet connects
      const networkName = getNetworkName(chainId);
      console.log(`🔗 Connected to wallet: ${address}`);
      console.log(`🌐 Network: ${networkName} (Chain ID: ${chainId})`);

      // Switch to configured chain if needed
      switchToConfiguredChain();

      fetchTeamInfo(address);
      fetchUsername(address);
    } else {
      setTeamInfo(null);

      setError(null);
      setUsername(null);

      // Disconnect from team channel when wallet disconnects
      unsubscribeFromTeamChannel();
    }
  }, [isConnected, address, chainId, switchToConfiguredChain]);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Subscribe to team channel when team info is available
  useEffect(() => {
    if (teamInfo?.id && isConnected && address) {
      const connectToTeam = async () => {
        try {
          await subscribeToTeamChannel(teamInfo.id);
          console.log(`Connected to team ${teamInfo.id} channel`);
        } catch (error) {
          console.error('Failed to connect to team channel:', error);
        }
      };

      connectToTeam();

      // Cleanup function to disconnect when component unmounts or team changes
      return () => {
        unsubscribeFromTeamChannel();
      };
    }
  }, [teamInfo?.id, isConnected, address]);

  // Listen for game events from team channel
  useEffect(() => {
    const handleGameEvent = (event: CustomEvent) => {
      const gameEvent = event.detail;
      console.log('Received game event on page level:', gameEvent);

      if (gameEvent.type === 'GAME_REQUEST_CREATED') {
        console.log('GAME_REQUEST_CREATED event received:', gameEvent);
        // Close search opponent modal if it's open
        setIsSearchOpponentModalOpen(false);
        setIsGameRequestModalOpen(true);

        setGameRequestData({
          game_request_id: gameEvent.game_request_id,
          team1_info: gameEvent.team1_info,
          team2_info: gameEvent.team2_info,
        });


      } else if (gameEvent.type === 'GAME_REQUEST_CANCELLED') {
        console.log('GAME_REQUEST_CANCELLED event received:', gameEvent);

        // Close search opponent modal if it's open
        setIsSearchOpponentModalOpen(false);
        setIsGameRequestModalOpen(false);
        setGameRequestData(null);

        // Show success toast notification
        toast.error(`Game request ${gameEvent.game_request_id} cancelled!`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });

      } else if (gameEvent.type === 'GAME_STARTED') {
        console.log('GAME_STARTED event received:', gameEvent);

        // Handle game started event
        // Check if this event is relevant to the current user's team
        if (gameEvent.team1_id === teamInfo?.id || gameEvent.team2_id === teamInfo?.id) {
          console.log('Game started for current team:', gameEvent);



          // Redirect to the game page
          const gameUrl = `/game/${gameEvent.game_id}/`;
          console.log('Redirecting to game:', gameUrl);

          // // Close any open modals
          // setIsGameRequestModalOpen(false);
          // setIsSearchOpponentModalOpen(false);
          // setGameRequestData(null);

          // Use window.location for navigation
          window.location.href = gameUrl;
        }
      }
    };

    // Add event listener for game events
    window.addEventListener('game-event', handleGameEvent as EventListener);

    // Cleanup function that runs when the component unmounts or when dependencies change
    // This removes the event listener to prevent memory leaks and duplicate listeners
    return () => {
      window.removeEventListener('game-event', handleGameEvent as EventListener);
    };
  }, [teamInfo, username, address, signMessageAsync]);


  const handleAddFrame = useCallback(async () => {
    const frameAdded = await addFrame();
    setFrameAdded(Boolean(frameAdded));
  }, [addFrame]);

  const saveFrameButton = useMemo(() => {
    if (context && !context.client.added) {
      return (
        <button
          onClick={handleAddFrame}
          className="text-[#0052FF] p-4 text-sm font-medium hover:bg-blue-50 rounded-lg transition-colors"
        >
          Save Frame
        </button>
      );
    }

    if (frameAdded) {
      return (
        <div className="flex items-center space-x-1 text-sm font-medium text-[#0052FF]">
          <span>✓ Saved</span>
        </div>
      );
    }

    return null;
  }, [context, frameAdded, handleAddFrame]);

  const countryFlagCache = React.useMemo(() => new Map<number, string>(), []);

  // Helper function to format ELO rating from 1000 format to 10.00 format
  const formatElo = (elo: number): string => {
    return (elo / 100).toFixed(2);
  };

  // Helper function to get country flag emoji
  const getCountryFlag = React.useCallback((countryIndex: number) => {
    // Check cache first
    if (countryFlagCache.has(countryIndex)) {
      return countryFlagCache.get(countryIndex)!;
    }

    // Find the country by index in the country list
    const country = countryList.find(c => c.index === countryIndex);

    if (country && country.code) {
      // Convert country code to flag emoji using Unicode regional indicator symbols
      const codePoints = country.code
        .toUpperCase()
        .split('')
        .map(char => char.charCodeAt(0) + 127397); // 127397 is the offset from 'A' to 🇦

      const flag = String.fromCodePoint(...codePoints);

      // Cache the result
      countryFlagCache.set(countryIndex, flag);

      return flag;
    }

    // Fallback for invalid country index
    const fallback = `#${countryIndex}`;
    countryFlagCache.set(countryIndex, fallback);
    return fallback;
  }, [countryFlagCache]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme relative">

      {/* Wallet connection - fixed to right corner */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center space-x-2">
          <Wallet className="z-10">
            <ConnectWallet
              className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              disconnectedLabel="Connect Wallet"
            >
              <Name className="text-white" />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>
      </div>

      {/* Logo - centered on page */}
      <div className="w-full flex justify-center items-center">
        <div className="flex flex-col items-center w-[200px]">
          <img src="/logo2.png" alt="TactiBall Logo" className="h-42 w-full" />
        </div>
      </div>

      {/* How to Play link */}
      <div className="w-full max-w-md flex justify-end mb-3">
        <button
          onClick={() => openUrl(`${window.location.origin}/rules-of-game`)}
          className="flex items-center gap-1 text-sm text-gray-300 hover:text-white underline transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          How to Play?
        </button>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        {/* Active Game Warning */}
        {teamInfo && teamInfo.active_game_id && (
          <div className="w-full max-w-md mb-4 bg-yellow-500 text-yellow-900 rounded-lg shadow-sm border border-yellow-600">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">
                    You have an ongoing game! Please return to it immediately.
                  </span>
                </div>
                <a
                  href={`/game/${teamInfo.active_game_id}/`}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Return
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Team info section */}
        {isConnected ? (
          <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading team information...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <p className="text-red-500 text-sm mb-3">{error}</p>
                <button
                  onClick={() => address && fetchTeamInfo(address)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Retry
                </button>
              </div>
            ) : teamInfo ? (
              <div className="p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <div className="flex items-start gap-4">
                  {/* Shield logo */}
                  <div className="h-16 w-16 bg-yellow-400 rounded-lg border-2 border-black flex items-center justify-center">
                    <div className="text-black text-lg font-bold">{teamInfo.name?.substring(0, 2).toUpperCase() || 'TM'}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-xl font-bold text-black">{teamInfo.name}</h2>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">ELO {formatElo(teamInfo.elo_rating)}</span>
                      </div>
                    </div>

                    {/* Player info */}
                    <div className="flex justify-between items-center mb-2">
                      <Identity className="bg-white px-0 space-x-1 team-coach-username">
                        <Avatar className="w-6 h-6" />
                        <Name className="text-black ml-0" />
                      </Identity>
                      <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded" title={`Position: ${teamInfo.league_position}th in ${teamInfo.country} / ${teamInfo.global_position}th globally`}>
                        {teamInfo.league_position}th {getCountryFlag(teamInfo.country_index)} / {teamInfo.global_position}th 🌍
                      </div>
                    </div>

                    {/* League and matches */}
                    <div className="text-sm text-black">
                      {teamInfo.matchesPlayed} matches played · {teamInfo.team_age === 0 ? "just created" : `${teamInfo.team_age} days old`}
                    </div>

                    {/* Active game indicator */}
                    {teamInfo.active_game_id && (
                      <div className="mt-2">
                        <div className="inline-flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                          <span>Active Game #{teamInfo.active_game_id}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <div className="text-gray-500 mb-4">
                  <p className="text-sm">No team found for this wallet address</p>
                  <p className="text-xs mt-1">Create a team to get started</p>
                </div>
                <button
                  onClick={() => setIsCreateTeamModalOpen(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Create Team
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 text-center">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
              </div>
              <div className="text-gray-500 mb-4">
                <p className="text-sm">Connect your wallet to view your team information</p>
              </div>
              <div className="flex justify-center">
                <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                  Connect Wallet
                </ConnectWallet>
              </div>
            </div>
          </div>
        )}

        {/* Primary actions next to team block */}
        <div className="w-full max-w-md mt-2 mb-2">
          <div className="flex justify-center mb-6">
            {teamInfo && teamInfo.active_game_id ? (
              <a
                href={`/game/${teamInfo.active_game_id}/`}
                className="px-8 text-base py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                Return to Game
              </a>
            ) : (
              <button
                onClick={handlePlayNow}
                className="px-8 text-base py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Play Now
              </button>
            )}
          </div>
          {/* <div className="flex items-center justify-between mt-2">
            <div className="text-sm text-gray-700">🔥 32 players online now</div>
            <button className="text-sm text-gray-600 hover:text-gray-800">Share to Feed</button>
          </div> */}
        </div>

        {/* Global game stats */}
        <GlobalStats className="mb-2" />

        {/* Leaderboard preview */}
        <Leaderboard
          period="month"
          limit={50}
          userLeaderboardData={teamInfo?.leaderboard}
          userTeamInfo={teamInfo ? {
            id: teamInfo.id,
            name: teamInfo.name,
            country_index: teamInfo.country_index,
            elo_rating: teamInfo.elo_rating
          } : undefined}
        />
      </div>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSubmit={handleCreateTeam}
        isLoading={isCreatingTeam}
        defaultTeamName={username ? `${username}'s team` : undefined}
      />

      {/* Search Opponent Modal */}
      <SearchOpponentModal
        isOpen={isSearchOpponentModalOpen}
        onClose={() => setIsSearchOpponentModalOpen(false)}
        onCancel={handleCancelSearch}
        userInfo={teamInfo ? {
          team_name: teamInfo.name,
          team_id: teamInfo.id,
          user_wallet_address: address || '',
          username: username || '',
          elo_rating: teamInfo.elo_rating
        } : null}
      />

      {showLobby && !selectedRoomId && (
        <LobbyScreen
          userTeamId={teamInfo.id}
          userTeamElo={teamInfo.elo_rating}
          onClose={() => setShowLobby(false)}
          onRoomSelected={(roomId) => setSelectedRoomId(roomId)}
        />
      )}

      {selectedRoomId && (
        <RoomDetails
          roomId={selectedRoomId}
          userTeamId={teamInfo.id}
          onBack={() => setSelectedRoomId(null)}
          onGameStarting={(gameRequestId) => {
            setSelectedRoomId(null);
            setShowLobby(false);
          }}
        />
      )}

      {/* Game Request Modal */}
      {gameRequestData && (
        <GameRequestModal
          isOpen={isGameRequestModalOpen}
          onClose={() => {
            setIsGameRequestModalOpen(false);
            setGameRequestData(null);
          }}
          game_request_id={gameRequestData.game_request_id}
          team1_info={gameRequestData.team1_info}
          team2_info={gameRequestData.team2_info}
          current_team_id={teamInfo?.id || null}
          current_user_wallet={address as `0x${string}`}
        />
      )}
      {/* Toast notifications container */}
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}
