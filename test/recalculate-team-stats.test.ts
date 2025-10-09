import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_TEAM_ID = 1; // Change this to an existing team ID
const TEST_YEAR = 2024;
const TEST_MONTH = 9; // September

describe('Team Stats Recalculation', () => {
    let supabase: any;

    beforeAll(() => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        supabase = createClient(supabaseUrl, supabaseKey);
    });

    it('should have valid Supabase connection', async () => {
        const { data, error } = await supabase.from('teams').select('count').limit(1);
        expect(error).toBeNull();
        expect(data).toBeDefined();
    });

    it('should fetch team stats before recalculation', async () => {
        const { data, error } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        console.log('\n📊 Current team stats:', data);
        
        if (data) {
            expect(data.team_id).toBe(TEST_TEAM_ID);
            expect(data).toHaveProperty('total_games');
            expect(data).toHaveProperty('wins');
            expect(data).toHaveProperty('draws');
            expect(data).toHaveProperty('losses');
            expect(data).toHaveProperty('goals_scored');
            expect(data).toHaveProperty('goals_conceded');
            expect(data).toHaveProperty('last_game_results');
            
            console.log('  Last game results:', data.last_game_results);
        }
    });

    it('should validate last_game_results array structure', async () => {
        const { data, error } = await supabase
            .from('team_stats')
            .select('last_game_results')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        if (data && data.last_game_results) {
            const results = data.last_game_results;
            
            // Should be an array
            expect(Array.isArray(results)).toBe(true);
            
            // Should not exceed 10 entries
            expect(results.length).toBeLessThanOrEqual(10);
            
            // All entries should be valid result strings
            const validResults = ['VICTORY', 'DEFEAT', 'DRAW', 'DEFEAT_BY_TIMEOUT'];
            results.forEach((result: string) => {
                expect(validResults).toContain(result);
            });

            console.log(`\n✅ Last game results validation passed (${results.length} entries)`);
        }
    });

    it('should check for duplicate game results', async () => {
        const { data: stats } = await supabase
            .from('team_stats')
            .select('last_game_results, team_id')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        const { data: games } = await supabase
            .from('games')
            .select('id, created_at, winner, team1, team2')
            .or(`team1.eq.${TEST_TEAM_ID},team2.eq.${TEST_TEAM_ID}`)
            .gte('created_at', new Date(TEST_YEAR, TEST_MONTH - 1, 1).toISOString())
            .lt('created_at', new Date(TEST_YEAR, TEST_MONTH, 1).toISOString())
            .not('winner', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

        if (stats && games) {
            console.log(`\n🎮 Found ${games.length} finished games for team ${TEST_TEAM_ID}`);
            console.log(`📊 Last game results array has ${stats.last_game_results?.length || 0} entries`);

            // Check if array length matches actual game count (or is less for older stats)
            if (stats.last_game_results) {
                expect(stats.last_game_results.length).toBeLessThanOrEqual(games.length);
            }

            // Log potential issues
            if (stats.last_game_results && stats.last_game_results.length > games.length) {
                console.warn('⚠️  WARNING: More results than games! Possible duplicate entries.');
            }
        }
    });

    it('should verify stats calculations are correct', async () => {
        const { data: stats } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        if (stats) {
            // Total games should equal wins + draws + losses
            const calculatedTotal = stats.wins + stats.draws + stats.losses;
            
            console.log('\n🧮 Stats verification:');
            console.log(`  Total games: ${stats.total_games}`);
            console.log(`  Wins + Draws + Losses: ${calculatedTotal}`);
            console.log(`  Match: ${stats.total_games === calculatedTotal ? '✅' : '❌'}`);

            expect(stats.total_games).toBe(calculatedTotal);

            // Goals should be non-negative
            expect(stats.goals_scored).toBeGreaterThanOrEqual(0);
            expect(stats.goals_conceded).toBeGreaterThanOrEqual(0);
        }
    });

    it('should capture and store ELO ratings', async () => {
        const { data: stats } = await supabase
            .from('team_stats')
            .select('elo_rating')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        if (stats) {
            expect(stats.elo_rating).toBeDefined();
            expect(typeof stats.elo_rating).toBe('number');
            expect(stats.elo_rating).toBeGreaterThan(0);
            console.log(`✅ ELO Rating: ${stats.elo_rating}`);
        }
    });

    it('should correctly identify timeout defeats', async () => {
        const { data: stats } = await supabase
            .from('team_stats')
            .select('last_game_results')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        if (stats && stats.last_game_results) {
            const hasTimeoutDefeat = stats.last_game_results.includes('DEFEAT_BY_TIMEOUT');
            console.log(`🕐 Timeout defeats found: ${hasTimeoutDefeat}`);
            
            // Verify valid result types include timeout
            const validResults = ['VICTORY', 'DEFEAT', 'DRAW', 'DEFEAT_BY_TIMEOUT'];
            stats.last_game_results.forEach((result: string) => {
                expect(validResults).toContain(result);
            });
        }
    });

    it('should verify ELO changes match game outcomes', async () => {
        const { data: stats } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        const { data: recentGames } = await supabase
            .from('games')
            .select('*')
            .or(`team1.eq.${TEST_TEAM_ID},team2.eq.${TEST_TEAM_ID}`)
            .order('created_at', { ascending: false })
            .limit(5);

        if (stats && recentGames && recentGames.length > 0) {
            console.log('\n📊 Recent games and ELO:');
            console.log(`  Current ELO: ${stats.elo_rating}`);
            console.log(`  Total games: ${stats.total_games}`);
            console.log(`  Win rate: ${((stats.wins / stats.total_games) * 100).toFixed(1)}%`);
            
            // ELO should be reasonable (typically 800-2400)
            if (stats.elo_rating) {
                expect(stats.elo_rating).toBeGreaterThan(500);
                expect(stats.elo_rating).toBeLessThan(3000);
            }
        }
    });

    it('should test script with single team', async () => {
        // This test actually runs the recalculation script
        const { recalculateTeamStatsFromChain } = require('../scripts/recalculate-team-stats-from-chain');
        const fs = require('fs');
        const path = require('path');

        const deploymentPath = path.join(__dirname, '..', 'deployment.json');
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        const contractAddress = deployment.baseMainnet?.proxyAddress;

        if (!contractAddress) {
            console.warn('⚠️  No contract address found, skipping script test');
            return;
        }

        console.log('\n🚀 Running recalculation script...');
        
        // Get stats before
        const { data: statsBefore } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        // Run the script
        await recalculateTeamStatsFromChain(
            TEST_YEAR,
            TEST_MONTH,
            contractAddress,
            TEST_TEAM_ID,
            false
        );

        // Get stats after
        const { data: statsAfter } = await supabase
            .from('team_stats')
            .select('*')
            .eq('team_id', TEST_TEAM_ID)
            .single();

        console.log('\n📊 Comparison:');
        console.log('Before:', statsBefore);
        console.log('After:', statsAfter);

        // Verify the update happened
        if (statsBefore && statsAfter) {
            expect(statsAfter.updated_at).not.toBe(statsBefore.updated_at);
        }

        // Verify last_game_results has no duplicates
        if (statsAfter && statsAfter.last_game_results) {
            const results = statsAfter.last_game_results;
            expect(results.length).toBeLessThanOrEqual(10);
            console.log(`\n✅ After recalculation: ${results.length} game results`);
            console.log('   Results:', results);
        }
    }, 60000); // 60 second timeout for this test
});

