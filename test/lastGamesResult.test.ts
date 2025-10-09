// lastGamesResults.test.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types
type GameStatus = 'active' | 'finished' | 'finished_by_timeout';
type GameResult = 'VICTORY' | 'DRAW' | 'DEFEAT' | 'DEFEAT_BY_TIMEOUT';

interface Team {
  id: number;
  name: string;
  last_games_results: GameResult[];
}

interface Game {
  id: number;
  team1: number;
  team2: number;
  winner: number | null;
  status: GameStatus;
  created_at: string;
}

describe('Last Games Results Functionality', () => {
  let supabase: SupabaseClient;
  let testTeams: { teamA: Team; teamB: Team; teamC: Team };

  beforeAll(() => {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    supabase = createClient(supabaseUrl, supabaseKey);
  });

  beforeEach(async () => {
    // Clean up test data
    await cleanupTestData();
    
    // Create fresh test teams
    testTeams = await setupTestTeams();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestData();
  });

  // Helper Functions
  async function cleanupTestData() {
    // Delete test games first (foreign key constraint)
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .like('name', 'TEST_TEAM_%');

    if (teams && teams.length > 0) {
      const teamIds = teams.map(t => t.id);
      
      await supabase
        .from('games')
        .delete()
        .or(`team1.in.(${teamIds.join(',')}),team2.in.(${teamIds.join(',')})`);
    }

    // Delete test teams
    await supabase
      .from('teams')
      .delete()
      .like('name', 'TEST_TEAM_%');
  }

  async function setupTestTeams() {
    const { data: teamA, error: errorA } = await supabase
      .from('teams')
      .insert({ name: 'TEST_TEAM_A', last_games_results: [] })
      .select()
      .single();

    const { data: teamB, error: errorB } = await supabase
      .from('teams')
      .insert({ name: 'TEST_TEAM_B', last_games_results: [] })
      .select()
      .single();

    const { data: teamC, error: errorC } = await supabase
      .from('teams')
      .insert({ name: 'TEST_TEAM_C', last_games_results: [] })
      .select()
      .single();

    if (errorA || errorB || errorC) {
      throw new Error('Failed to setup test teams');
    }

    return { teamA: teamA!, teamB: teamB!, teamC: teamC! };
  }

  async function getTeamResults(teamId: number): Promise<GameResult[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('last_games_results')
      .eq('id', teamId)
      .single();

    if (error) throw error;
    return data.last_games_results || [];
  }

  async function createGame(
    team1Id: number,
    team2Id: number,
    winnerId: number | null,
    status: GameStatus,
    createdAt?: Date
  ): Promise<Game> {
    const { data, error } = await supabase
      .from('games')
      .insert({
        team1: team1Id,
        team2: team2Id,
        winner: winnerId,
        status: status,
        created_at: createdAt?.toISOString() || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function updateGameStatus(
    gameId: number,
    status: GameStatus,
    winnerId: number | null
  ): Promise<Game> {
    const { data, error } = await supabase
      .from('games')
      .update({ status, winner: winnerId })
      .eq('id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Tests
  describe('TEST 1: Single game - Team A wins', () => {
    it('should record VICTORY for winner and DEFEAT for loser', async () => {
      // Create a finished game where team A wins
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamA.id,
        'finished'
      );

      // Small delay to ensure trigger completes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify results
      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      expect(teamAResults).toEqual(['VICTORY']);
      expect(teamBResults).toEqual(['DEFEAT']);
    });
  });

  describe('TEST 2: Draw game', () => {
    it('should record DRAW for both teams', async () => {
      // Create a draw game (winner is NULL)
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        null,
        'finished'
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      expect(teamAResults).toEqual(['DRAW']);
      expect(teamBResults).toEqual(['DRAW']);
    });
  });

  describe('TEST 3: Timeout defeat', () => {
    it('should record DEFEAT_BY_TIMEOUT for loser and VICTORY for winner', async () => {
      // Create a timeout game where team B wins (team A loses by timeout)
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamB.id,
        'finished_by_timeout'
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      expect(teamAResults).toEqual(['DEFEAT_BY_TIMEOUT']);
      expect(teamBResults).toEqual(['VICTORY']);
    });
  });

  describe('TEST 4: Multiple games - check no duplicates', () => {
    it('should add exactly one result per game', async () => {
      // Insert 5 games
      for (let i = 0; i < 5; i++) {
        await createGame(
          testTeams.teamA.id,
          testTeams.teamB.id,
          testTeams.teamA.id,
          'finished',
          new Date(Date.now() + i * 1000) // Stagger creation times
        );
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      // Should have exactly 5 entries, not 10 (no duplicates)
      expect(teamAResults).toHaveLength(5);
      expect(teamBResults).toHaveLength(5);
      
      // All should be the correct result type
      expect(teamAResults.every(r => r === 'VICTORY')).toBe(true);
      expect(teamBResults.every(r => r === 'DEFEAT')).toBe(true);
    });
  });

  describe('TEST 5: Array limit - max 10 games', () => {
    it('should maintain exactly 10 results maximum', async () => {
      // Insert 15 games (more than the limit)
      for (let i = 0; i < 15; i++) {
        await createGame(
          testTeams.teamA.id,
          testTeams.teamB.id,
          testTeams.teamA.id,
          'finished',
          new Date(Date.now() + i * 1000)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      // Should have exactly 10 entries (the limit)
      expect(teamAResults).toHaveLength(10);
      expect(teamBResults).toHaveLength(10);
    });

    it('should keep the most recent 10 games', async () => {
      // Insert games with alternating winners
      for (let i = 0; i < 15; i++) {
        const winner = i % 2 === 0 ? testTeams.teamA.id : testTeams.teamB.id;
        await createGame(
          testTeams.teamA.id,
          testTeams.teamB.id,
          winner,
          'finished',
          new Date(Date.now() + i * 1000)
        );
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const teamAResults = await getTeamResults(testTeams.teamA.id);

      // Should have 10 results
      expect(teamAResults).toHaveLength(10);
      
      // The last 10 games: games 5-14 (indices start at 0)
      // Game indices: 5,6,7,8,9,10,11,12,13,14
      // Winners: A,B,A,B,A,B,A,B,A,B
      // Expected for Team A: D,V,D,V,D,V,D,V,D,V
      const expected: GameResult[] = [
        'DEFEAT', 'VICTORY', 'DEFEAT', 'VICTORY', 'DEFEAT',
        'VICTORY', 'DEFEAT', 'VICTORY', 'DEFEAT', 'VICTORY'
      ];
      
      expect(teamAResults).toEqual(expected);
    });
  });

  describe('TEST 6: Game UPDATE scenario', () => {
    it('should not add duplicate results when updating from in_progress to finished', async () => {
      // Insert a game in progress
      const game = await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        null,
        'active'
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify no results yet
      let teamAResults = await getTeamResults(testTeams.teamA.id);
      expect(teamAResults).toHaveLength(0);

      // Update game to finished
      await updateGameStatus(game.id, 'finished', testTeams.teamA.id);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify result added exactly once
      teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      expect(teamAResults).toHaveLength(1);
      expect(teamAResults).toEqual(['VICTORY']);
      expect(teamBResults).toHaveLength(1);
      expect(teamBResults).toEqual(['DEFEAT']);
    });

    it('should not add duplicate when updating already finished game', async () => {
      // Create a finished game
      const game = await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamA.id,
        'finished'
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify initial results
      let teamAResults = await getTeamResults(testTeams.teamA.id);
      expect(teamAResults).toHaveLength(1);

      // Update the same finished game (e.g., correcting winner)
      await updateGameStatus(game.id, 'finished', testTeams.teamB.id);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still have only 1 result (no duplicate added)
      teamAResults = await getTeamResults(testTeams.teamA.id);
      expect(teamAResults).toHaveLength(1);
    });
  });

  describe('TEST 7: Mixed game types sequence', () => {
    it('should correctly record sequence of different result types', async () => {
      const baseTime = Date.now();

      // Game 1: A wins against B
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamA.id,
        'finished',
        new Date(baseTime + 1000)
      );

      // Game 2: A draws with C
      await createGame(
        testTeams.teamA.id,
        testTeams.teamC.id,
        null,
        'finished',
        new Date(baseTime + 2000)
      );

      // Game 3: A loses by timeout to B
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamB.id,
        'finished_by_timeout',
        new Date(baseTime + 3000)
      );

      // Game 4: A loses normally to C
      await createGame(
        testTeams.teamA.id,
        testTeams.teamC.id,
        testTeams.teamC.id,
        'finished',
        new Date(baseTime + 4000)
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify Team A has correct sequence
      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const expected: GameResult[] = ['VICTORY', 'DRAW', 'DEFEAT_BY_TIMEOUT', 'DEFEAT'];

      expect(teamAResults).toEqual(expected);
    });
  });

  describe('TEST 8: Concurrent games', () => {
    it('should handle multiple simultaneous game completions', async () => {
      // Create multiple games at the same time
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          createGame(
            testTeams.teamA.id,
            testTeams.teamB.id,
            i % 2 === 0 ? testTeams.teamA.id : testTeams.teamB.id,
            'finished',
            new Date(Date.now() + i * 100)
          )
        );
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 200));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);

      // Should have exactly 5 results each
      expect(teamAResults).toHaveLength(5);
      expect(teamBResults).toHaveLength(5);

      // Count should match expected wins/losses
      const teamAVictories = teamAResults.filter(r => r === 'VICTORY').length;
      const teamBVictories = teamBResults.filter(r => r === 'VICTORY').length;

      expect(teamAVictories).toBe(3); // Games 0, 2, 4
      expect(teamBVictories).toBe(2); // Games 1, 3
    });
  });

  describe('TEST 9: Team plays different opponents', () => {
    it('should track results across multiple opponents', async () => {
      const baseTime = Date.now();

      // Team A vs Team B - A wins
      await createGame(
        testTeams.teamA.id,
        testTeams.teamB.id,
        testTeams.teamA.id,
        'finished',
        new Date(baseTime + 1000)
      );

      // Team A vs Team C - A wins
      await createGame(
        testTeams.teamA.id,
        testTeams.teamC.id,
        testTeams.teamA.id,
        'finished',
        new Date(baseTime + 2000)
      );

      // Team B vs Team C - B wins
      await createGame(
        testTeams.teamB.id,
        testTeams.teamC.id,
        testTeams.teamB.id,
        'finished',
        new Date(baseTime + 3000)
      );

      await new Promise(resolve => setTimeout(resolve, 200));

      const teamAResults = await getTeamResults(testTeams.teamA.id);
      const teamBResults = await getTeamResults(testTeams.teamB.id);
      const teamCResults = await getTeamResults(testTeams.teamC.id);

      expect(teamAResults).toEqual(['VICTORY', 'VICTORY']);
      expect(teamBResults).toEqual(['DEFEAT', 'VICTORY']);
      expect(teamCResults).toEqual(['DEFEAT', 'DEFEAT']);
    });
  });
});