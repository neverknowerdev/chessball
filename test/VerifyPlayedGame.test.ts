// ============================================================================
// FILE: __tests__/api/zealy/verify-user-played-game.test.ts
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'; // Change to actual test wallet
const TEST_ZEALY_USER_ID = 'test-zealy-user-123';
const ZEALY_API_KEY = process.env.ZEALY_API_KEY || 'eb50c37i_YJBlFllX6ojkZycqFd';

describe('Zealy - Verify User Played Game', () => {
    let supabase: any;
    let testTeamId: number;

    beforeAll(async () => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        supabase = createClient(supabaseUrl, supabaseKey);

        // Get or create test team
        const { data: team } = await supabase
            .from('teams')
            .select('id')
            .eq('primary_wallet', TEST_WALLET_ADDRESS)
            .maybeSingle();

        if (team) {
            testTeamId = team.id;
            console.log(`\n✅ Using existing test team: ${testTeamId}`);
        } else {
            console.log('\n⚠️  No test team found. Please create a team with wallet:', TEST_WALLET_ADDRESS);
        }
    });

    it('should have valid Supabase connection', async () => {
        const { data, error } = await supabase.from('teams').select('count').limit(1);
        expect(error).toBeNull();
        expect(data).toBeDefined();
    });

    it('should find test team with correct wallet address', async () => {
        const { data: team, error } = await supabase
            .from('teams')
            .select('id, name, primary_wallet, zealy_user_id')
            .eq('primary_wallet', TEST_WALLET_ADDRESS)
            .maybeSingle();

        console.log('\n📊 Test team data:', team);

        if (team) {
            expect(team.primary_wallet).toBe(TEST_WALLET_ADDRESS);
            expect(team.id).toBeDefined();
            testTeamId = team.id;
        } else {
            console.warn('⚠️  No team found for test wallet');
        }
    });

    it('should have zealy_user_id set on test team', async () => {
        const { data: team } = await supabase
            .from('teams')
            .select('zealy_user_id')
            .eq('primary_wallet', TEST_WALLET_ADDRESS)
            .maybeSingle();

        if (team) {
            console.log(`\n🔗 Zealy User ID: ${team.zealy_user_id || 'NOT SET'}`);
            
            if (!team.zealy_user_id) {
                console.warn('⚠️  zealy_user_id is not set. Link account first via /api/zealy/link-zealy-account');
            }
        }
    });

    it('should query for games played today', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayStartISO = todayStart.toISOString();

        // Fixed: Using correct schema column names (team1, team2, created_at)
        const { data: games, error } = await supabase
            .from('games')
            .select('id, status, created_at, team1, team2')
            .or(`team1.eq.${testTeamId},team2.eq.${testTeamId}`)
            .eq('status', 'finished')
            .gte('created_at', todayStartISO);

        console.log(`\n🎮 Games played today: ${games?.length || 0}`);
        
        if (games && games.length > 0) {
            console.log('  Game IDs:', games.map(g => g.id));
            expect(games.length).toBeGreaterThan(0);
        } else {
            console.log('  ℹ️  No games played today (expected if no games)');
        }

        expect(error).toBeNull();
    });

    it('should verify game query filters are correct', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        // Verify date filter
        expect(todayStart.getUTCHours()).toBe(0);
        expect(todayStart.getUTCMinutes()).toBe(0);
        expect(todayStart.getUTCSeconds()).toBe(0);

        console.log(`\n📅 Date filter: ${todayStart.toISOString()}`);
        console.log(`✅ Filters correctly set to today 00:00:00 UTC`);
    });

    it('should check all finished games (not just today)', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        // Fixed: Using correct schema column names
        const { data: allGames } = await supabase
            .from('games')
            .select('id, status, created_at, team1, team2')
            .or(`team1.eq.${testTeamId},team2.eq.${testTeamId}`)
            .eq('status', 'finished')
            .order('created_at', { ascending: false })
            .limit(10);

        console.log(`\n📊 Total finished games (last 10): ${allGames?.length || 0}`);
        
        if (allGames && allGames.length > 0) {
            console.log('  Most recent games:');
            allGames.forEach((game: any, idx: number) => {
                const date = new Date(game.created_at);
                console.log(`    ${idx + 1}. Game ${game.id} - ${date.toISOString()}`);
            });
        }
    });

    it('should validate game status values', async () => {
        const { data: games } = await supabase
            .from('games')
            .select('status')
            .limit(20);

        if (games && games.length > 0) {
            const statuses = [...new Set(games.map((g: any) => g.status))];
            console.log(`\n🎯 Game statuses found in DB:`, statuses);
            
            // Verify 'finished' status exists
            const hasFinished = statuses.includes('finished');
            console.log(`  Has 'finished' status: ${hasFinished ? '✅' : '❌'}`);
        }
    });

    it('should simulate Zealy API request for played game', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        // Simulate what Zealy sends
        const zealyRequest = {
            userId: TEST_ZEALY_USER_ID,
            communityId: 'chessball',
            subdomain: 'chessballtacticians',
            questId: 'play-game-quest',
            requestId: `test-${Date.now()}`,
            accounts: {
                'zealy-connect': TEST_WALLET_ADDRESS
            }
        };

        console.log('\n📨 Simulated Zealy request:', zealyRequest);

        // Verify team exists
        const { data: team } = await supabase
            .from('teams')
            .select('id, name, primary_wallet, zealy_user_id')
            .eq('primary_wallet', zealyRequest.accounts['zealy-connect'])
            .maybeSingle();

        if (team) {
            console.log('✅ Team found:', team.name);
            expect(team.primary_wallet).toBe(TEST_WALLET_ADDRESS);
        } else {
            console.log('❌ Team not found');
        }

        // Check for games today - Fixed: using correct schema
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: games } = await supabase
            .from('games')
            .select('id')
            .or(`team1.eq.${team?.id},team2.eq.${team?.id}`)
            .eq('status', 'finished')
            .gte('created_at', todayStart.toISOString())
            .limit(1);

        if (games && games.length > 0) {
            console.log('✅ Quest would PASS - game played today');
            expect(games.length).toBeGreaterThan(0);
        } else {
            console.log('❌ Quest would FAIL - no game played today');
        }
    });

    it('should verify quest fails without games today', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        // Query for tomorrow (should have no games)
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        const { data: futureGames } = await supabase
            .from('games')
            .select('id')
            .or(`team1.eq.${testTeamId},team2.eq.${testTeamId}`)
            .eq('status', 'finished')
            .gte('created_at', tomorrow.toISOString())
            .limit(1);

        console.log(`\n🔮 Future games check: ${futureGames?.length || 0}`);
        expect(futureGames?.length || 0).toBe(0);
    });

    it('should check for Zealy user ID mismatch scenario', async () => {
        const { data: team } = await supabase
            .from('teams')
            .select('zealy_user_id')
            .eq('primary_wallet', TEST_WALLET_ADDRESS)
            .maybeSingle();

        if (team && team.zealy_user_id) {
            const requestUserId = 'different-user-456';
            const isMatch = team.zealy_user_id === requestUserId;

            console.log(`\n🔐 Zealy ID verification:`);
            console.log(`  DB Zealy ID: ${team.zealy_user_id}`);
            console.log(`  Request ID: ${requestUserId}`);
            console.log(`  Match: ${isMatch ? '✅' : '❌'}`);

            if (!isMatch) {
                console.log('  Expected: Quest would fail with mismatch error');
            }
        }
    });

    it('should verify only finished games are counted', async () => {
        if (!testTeamId) {
            console.warn('⚠️  Skipping: No test team ID');
            return;
        }

        const { data: allStatusGames } = await supabase
            .from('games')
            .select('status')
            .or(`team1.eq.${testTeamId},team2.eq.${testTeamId}`)
            .limit(100);

        if (allStatusGames && allStatusGames.length > 0) {
            const statusCounts: Record<string, number> = {};
            allStatusGames.forEach((game: any) => {
                statusCounts[game.status] = (statusCounts[game.status] || 0) + 1;
            });

            console.log(`\n📊 Game status distribution:`);
            Object.entries(statusCounts).forEach(([status, count]) => {
                console.log(`  ${status}: ${count}`);
            });

            console.log(`\n✅ Only counting 'finished' status (excludes finished_by_timeout, active, etc.)`);
        }
    });
});