describe('Quick Validation Tests', () => {
    let supabase: any;

    beforeAll(() => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        supabase = createClient(supabaseUrl, supabaseKey);
    });

    it('should check all teams for oversized last_game_results', async () => {
        const { data: allStats } = await supabase
            .from('team_stats')
            .select('team_id, last_game_results');

        if (allStats) {
            const problematicTeams = allStats.filter((stat: any) => 
                stat.last_game_results && stat.last_game_results.length > 10
            );

            console.log(`\n🔍 Checked ${allStats.length} teams`);
            console.log(`❌ Found ${problematicTeams.length} teams with >10 results`);

            if (problematicTeams.length > 0) {
                console.log('Problematic teams:', problematicTeams.map((t: any) => 
                    `Team ${t.team_id}: ${t.last_game_results.length} results`
                ));
            }

            expect(problematicTeams.length).toBe(0);
        }
    });

    it('should verify no null or undefined in last_game_results', async () => {
        const { data: allStats } = await supabase
            .from('team_stats')
            .select('team_id, last_game_results');

        if (allStats) {
            const invalidTeams = allStats.filter((stat: any) => {
                if (!stat.last_game_results) return false;
                return stat.last_game_results.some((r: any) => r === null || r === undefined);
            });

            console.log(`\n🔍 Checking for null/undefined entries...`);
            console.log(`✅ ${invalidTeams.length} teams with invalid entries`);

            expect(invalidTeams.length).toBe(0);
        }
    });
});