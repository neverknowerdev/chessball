'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Game, TeamEnum, TeamPlayer, MoveType, isPosEquals, Team, GameStateType, toGameStatus, GameState, convertEventStateToGameState } from '@/lib/game';
import { getGameFromDB } from '@/lib/db';
import '../game.css';
import { authUserWithSignature } from '@/lib/auth';
import { useAccount, useSignMessage } from "wagmi";
import { toast, ToastContainer } from "react-toastify";
import { ConnectWallet } from "@coinbase/onchainkit/wallet";
import 'react-toastify/dist/ReactToastify.css';
import { subscribeToGame, unsubscribeFromGame } from '@/lib/ably';
import { getGameFromContract } from '@/lib/contract';
import GameTipsModal from './GameTipsModal';

// Cell type enum
enum CellType {
    FIELD_MARGIN = 'field_margin',
    FIELD_CELL = 'field_cell'
}

// Cell state type definition
type CellState = {
    position: { x: number, y: number };
    highlighted: boolean;
    type: CellType;
};

// Game submission state enum
enum GameSubmissionState {
    IDLE = 'idle',
    COMMITTING = 'committing',
    WAITING_FOR_OPPONENT = 'waiting_for_opponent',
    WAITING_FOR_CALCULATION = 'waiting_for_calculation'
}

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 11;