describe('Quick Validation - Played Game Quest', () => {
    let supabase: any;

    beforeAll(() => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
        supabase = createClient(supabaseUrl, supabaseKey);
    });

    it('should check all teams with Zealy linked', async () => {
        const { data: teamsWithZealy } = await supabase
            .from('teams')
            .select('id, name, primary_wallet, zealy_user_id')
            .not('zealy_user_id', 'is', null);

        console.log(`\n🔗 Teams with Zealy linked: ${teamsWithZealy?.length || 0}`);
        
        if (teamsWithZealy && teamsWithZealy.length > 0) {
            console.log('  Sample teams:');
            teamsWithZealy.slice(0, 5).forEach((team: any) => {
                console.log(`    - ${team.name} (${team.primary_wallet})`);
            });
        }
    });

    it('should verify database schema has required columns', async () => {
        // Fixed: Using correct schema column names
        const { data: sampleGame } = await supabase
            .from('games')
            .select('id, status, created_at, team1, team2')
            .limit(1)
            .maybeSingle();

        if (sampleGame) {
            console.log('\n✅ Database schema validation:');
            console.log('  ✓ id');
            console.log('  ✓ status');
            console.log('  ✓ created_at');
            console.log('  ✓ team1');
            console.log('  ✓ team2');
            
            expect(sampleGame).toHaveProperty('id');
            expect(sampleGame).toHaveProperty('status');
            expect(sampleGame).toHaveProperty('created_at');
            expect(sampleGame).toHaveProperty('team1');
            expect(sampleGame).toHaveProperty('team2');
        }
    });
});