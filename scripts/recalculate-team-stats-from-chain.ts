import { createPublicClient, http, decodeEventLog, toEventHash } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Load deployment configuration
const deploymentPath = path.join(__dirname, '..', 'deployment.json');
const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

// Import the ABI
const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'Game.sol', 'ChessBallGame.json');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const CONTRACT_ABI = artifact.abi;

// Basescan API configuration
const BASESCAN_API_URL = 'https://api.basescan.org/api';
const API_KEY = process.env.BASESCAN_API_KEY || '8RDR5XU1WQHAR5RJ4WTCNPVPD54CEZT2WJ';

// Event signatures
const GAME_STARTED_TOPIC = toEventHash('event GameStarted(uint256 indexed gameId, uint256 indexed team1id, uint256 indexed team2id, uint8 teamWithBall)');
const GAME_FINISHED_TOPIC = toEventHash('event GameFinished(uint256 indexed gameId, uint8 winner, uint8 finishReason)');
const GOAL_SCORED_TOPIC = toEventHash('event GoalScored(uint256 indexed gameId, uint8 scoringTeam)');
const ELO_UPDATED_TOPIC = toEventHash('event EloUpdated(uint256 indexed teamId, uint256 gameId, uint64 eloRating)');

interface ContractEvent {
    blockNumber: string;
    transactionHash: string;
    logIndex: string;
    topics: string[];
    data: string;
    timeStamp: string;
}

interface GameResult {
    gameId: number;
    team1Id: number;
    team2Id: number;
    team1Score: number;
    team2Score: number;
    winner: number; // 0 = draw, 1 = team1, 2 = team2
    finishReason: number;
    timestamp: number;
    blockNumber: number;
    team1EloChange?: number;
    team2EloChange?: number;
}

interface TeamStats {
    team_id: number;
    total_games: number;
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    last_game_results: string[]; // ['VICTORY', 'DEFEAT', 'DRAW', etc.]
    elo_rating?: number; // Latest ELO rating
}

function createSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

function createViemClient() {
    const rpcUrl = process.env.BASE_MAINNET_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org';
    return createPublicClient({
        chain: base,
        transport: http(rpcUrl)
    });
}

// Get block numbers from timestamp for a date range
async function getBlockRangeForMonth(client: any, year: number, month: number): Promise<{ fromBlock: number, toBlock: number }> {
    try {
        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));
        
        const startTimestamp = Math.floor(startDate.getTime() / 1000);
        const endTimestamp = Math.floor(endDate.getTime() / 1000);

        const currentBlock = await client.getBlockNumber();
        const currentBlockData = await client.getBlock({ blockNumber: currentBlock });
        const currentTimestamp = Number(currentBlockData.timestamp);

        // Base has ~2 second block time
        const blockTime = 2;
        const blocksFromEnd = Math.floor((currentTimestamp - endTimestamp) / blockTime);
        const blocksFromStart = Math.floor((currentTimestamp - startTimestamp) / blockTime);

        const toBlock = Math.max(0, Number(currentBlock) - blocksFromEnd);
        const fromBlock = Math.max(0, Number(currentBlock) - blocksFromStart);

        console.log(`📅 Block range for ${year}-${String(month).padStart(2, '0')}: ${fromBlock} to ${toBlock}`);
        return { fromBlock, toBlock };
    } catch (error) {
        console.error('Error calculating block range:', error);
        throw error;
    }
}