export default function GamePage() {
    const params = useParams();
    const gameId = params.gameId as string;

    const [game, setGame] = useState<Game | null>(null);
    const [cellStates, setCellStates] = useState<CellState[][]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<TeamPlayer | null>(null);
    const [currentMode, setCurrentMode] = useState<MoveType | null>(null);
    const [availableModes, setAvailableModes] = useState<MoveType[]>([]);
    const [modeIndex, setModeIndex] = useState<number>(0);
    const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
    const [showTips, setShowTips] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [gameSubmissionState, setGameSubmissionState] = useState<GameSubmissionState>(GameSubmissionState.IDLE);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(0);
    const [isDebugMode, setIsDebugMode] = useState(false);
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const [isTwoTeamCommitted, setIsTwoTeamCommitted] = useState(false);
    const [secondsAfterLastMove, setSecondsAfterLastMove] = useState<number>(0);
    const [lastMoveAt, setLastMoveAt] = useState<number | null>(null);
    const [gameResultModal, setGameResultModal] = useState<{
        isOpen: boolean;
        winner: number;
        finishReason: number;
        gameId: number;
        timestamp: number;
    }>({
        isOpen: false,
        winner: 0,
        finishReason: 0,
        gameId: 0,
        timestamp: 0
    });

    const [isCancelRequestSending, setIsCancelRequestSending] = useState(false);

    const isNewStateRecalculatedRef = useRef<boolean | null>(false);

    // Send cancel game request
    const handleCancelGameRequest = async () => {
        if (!address || !signMessageAsync) {
            toast.error('Please connect your wallet first');
            return;
        }

        setIsCancelRequestSending(true);
        setGameSubmissionState(GameSubmissionState.IDLE);

        try {
            const signature = await authUserWithSignature(address, signMessageAsync);

            const response = await fetch('/api/game/finish-game-by-timeout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_id: gameId,
                    wallet_address: address,
                    signature: signature.signature,
                    message: signature.message
                })
            });

            if (!response.ok) {
                const data = await response.json();
                console.error('Failed to cancel game:', data);
                toast.error(data.error || 'Failed to cancel game');
                return;
            }

            const data = await response.json();
            console.log('Game cancelled successfully:', data);
            toast.success('Game cancelled due to timeout');

            // Reset the game state
            setGameSubmissionState(GameSubmissionState.IDLE);

            // Redirect to main page after 5 seconds
            setTimeout(() => {
                window.location.href = '/';
            }, 5000);

        } catch (error) {
            console.error('Error cancelling game:', error);
            toast.error('Failed to cancel game. Please try again.');
        } finally {
            setIsCancelRequestSending(false);
        }
    };

    const fetchGameFromSmartContract = async (game: Game): Promise<Game> => {
        const contractGameData = await getGameFromContract(gameId);
        if (!contractGameData.success) {
            throw new Error('Game not found');
        }

        game.status = toGameStatus(contractGameData.data.status);

        game.team1.name = "Team Blue";
        game.team2.name = "Team Red";
        game.team1.teamId = contractGameData.data.team1.teamId;
        game.team2.teamId = contractGameData.data.team2.teamId;

        game.team1.score = contractGameData.data.gameState.team1score;
        game.team2.score = contractGameData.data.gameState.team2score;

        // Store the lastMoveAt timestamp for timeout calculations
        setLastMoveAt(Number(contractGameData.data.gameState.lastMoveAt));

        const gameState: GameState = {
            team1PlayerPositions: contractGameData.data.lastBoardState.team1PlayerPositions,
            team2PlayerPositions: contractGameData.data.lastBoardState.team2PlayerPositions,
            ballPosition: contractGameData.data.lastBoardState.ballPosition,
            ballOwner: contractGameData.data.lastBoardState.ballOwner === 1 ? TeamEnum.TEAM1 : contractGameData.data.lastBoardState.ballOwner === 2 ? TeamEnum.TEAM2 : null,
            type: GameStateType.MOVE,
            clashRandomResults: [],
            team1Moves: [],
            team2Moves: []
        }

        game.restoreState(gameState);

        console.log('contractGameData.data.gameState.team1MovesEncrypted', contractGameData.data.gameState.team1MovesEncrypted);
        console.log('contractGameData.data.gameState.team2MovesEncrypted', contractGameData.data.gameState.team2MovesEncrypted);
        if (BigInt(contractGameData.data.gameState.team1MovesEncrypted) !== BigInt(0)) {
            console.log('team1MovesCommited');
            game.team1.isCommittedMove = true;
        }
        if (BigInt(contractGameData.data.gameState.team2MovesEncrypted) !== BigInt(0)) {
            console.log('team2MovesCommited');
            game.team2.isCommittedMove = true;
        }

        return game;
    }

    const fetchGameFromDatabase = async (game: Game): Promise<Game> => {
        const dbGameData = await getGameFromDB(gameId);
        if (!dbGameData.success) {
            console.error('Error fetching game from database:', dbGameData.error);
            return game;

        }
        console.log('Contract game data:', dbGameData.data);


        game.team1.name = dbGameData.data.team1_info.name;
        game.team2.name = dbGameData.data.team2_info.name;

        const history: GameState[] = [];

        for (const state of dbGameData.data.history) {
            const gameState = {
                team1PlayerPositions: state.team1_positions,
                team2PlayerPositions: state.team2_positions,
                ballPosition: state.ball_position,
                ballOwner: state.ball_owner,
                type: (state.type == 0 ? GameStateType.START_POSITIONS : state.type == 1 ? GameStateType.MOVE : state.type == 2 ? GameStateType.GOAL_TEAM1 : GameStateType.GOAL_TEAM2) as GameStateType,
                clashRandomResults: state.clashRandomResults,
                team1Moves: state.team1_moves || [],
                team2Moves: state.team2_moves || []
            }

            history.push(gameState);
        }

        game.history = history;

        return game;
    }

    // Function to fetch game data from smart contract
    const fetchGameData = async () => {
        if (!gameId) return;

        const userTeamId = Number(localStorage.getItem('user_team_id'));
        console.log('userTeamId', userTeamId);

        try {
            setIsLoading(true);
            setError(null);

            console.log('Fetching game data for game ID:', gameId);

            let newGame = new Game(parseInt(gameId));
            newGame = await fetchGameFromSmartContract(newGame);
            console.log('newGame isCommitedMove 0', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            try {
                newGame = await fetchGameFromDatabase(newGame);
            } catch (err) {
                console.error('Error fetching game data from database:', err);
            }

            const isTwoTeamCommitted = newGame.team1.isCommittedMove && newGame.team2.isCommittedMove;

            console.log('newGame isCommitedMove 1', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            if (userTeamId) {
                const gameTeamInfo = Number(newGame.team1.teamId) === userTeamId ? newGame.team1 :
                    Number(newGame.team2.teamId) === userTeamId ? newGame.team2 : null;

                console.log('currentTeam', gameTeamInfo);
                setCurrentTeam(gameTeamInfo);

                const storedActions = localStorage.getItem('commitedActions');
                if (gameTeamInfo && gameTeamInfo!.isCommittedMove && storedActions) {
                    const commitedActionsData = JSON.parse(storedActions);

                    if (gameTeamInfo!.enum == TeamEnum.TEAM1) {
                        if (commitedActionsData.length > 0) {
                            newGame.team1.isCommittedMove = false;
                            for (const move of commitedActionsData) {
                                newGame.doPlayerMove(newGame.team1.players[move.playerId], move.moveType, move.oldPosition, move.newPosition);
                            }
                            newGame.commitMove(TeamEnum.TEAM1);
                        }
                    } else if (gameTeamInfo!.enum == TeamEnum.TEAM2) {
                        if (commitedActionsData.length > 0) {
                            newGame.team2.isCommittedMove = false;
                            for (const move of commitedActionsData) {
                                newGame.doPlayerMove(newGame.team2.players[move.playerId], move.moveType, move.oldPosition, move.newPosition);
                            }
                            newGame.commitMove(TeamEnum.TEAM2);
                        }
                    }
                }
            }

            console.log('newGame isCommitedMove 2', newGame.team1.isCommittedMove, newGame.team2.isCommittedMove);

            setGame(newGame);
            // Set current history index to the latest state
            setCurrentHistoryIndex(newGame.history.length - 1);

            // calculating new game state
            if (newGame.team1.isCommittedMove && newGame.team2.isCommittedMove) {
                setIsTwoTeamCommitted(true);
            }

        } catch (err) {
            console.error('Error fetching game data:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch game data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!game || !isConnected) return;

        if (game?.team1.isCommittedMove && game?.team2.isCommittedMove) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
        } else if (currentTeam?.isCommittedMove) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_OPPONENT);
        }
    }, [game, isConnected]);

    // WebSocket subscription effect
    useEffect(() => {
        if (!gameId) return;

        fetchGameData();

        // Subscribe to game channel using GameChannelManager
        const connectToGame = async () => {
            try {
                await subscribeToGame(gameId);
                console.log(`Connected to game ${gameId} channel`);
            } catch (error) {
                console.error('Failed to connect to game channel:', error);
            }
        };

        connectToGame();

        // Cleanup function to disconnect when component unmounts or game changes
        return () => {
            unsubscribeFromGame();
            // Reset submission state on cleanup
            setGameSubmissionState(GameSubmissionState.IDLE);
        };
    }, [gameId]);

    // Listen for game events from game channel
    useEffect(() => {
        const handleGameEvent = (event: CustomEvent) => {
            const gameEvent = event.detail;
            console.log('Received game event on game page:', gameEvent);

            // Handle NEW_GAME_STATE_NOTIFICATION
            if (gameEvent.type === 'NEW_GAME_STATE') {
                console.log('New game state notification received, re-fetching game data...');

                console.log('gameEvent', gameEvent);
                console.log('gameEvent.new_state', gameEvent.new_state);

                game!.playerMoves = [];

                // Convert event state to GameState format
                const gameState = convertEventStateToGameState(gameEvent.new_state);
                console.log('Converted gameState', gameState);

                game!.saveState(gameState);
                game!.restoreState(gameState);


                isNewStateRecalculatedRef.current = true;

                setGame(game!);
                // Reset submission state when new game state is received
                setGameSubmissionState(GameSubmissionState.IDLE);
                // Reset history index to latest state
                setCurrentHistoryIndex(game!.history.length - 1);

                localStorage.removeItem('commitedActions');

                // Reset timeout tracking when new game state is received
                setLastMoveAt(Math.floor(Date.now() / 1000));
            }
            if (gameEvent.type === 'GAME_ACTION_COMMITTED') {
                console.log('Game action committed notification received, re-fetching game data...');
                // Reset submission state when game finished is received
                setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                isNewStateRecalculatedRef.current = false;

                // Reset timeout tracking when opponent commits their move
                setLastMoveAt(Math.floor(Date.now() / 1000));
            }
            if (gameEvent.type === 'GAME_FINISHED') {
                console.log('Game finished notification received:', gameEvent);
                // Show game result modal
                setGameResultModal({
                    isOpen: true,
                    winner: gameEvent.winner,
                    finishReason: gameEvent.finish_reason,
                    gameId: gameEvent.game_id,
                    timestamp: gameEvent.timestamp
                });
                // Reset submission state when game finished is received
                setGameSubmissionState(GameSubmissionState.IDLE);
            }
            if (gameEvent.type === 'GOAL_SCORED') {
                console.log('Goal scored notification received:', gameEvent);

                // Update the appropriate team's score
                if (gameEvent.teamEnum == 1) {
                    game!.team1.score += 1;
                    toast.success(`🎉 ${game!.team1.name} scored a goal!`);
                } else if (gameEvent.teamEnum == 2) {
                    game!.team2.score += 1;
                    toast.success(`🎉 ${game!.team2.name} scored a goal!`);
                }

                // Update the game state to trigger re-render by creating a new Game instance
                const updatedGame = Object.assign(Object.create(Object.getPrototypeOf(game!)), game!);
                setGame(updatedGame);
            }
            if (gameEvent.type === 'GAME_STATE_ERROR') {
                console.log('Game state error notification received:', gameEvent);

                // Show error toast notification
                toast.error(`Game Error: ${gameEvent.error_msg || 'Unknown error occurred'}`);

                // Reset submission state on error
                setGameSubmissionState(GameSubmissionState.IDLE);
            }
        };

        if (!game) {
            return;
        }

        // Add event listener for game events
        window.addEventListener('game-event', handleGameEvent as EventListener);

        // Cleanup function that runs when the component unmounts or when dependencies change
        // This removes the event listener to prevent memory leaks and duplicate listeners
        return () => {
            window.removeEventListener('game-event', handleGameEvent as EventListener);
        };
    }, [game]);

    // Debug mode detection effect
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        setIsDebugMode(urlParams.has('debug'));
    }, []);

    // Timeout check effect - runs every second when waiting for opponent
    useEffect(() => {
        if (gameSubmissionState !== GameSubmissionState.WAITING_FOR_OPPONENT || !lastMoveAt) {
            return;
        }
        setSecondsAfterLastMove(Math.floor(Date.now() / 1000) - lastMoveAt);

        const interval = setInterval(() => {
            setSecondsAfterLastMove(prev => {
                const newValue = prev + 1;
                return newValue;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [gameSubmissionState, lastMoveAt]);

    useEffect(() => {
        // Generate cell states
        const generateCellStates = (): CellState[][] => {
            const cells: CellState[][] = [];

            for (let x = 0; x < FIELD_WIDTH; x++) {
                const colCells: CellState[] = [];
                for (let y = 0; y < FIELD_HEIGHT; y++) {
                    // Determine if this is a field margin or field cell
                    const isMargin = x === 0 || x === FIELD_WIDTH - 1;
                    const type: CellType = isMargin ? CellType.FIELD_MARGIN : CellType.FIELD_CELL;

                    // Determine if cell should be highlighted (for now, we can add logic later)
                    const highlighted = false;

                    colCells.push({
                        position: { x: x, y: y },
                        highlighted,
                        type
                    });
                }
                cells.push(colCells);
            }

            return cells;
        };

        setCellStates(generateCellStates());
    }, []);

    const onCellClick = (cell: CellState) => {
        // Find what's at this cell position
        if (!game) return;

        const team1Player = game.team1.players.find(p =>
            isPosEquals(p.position, cell.position)
        );
        const team2Player = game.team2.players.find(p =>
            isPosEquals(p.position, cell.position)
        );

        if (selectedPlayer != null && cell.highlighted) {
            handleEmptyCellClick(cell);
            return;
        }

        if (team1Player && team2Player) {
            if (currentTeam?.enum === team1Player.team.enum) {
                handlePlayerClick(team1Player);
            } else {
                handlePlayerClick(team2Player);
            }
            return;
        }

        if (team1Player) {
            // Handle team 1 player click
            handlePlayerClick(team1Player);
            return;
        }
        if (team2Player) {
            // Handle team 2 player click
            handlePlayerClick(team2Player);
            return;
        }

        if (!team1Player && !team2Player) {
            // Handle empty cell click
            handleEmptyCellClick(cell);
            return;
        }
    }

    const handlePlayerClick = (player: TeamPlayer) => {
        // Only allow moves for the current user's team
        if (player.team.enum !== currentTeam?.enum) {
            // Show a brief visual feedback that it's not their turn
            alert(`You cannot move opponent's player!`);
            return;
        }

        if (selectedPlayer && selectedPlayer === player) {
            switchToNextMode();
            return;
        }

        if (player.oldPosition != null) {
            restorePlayerState(player);
            return;
        }

        // Select the player and determine available modes
        setSelectedPlayer(player);
        const modes = determineAvailableModes(player);
        setAvailableModes(modes);
        setModeIndex(0);

        // Start with the first mode
        switchToMode(0, player, modes);
    }

    useEffect(() => {
        console.log('isTwoTeamCommitted, isConnected', isTwoTeamCommitted, isConnected);
        if (!isConnected) return;

        const calculateNewGameState = async () => {
            console.log('Calculating new game state');
            const signature = await authUserWithSignature(address!, signMessageAsync);
            const response = await fetch('/api/game/calculate-new-game-state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    game_id: Number(game!.gameId),
                    team_enum: currentTeam?.enum == TeamEnum.TEAM1 ? 1 : 2,
                    team_id: Number(currentTeam?.teamId),
                    wallet_address: address,
                    signature: signature.signature,
                    message: signature.message
                })
            });

            if (!response.ok) {
                const data = await response.json();
                console.log('Failed to calculate new game state', data);
                throw new Error('Failed to calculate new game state');
            }

            if (!isNewStateRecalculatedRef.current) {
                setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (!isNewStateRecalculatedRef.current) {
                    fetchGameData();
                }
            }

            localStorage.removeItem('commitedActions');
            setIsTwoTeamCommitted(false);
        }

        if (isTwoTeamCommitted) {
            setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
            calculateNewGameState();
        }
    }, [isTwoTeamCommitted, isConnected]);

    const handleReady = () => {
        const sendMoves = async () => {
            // Set state to committing
            setGameSubmissionState(GameSubmissionState.COMMITTING);

            isNewStateRecalculatedRef.current = false;

            const signature = await authUserWithSignature(address!, signMessageAsync);

            try {
                const response = await fetch('/api/game/commit-game-actions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        game_id: Number(game!.gameId),
                        moves: game!.playerMoves,
                        team_enum: currentTeam?.enum == TeamEnum.TEAM1 ? 1 : 2,
                        team_id: Number(currentTeam?.teamId),
                        wallet_address: address,
                        signature: signature.signature,
                        message: signature.message
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    console.log('Failed to commit move', data);
                    throw new Error('Failed to commit move');
                }

                const data = await response.json();

                console.log('Move committed successfully:', data);

                localStorage.setItem('commitedActions', JSON.stringify(game!.playerMoves));

                if (data.isTwoTeamCommited) {
                    console.log('Two team commited, calculating new game state...');
                    setGameSubmissionState(GameSubmissionState.WAITING_FOR_CALCULATION);
                    clearSelection();
                    setIsTwoTeamCommitted(true);
                } else {
                    setGameSubmissionState(GameSubmissionState.WAITING_FOR_OPPONENT);

                    clearSelection();
                    game!.commitMove(currentTeam!.enum);
                }


            } catch (error) {
                console.error('Error committing move:', error);
                toast.error('Failed to commit move. Please try again.');
                // Reset state on error
                setGameSubmissionState(GameSubmissionState.IDLE);
                return;
            }
        }

        console.log('game.playerMoves', game!.playerMoves);
        if (game!.playerMoves.length == 0) {
            console.log('No moves to commit');
            toast.error('No moves to commit');
            return;
        }

        sendMoves();
    }

    const determineAvailableModes = (player: TeamPlayer): MoveType[] => {
        const playerTeam = player.team;
        // Determine which team the player belongs to
        const playerTeamEnum = playerTeam.id === 1 ? TeamEnum.TEAM1 : TeamEnum.TEAM2;
        const teamHasBall = game!.ball.ownerTeam === playerTeamEnum;
        const playerHasBall = player.ball !== null;

        let modes: MoveType[] = [];

        if (teamHasBall && playerHasBall) {
            // Player's team has ball and player has ball: pass, run
            modes = [MoveType.RUN, MoveType.PASS];
        } else if (teamHasBall && !playerHasBall) {
            // Player's team has ball but player doesn't: run, tackle
            modes = [MoveType.RUN, MoveType.TACKLE];
        } else {
            // Player's team doesn't have ball: run, tackle
            modes = [MoveType.RUN, MoveType.TACKLE];
        }

        return modes;
    }

    const switchToNextMode = () => {
        const nextIndex = (modeIndex + 1) % availableModes.length;
        switchToMode(nextIndex, selectedPlayer!, availableModes);
    }

    const switchToMode = (index: number, player: TeamPlayer, modes: MoveType[]) => {
        if (index >= modes.length) return;

        const mode = modes[index];

        setCurrentMode(mode);
        setModeIndex(index);

        // Calculate available cells based on the mode
        const available = game!.calculateAvailableCells(player!, mode);
        updateCellHighlights(available);
    }

    const handleEmptyCellClick = (cell: CellState) => {
        // Check if this is an available cell for the selected player
        if (selectedPlayer && cellStates[cell.position.x][cell.position.y].highlighted) {
            game!.doPlayerMove(selectedPlayer, currentMode!, selectedPlayer.position, { x: cell.position.x, y: cell.position.y });
        } else {
            // Clicked on an invalid cell, clear selection
        }
        clearSelection();
    }

    const restorePlayerState = (player: TeamPlayer) => {
        game!.undoPlayerMove(player);

        // Clear selection
        clearSelection();
    }

    const clearSelection = () => {
        setSelectedPlayer(null);
        setCurrentMode(null);
        setAvailableModes([]);
        setModeIndex(0);
        clearCellHighlights();
    }

    const updateCellHighlights = (availablePositions: { x: number, y: number }[]) => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: availablePositions.some(pos => isPosEquals(pos, cell.position))
            }))
        );
        setCellStates(newCellStates);
    }

    const clearCellHighlights = () => {
        const newCellStates = cellStates.map(row =>
            row.map(cell => ({
                ...cell,
                highlighted: false
            }))
        );
        setCellStates(newCellStates);
    }

    const isHasOldState = (player: TeamPlayer) => {
        return player.oldPosition != null;
    }

    const isHasOldStateBall = () => {
        return game!.ball.oldPosition != null;
    }

    // History navigation functions
    const goToHistoryIndex = (index: number) => {
        if (!game || index < 0 || index >= game!.history.length) return;

        setCurrentHistoryIndex(index);
        game!.restoreState(game!.history[index]);

        // Clear any current selection when navigating history
        clearSelection();
    }

    const goToPreviousState = () => {
        if (currentHistoryIndex > 0) {
            goToHistoryIndex(currentHistoryIndex - 1);
        }
    }

    const goToNextState = () => {
        if (currentHistoryIndex < game!.history.length - 1) {
            goToHistoryIndex(currentHistoryIndex + 1);
        }
    }

    const goToLatestState = () => {
        if (game) {
            goToHistoryIndex(game!.history.length - 1);
        }
    }

    const getHistoryDescription = (index: number) => {
        if (!game || index >= game!.history.length) return '';

        const state = game.history[index];
        if (index == 0) return 'Initial Positions';
        if (state.type == GameStateType.GOAL_TEAM1) return `Goal! ${game.team1.name}`;
        if (state.type == GameStateType.GOAL_TEAM2) return `Goal! ${game.team2.name}`;
        if (state.type == GameStateType.MOVE) return `Move ${index + 1}`;
        return `State ${index}`;
    }

    return (
        <div className="min-h-screen bg-green-100 p-2 sm:p-4">
            {/* Game Loading Popup */}
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">Loading Game</h3>
                            <p className="text-gray-600">Loading game {gameId}...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                {error.includes('Game not found') ? 'Game Not Found' : 'Error Loading Game'}
                            </h3>
                            <p className="text-gray-600 mb-6">
                                {error.includes('Game not found')
                                    ? `The game with ID ${gameId} was not found.`
                                    : error
                                }
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Go Back
                                </button>
                                <button
                                    onClick={() => fetchGameData()}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {game && (

                <div className="max-w-6xl mx-auto">
                    {/* Back to Main - only show if game is not active */}
                    {game && game.status !== 'ACTIVE' && (
                        <div className="flex justify-start mb-4">
                            <a
                                href="/"
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 underline transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                Back to Main
                            </a>
                        </div>
                    )}

                    <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6">TactiBall Game #{gameId}</h1>

                    {/* Tips Modal */}
                    <GameTipsModal
                        isOpen={showTips}
                        onClose={() => setShowTips(false)}
                        isConnected={isConnected}
                        currentTeam={currentTeam}
                    />

                    {/* Game Info */}
                    <div className="mb-6">
                        {/* Scores Row */}
                        <div className="flex justify-center gap-6 sm:gap-12 mb-4">
                            <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM1 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                                <div className={`text-lg font-semibold text-blue-600`}>{game.team1.name}</div>
                                <div className={`text-3xl font-bold text-blue-600`}>{game.team1.score}</div>
                                {currentTeam?.enum === TeamEnum.TEAM1 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TURN</div>}
                            </div>
                            <div className={`text-center ${currentTeam?.enum === TeamEnum.TEAM2 ? 'ring-4 ring-yellow-400 ring-opacity-75 rounded-lg p-3' : ''}`}>
                                <div className={`text-lg font-semibold text-red-600`}>{game.team2.name}</div>
                                <div className={`text-3xl font-bold text-red-600`}>{game.team2.score}</div>
                                {currentTeam?.enum === TeamEnum.TEAM2 && <div className="text-xs text-yellow-600 font-semibold mt-1">YOUR TURN</div>}
                            </div>
                        </div>

                        {/* Game Info Row */}
                        <div className="text-center">
                            <div className="text-sm text-gray-600 inline-block bg-white px-4 py-2 rounded-lg shadow-sm">
                                Game ID: {game.gameId} | Status: {game.status}
                                {isDebugMode && (
                                    <span className="ml-2 px-2 py-1 bg-yellow-500 text-black text-xs font-bold rounded">
                                        DEBUG MODE
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Chessboard-style Soccer Field */}
                    {currentHistoryIndex < game.history.length - 1 && (
                        <div className="mb-4 bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-center">
                            <div className="text-yellow-800 font-medium">
                                📜 Viewing Historical State - {getHistoryDescription(currentHistoryIndex)}
                            </div>
                            <div className="text-sm text-yellow-600 mt-1">
                                Use the history controls below to navigate or click "Move to Latest State" to return to current game
                            </div>
                        </div>
                    )}
                    {/* How to Play Button - Above Field, Aligned with Field Right Edge */}
                    <div className="flex justify-end mb-1" style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => setShowTips(!showTips)}
                            className="flex items-center gap-1 text-xs bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 px-2 py-1 rounded shadow-sm transition-all duration-200"
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            How to play?
                        </button>
                    </div>

                    <div className="field">
                        <div className="grid grid-cols-[repeat(17,1fr)] grid-rows-[repeat(11,1fr)] absolute inset-0 w-full h-full">
                            {game.team1.players.map((player, index) => (
                                <div key={index} className={`player team1 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                                    style={{
                                        gridRow: player.position.y + 1,
                                        gridColumn: player.position.x + 1
                                    }}>
                                    {isDebugMode && (
                                        <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {index}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {game.team2.players.map((player, index) => (
                                <div key={index} className={`player team2 player${player.key()} ${isHasOldState(player) ? 'action-done' : ''}`}
                                    style={{
                                        gridRow: player.position.y + 1,
                                        gridColumn: player.position.x + 1
                                    }}>
                                    {isDebugMode && (
                                        <div className="absolute -top-2 -left-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                            {index}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className={`ball ${game.ball.ownerTeam != null ? game.ball.ownerTeam : ''} ${isHasOldStateBall() ? 'action-done' : ''}`} style={{
                                gridRow: game.ball.position.y + 1,
                                gridColumn: game.ball.position.x + 1
                            }} />

                            {cellStates.map((row) => (
                                row.map((cell) => (
                                    <div
                                        onClick={() => {
                                            onCellClick(cell);
                                        }}
                                        key={`${cell.position.x}-${cell.position.y}`}
                                        className={`field-cell relative cell-${cell.position.x}-${cell.position.y} ${cell.highlighted ? `highlighted ${currentMode || ''}` : ''} ${cell.type === CellType.FIELD_MARGIN ? 'field_margin' : 'field_cell'}`}
                                        style={{
                                            gridRow: cell.position.y + 1,
                                            gridColumn: cell.position.x + 1
                                        }}
                                    />
                                ))
                            ))}
                        </div>
                    </div>

                    {/* Ready Button or Connect Wallet */}
                    <div className="mt-4 flex justify-center">
                        {!isConnected ? (
                            <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                                Connect Wallet
                            </ConnectWallet>
                        ) : (
                            <button
                                onClick={handleReady}
                                disabled={game.playerMoves.length === 0 || gameSubmissionState !== GameSubmissionState.IDLE}
                                className={`px-8 py-3 font-semibold rounded-lg transition-colors shadow-lg ${game.playerMoves.length === 0
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                            >
                                Ready!
                            </button>
                        )}
                    </div>

                    {/* Move History Controls */}
                    {game.history.length > 1 && (
                        <div className="mt-6 bg-white rounded-lg shadow-lg p-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 text-center">Move History</h3>
                            <div className="flex items-center justify-center gap-4 mb-3">
                                <button
                                    onClick={goToPreviousState}
                                    disabled={currentHistoryIndex === 0}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === 0
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    ← Previous
                                </button>

                                <div className="text-center">
                                    <div className="text-sm text-gray-600 mb-1">
                                        {currentHistoryIndex + 1} of 45
                                    </div>
                                    <div className="text-sm font-medium text-gray-800">
                                        {getHistoryDescription(currentHistoryIndex)}
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-32 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 transition-all duration-300 ease-in-out"
                                            style={{
                                                width: `${((currentHistoryIndex + 1) / 45) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={goToNextState}
                                    disabled={currentHistoryIndex === game.history.length - 1}
                                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === game.history.length - 1
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                >
                                    Next →
                                </button>
                            </div>

                            <div className="flex justify-center">
                                <button
                                    onClick={goToLatestState}
                                    disabled={currentHistoryIndex === game.history.length - 1}
                                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${currentHistoryIndex === game.history.length - 1
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                        }`}
                                >
                                    Move to Latest State
                                </button>
                            </div>
                        </div>
                    )}



                </div>
            )}

            {/* Toast Container for notifications */}
            <ToastContainer
                position="top-right"
                autoClose={5000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="light"
            />

            {/* Game Result Modal */}
            {gameResultModal.isOpen && game && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300"
                    onClick={() => setGameResultModal(prev => ({ ...prev, isOpen: false }))}
                >
                    <div
                        className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-center">
                            {/* Trophy Icon */}
                            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-12 h-12 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                            </div>

                            {/* Game Finished Title */}
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Game Finished!</h2>

                            {/* Winner Display */}
                            {gameResultModal.winner === 0 ? (
                                <div className="mb-6">
                                    <div className="text-xl font-semibold text-gray-600 mb-2">It's a Draw!</div>
                                    <div className="text-sm text-gray-500">Both teams played equally well</div>
                                </div>
                            ) : (
                                <div className="mb-6">
                                    <div className="text-xl font-semibold text-gray-800 mb-2">🏆 Winner:</div>
                                    <div className={`text-2xl font-bold animate-pulse ${gameResultModal.winner === 1 ? 'text-blue-600' : 'text-red-600'}`}>
                                        {gameResultModal.winner === 1 ? game.team1.name : game.team2.name}
                                    </div>
                                    {gameResultModal.winner === (currentTeam?.enum === TeamEnum.TEAM1 ? 1 : 2) && (
                                        <div className="text-sm text-green-600 font-semibold mt-2">🎉 Congratulations! You won!</div>
                                    )}
                                </div>
                            )}

                            {/* Final Score */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                <div className="text-sm text-gray-600 mb-2">Final Score</div>
                                <div className="flex justify-center items-center gap-4">
                                    <div className="text-center">
                                        <div className="text-lg font-semibold text-blue-600">{game.team1.name}</div>
                                        <div className="text-2xl font-bold text-blue-600">{game.team1.score}</div>
                                    </div>
                                    <div className="text-gray-400 text-xl">-</div>
                                    <div className="text-center">
                                        <div className="text-lg font-semibold text-red-600">{game.team2.name}</div>
                                        <div className="text-2xl font-bold text-red-600">{game.team2.score}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Finish Reason */}
                            <div className="mb-6">
                                <div className="text-sm text-gray-600 mb-1">Game ended by:</div>
                                <div className="text-lg font-medium text-gray-800">
                                    {gameResultModal.finishReason === 0 ? 'Maximum moves reached' : 'Move timeout'}
                                </div>
                            </div>

                            {/* Game Info */}
                            <div className="text-sm text-gray-500 mb-6">
                                Game #{gameResultModal.gameId} • {new Date(gameResultModal.timestamp * 1000).toLocaleString()}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => {
                                        setGameResultModal(prev => ({ ...prev, isOpen: false }));
                                        goToLatestState();
                                    }}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    View Final State
                                </button>
                                <button
                                    onClick={() => setGameResultModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => window.location.href = '/'}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Back to Home
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Game Loading Modal */}
            {isCancelRequestSending && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div
                        className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-center">
                            <div className="mb-6">
                                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600 mx-auto mb-4"></div>
                                <h2 className="text-2xl font-bold text-gray-800 mb-2">Cancelling Game...</h2>
                                <p className="text-gray-600">Please wait while we cancel the game</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Game Submission Status Popup */}
            {gameSubmissionState !== GameSubmissionState.IDLE && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300">
                    <div className="bg-white rounded-lg p-8 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 duration-300">
                        <div className="text-center">
                            {gameSubmissionState === GameSubmissionState.COMMITTING && (
                                <>
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Committing Your Moves</h3>
                                    <p className="text-gray-600">Committing your moves to smart-contract...</p>
                                </>
                            )}
                            {gameSubmissionState === GameSubmissionState.WAITING_FOR_OPPONENT && (
                                <>
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mx-auto mb-4"></div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Your Moves Submitted!</h3>
                                    <p className="text-gray-600">Your moves are written. Waiting for your opponent to make moves...</p>

                                    {secondsAfterLastMove > 60 ? (
                                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                            <div className="text-red-800 font-medium mb-2">⏰ Game Timeout</div>
                                            <p className="text-red-600 text-sm mb-3">
                                                Your opponent hasn't made a move in over 1 minute. You can cancel the game if they don't respond.
                                            </p>
                                            <button
                                                onClick={handleCancelGameRequest}
                                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                                            >
                                                Cancel Game
                                            </button>
                                        </div>
                                    ) : secondsAfterLastMove > 0 && secondsAfterLastMove <= 60 ? (
                                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <div className="text-yellow-800 font-medium mb-1">⏱️ Timeout Warning</div>
                                            <p className="text-yellow-600 text-sm">
                                                Waiting for opponent... {60 - secondsAfterLastMove}s remaining
                                            </p>
                                        </div>
                                    ) : null}
                                </>
                            )}
                            {gameSubmissionState === GameSubmissionState.WAITING_FOR_CALCULATION && (
                                <>
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-600 mx-auto mb-4"></div>
                                    <h3 className="text-xl font-semibold text-gray-800 mb-2">Calculating New Board Positions</h3>
                                    <p className="text-gray-600">All moves are made. Waiting for a game to calculate new state...</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