// Fetch events from Basescan
async function fetchEventsFromBasescan(
    contractAddress: string,
    fromBlock: number,
    toBlock: number,
    teamId?: number
): Promise<ContractEvent[]> {
    const allEvents: ContractEvent[] = [];

    const eventTopics = [
        { topic: GAME_STARTED_TOPIC, name: 'GameStarted' },
        { topic: GAME_FINISHED_TOPIC, name: 'GameFinished' },
        { topic: GOAL_SCORED_TOPIC, name: 'GoalScored' },
        { topic: ELO_UPDATED_TOPIC, name: 'EloUpdated' }
    ];

    for (const eventType of eventTopics) {
        try {
            const url = new URL(BASESCAN_API_URL);
            url.searchParams.set('module', 'logs');
            url.searchParams.set('action', 'getLogs');
            url.searchParams.set('address', contractAddress);
            url.searchParams.set('topic0', eventType.topic);
            url.searchParams.set('fromBlock', fromBlock.toString());
            url.searchParams.set('toBlock', toBlock.toString());
            url.searchParams.set('apikey', API_KEY);

            console.log(`  Fetching ${eventType.name} events...`);

            const response = await fetch(url.toString());
            const data = await response.json();

            if (data.status !== '1') {
                if (!data.message?.includes('No records found')) {
                    console.warn(`  ⚠️  ${eventType.name}: ${data.message}`);
                }
                continue;
            }

            if (data.result && Array.isArray(data.result)) {
                allEvents.push(...data.result);
                console.log(`  ✅ ${data.result.length} ${eventType.name} events`);
            }
        } catch (error) {
            console.error(`  ❌ Error fetching ${eventType.name}:`, error);
        }
    }

    // Sort by block number and log index
    allEvents.sort((a, b) => {
        const blockDiff = parseInt(a.blockNumber) - parseInt(b.blockNumber);
        if (blockDiff !== 0) return blockDiff;
        return parseInt(a.logIndex) - parseInt(b.logIndex);
    });

    return allEvents;
}

function decodeEvent(event: ContractEvent): any {
    try {
        return decodeEventLog({
            abi: CONTRACT_ABI,
            data: event.data as `0x${string}`,
            topics: event.topics as [`0x${string}`, ...`0x${string}`[]]
        });
    } catch (error) {
        console.warn('Error decoding event:', error);
        return null;
    }
}

// Process events to reconstruct games with ELO changes
function processEventsToGames(events: ContractEvent[]): Map<number, GameResult> {
    const games = new Map<number, GameResult>();
    const eloUpdates = new Map<string, number>(); // Key: "gameId-teamId", Value: eloRating

    for (const event of events) {
        const decoded = decodeEvent(event);
        if (!decoded) continue;

        const eventName = decoded.eventName;
        const args = decoded.args as any;

        switch (eventName) {
            case 'GameStarted': {
                const gameId = Number(args.gameId);
                games.set(gameId, {
                    gameId,
                    team1Id: Number(args.team1id),
                    team2Id: Number(args.team2id),
                    team1Score: 0,
                    team2Score: 0,
                    winner: 0,
                    finishReason: 0,
                    timestamp: parseInt(event.timeStamp),
                    blockNumber: parseInt(event.blockNumber)
                });
                break;
            }

            case 'GoalScored': {
                const gameId = Number(args.gameId);
                const scoringTeam = Number(args.scoringTeam);
                
                if (games.has(gameId)) {
                    const game = games.get(gameId)!;
                    if (scoringTeam === 1) {
                        game.team1Score++;
                    } else if (scoringTeam === 2) {
                        game.team2Score++;
                    }
                }
                break;
            }

            case 'GameFinished': {
                const gameId = Number(args.gameId);
                const winner = Number(args.winner);
                const finishReason = Number(args.finishReason);
                
                if (games.has(gameId)) {
                    const game = games.get(gameId)!;
                    game.winner = winner;
                    game.finishReason = finishReason;
                }
                break;
            }

            case 'EloUpdated': {
                const teamId = Number(args.teamId);
                const gameId = Number(args.gameId);
                const eloRating = Number(args.eloRating);
                
                // Store ELO update for this team and game
                eloUpdates.set(`${gameId}-${teamId}`, eloRating);
                break;
            }
        }
    }

    // Now match ELO updates to games and calculate changes
    for (const [gameId, game] of games) {
        const team1Key = `${gameId}-${game.team1Id}`;
        const team2Key = `${gameId}-${game.team2Id}`;
        
        if (eloUpdates.has(team1Key)) {
            game.team1EloChange = eloUpdates.get(team1Key);
        }
        if (eloUpdates.has(team2Key)) {
            game.team2EloChange = eloUpdates.get(team2Key);
        }
    }

    return games;
}

// Calculate stats for a team from games
function calculateTeamStats(teamId: number, games: GameResult[]): TeamStats {
    const stats: TeamStats = {
        team_id: teamId,
        total_games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_scored: 0,
        goals_conceded: 0,
        last_game_results: []
    };

    // Sort games by timestamp
    const sortedGames = [...games].sort((a, b) => a.timestamp - b.timestamp);

    for (const game of sortedGames) {
        // Only count finished games
        if (game.winner === 0 && game.team1Score === 0 && game.team2Score === 0) {
            continue; // Game not finished
        }

        stats.total_games++;

        const isTeam1 = game.team1Id === teamId;
        const myScore = isTeam1 ? game.team1Score : game.team2Score;
        const opponentScore = isTeam1 ? game.team2Score : game.team1Score;
        const myEloChange = isTeam1 ? game.team1EloChange : game.team2EloChange;

        stats.goals_scored += myScore;
        stats.goals_conceded += opponentScore;

        // Update latest ELO rating if available
        if (myEloChange !== undefined) {
            stats.elo_rating = myEloChange;
        }

        let result: string;
        
        // Check if timeout defeat
        if (game.finishReason === 2 || game.finishReason === 3) {
            // Timeout finish reason
            const didIWin = (isTeam1 && game.winner === 1) || (!isTeam1 && game.winner === 2);
            if (didIWin) {
                stats.wins++;
                result = 'VICTORY';
            } else {
                stats.losses++;
                result = 'DEFEAT_BY_TIMEOUT';
            }
        } else {
            // Normal finish
            if (game.winner === 0) {
                stats.draws++;
                result = 'DRAW';
            } else {
                const didIWin = (isTeam1 && game.winner === 1) || (!isTeam1 && game.winner === 2);
                if (didIWin) {
                    stats.wins++;
                    result = 'VICTORY';
                } else {
                    stats.losses++;
                    result = 'DEFEAT';
                }
            }
        }

        stats.last_game_results.push(result);
    }

    // Keep only last 10 games (most recent)
    if (stats.last_game_results.length > 10) {
        stats.last_game_results = stats.last_game_results.slice(-10);
    }

    return stats;
}

// FIXED: Get all teams that had games between monthStart and monthEnd
async function getTeamsForMonth(supabase: any, year: number, month: number): Promise<number[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const { data, error } = await supabase
        .from('games')
        .select('team1, team2')
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', monthEnd.toISOString());

    if (error) {
        console.error('Error fetching teams:', error);
        return [];
    }

    const teamIds = new Set<number>();
    data?.forEach((game: any) => {
        teamIds.add(game.team1);
        teamIds.add(game.team2);
    });

    return Array.from(teamIds);
}

// Get team by wallet address
async function getTeamByWallet(supabase: any, wallet: string): Promise<number | null> {
    const { data, error } = await supabase
        .from('teams')
        .select('id')
        .eq('primary_wallet', wallet)
        .single();

    if (error) {
        console.error('Error fetching team by wallet:', error);
        return null;
    }

    return data?.id || null;
}

// Update team stats in database
async function updateTeamStats(supabase: any, stats: TeamStats): Promise<boolean> {
    try {
        const updateData: any = {
            team_id: stats.team_id,
            total_games: stats.total_games,
            wins: stats.wins,
            draws: stats.draws,
            losses: stats.losses,
            goals_scored: stats.goals_scored,
            goals_conceded: stats.goals_conceded,
            last_game_results: stats.last_game_results,
            updated_at: new Date().toISOString()
        };

        // Only include ELO if it was captured
        if (stats.elo_rating !== undefined) {
            updateData.elo_rating = stats.elo_rating;
        }

        const { error } = await supabase
            .from('team_stats')
            .upsert(updateData, {
                onConflict: 'team_id'
            });

        if (error) {
            console.error('Error updating team stats:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error in updateTeamStats:', error);
        return false;
    }
}

// Main function to recalculate stats
async function recalculateTeamStatsFromChain(
    year: number,
    month: number,
    contractAddress: string,
    teamIdOrWallet?: number | string,
    allTeams: boolean = false
): Promise<void> {
    console.log(`\n🔄 Recalculating team stats from on-chain data`);
    console.log(`📅 Period: ${year}-${String(month).padStart(2, '0')}`);
    console.log(`📍 Contract: ${contractAddress}`);

    const supabase = createSupabaseClient();
    const viemClient = createViemClient();

    // Get block range for the month
    const { fromBlock, toBlock } = await getBlockRangeForMonth(viemClient, year, month);

    // Fetch all events for the month
    console.log(`\n📡 Fetching events from Basescan...`);
    const events = await fetchEventsFromBasescan(contractAddress, fromBlock, toBlock);
    console.log(`\n✅ Found ${events.length} total events`);

    if (events.length === 0) {
        console.log(`\n⚠️  No events found. Check your API key and date range.`);
        return;
    }

    // Process events to reconstruct games
    console.log(`\n🎮 Processing events to reconstruct games...`);
    const gamesMap = processEventsToGames(events);
    console.log(`✅ Reconstructed ${gamesMap.size} games`);

    // Determine which teams to process
    let teamsToProcess: number[] = [];

    if (allTeams) {
        console.log(`\n👥 Getting all teams for the month...`);
        teamsToProcess = await getTeamsForMonth(supabase, year, month);
        console.log(`✅ Found ${teamsToProcess.length} teams`);
    } else if (teamIdOrWallet) {
        if (typeof teamIdOrWallet === 'string') {
            console.log(`\n👤 Looking up team by wallet: ${teamIdOrWallet}`);
            const teamId = await getTeamByWallet(supabase, teamIdOrWallet);
            if (teamId) {
                teamsToProcess = [teamId];
                console.log(`✅ Found team ID: ${teamId}`);
            } else {
                console.error(`❌ No team found for wallet: ${teamIdOrWallet}`);
                return;
            }
        } else {
            teamsToProcess = [teamIdOrWallet];
        }
    } else {
        console.error(`❌ Must specify either teamId, wallet, or --all flag`);
        return;
    }

    // Process each team
    console.log(`\n📊 Processing ${teamsToProcess.length} team(s)...`);
    let successCount = 0;

    for (const teamId of teamsToProcess) {
        console.log(`\n👤 Team ${teamId}:`);

        // Filter games for this team
        const teamGames = Array.from(gamesMap.values()).filter(
            game => game.team1Id === teamId || game.team2Id === teamId
        );

        console.log(`  🎮 Found ${teamGames.length} games`);

        if (teamGames.length === 0) {
            console.log(`  ⏭️  No games, skipping...`);
            continue;
        }

        // Calculate stats
        const stats = calculateTeamStats(teamId, teamGames);

        console.log(`  📈 Stats calculated:`);
        console.log(`    Total: ${stats.total_games} | W: ${stats.wins} | D: ${stats.draws} | L: ${stats.losses}`);
        console.log(`    Goals: ${stats.goals_scored} scored, ${stats.goals_conceded} conceded`);
        console.log(`    ELO: ${stats.elo_rating !== undefined ? stats.elo_rating : 'N/A'}`);
        console.log(`    Last results: ${stats.last_game_results.join(', ')}`);

        // Update database
        const success = await updateTeamStats(supabase, stats);
        if (success) {
            console.log(`  ✅ Stats updated in database`);
            successCount++;
        } else {
            console.log(`  ❌ Failed to update stats`);
        }
    }

    console.log(`\n🎉 Completed! ${successCount}/${teamsToProcess.length} teams updated successfully`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: yarn ts-node scripts/recalculate-team-stats-from-chain.ts <year> <month> [options]');
        console.log('\nOptions:');
        console.log('  --team <teamId>      Process specific team ID');
        console.log('  --wallet <address>   Process team with specific wallet');
        console.log('  --all                Process all teams for the month');
        console.log('  --contract <address> Contract address (optional)');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/recalculate-team-stats-from-chain.ts 2024 9 --team 1');
        console.log('  yarn ts-node scripts/recalculate-team-stats-from-chain.ts 2024 9 --wallet 0x1234...');
        console.log('  yarn ts-node scripts/recalculate-team-stats-from-chain.ts 2024 9 --all');
        return;
    }

    const year = parseInt(args[0]);
    const month = parseInt(args[1]);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        console.error('❌ Invalid year or month');
        return;
    }

    let teamIdOrWallet: number | string | undefined;
    let allTeams = false;
    let contractAddress = deployment.baseMainnet?.proxyAddress;

    // Parse options
    for (let i = 2; i < args.length; i++) {
        if (args[i] === '--team' && args[i + 1]) {
            teamIdOrWallet = parseInt(args[i + 1]);
            i++;
        } else if (args[i] === '--wallet' && args[i + 1]) {
            teamIdOrWallet = args[i + 1];
            i++;
        } else if (args[i] === '--all') {
            allTeams = true;
        } else if (args[i] === '--contract' && args[i + 1]) {
            contractAddress = args[i + 1];
            i++;
        }
    }

    if (!contractAddress) {
        console.error('❌ Contract address not found');
        return;
    }

    try {
        await recalculateTeamStatsFromChain(year, month, contractAddress, teamIdOrWallet, allTeams);
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { recalculateTeamStatsFromChain };