// ============================================================================
// FILE: app/api/zealy/verify-user-played-game/route.ts
// Verify if user has played at least one game today
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAnonClient } from '@/lib/supabase';

const ZEALY_API_KEY = process.env.ZEALY_API_KEY;

export async function POST(req: NextRequest) {
  if (!ZEALY_API_KEY) {
    throw new Error("ZEALY_API_KEY is not set");
  }

  try {
    // Verify API key from Zealy
    const apiKey = req.headers.get('x-api-key');
    console.log('apiKey received', apiKey);
    if (apiKey !== ZEALY_API_KEY) {
      console.error('Invalid API key received');
      return NextResponse.json({
        message: 'Invalid API key'
      }, { status: 400 });
    }

    const body = await req.json();
    const {
      userId,
      communityId,
      subdomain,
      questId,
      requestId,
      accounts
    } = body;

    // Get the Zealy Connect identifier (wallet address)
    const zealyConnectIdentifier = accounts?.['zealy-connect'];

    if (!zealyConnectIdentifier) {
      return NextResponse.json({
        message: 'Account not connected. Please connect your TactiBall account first by clicking the Connect button in the quest!'
      }, { status: 400 });
    }

    const supabase = createAnonClient();

    // Verify team exists and has correct Zealy user ID
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, name, primary_wallet, zealy_user_id')
      .eq('primary_wallet', zealyConnectIdentifier)
      .maybeSingle();

    if (teamError) {
      console.error('Database error:', teamError, 'RequestID:', requestId);
      return NextResponse.json({
        message: `Database error occurred. Please contact support with Request ID: ${requestId}`
      }, { status: 400 });
    }

    if (!team) {
      return NextResponse.json({
        message: `No TactiBall team found for this account. Please create a team at play.tactiball.fun first!`
      }, { status: 400 });
    }

    // Verify the Zealy user ID matches or set it if not set
    if (team.zealy_user_id && team.zealy_user_id !== userId) {
      return NextResponse.json({
        message: `Account mismatch detected. Please reconnect your account.`
      }, { status: 400 });
    }

    // Update zealy_user_id if not set
    if (!team.zealy_user_id) {
      await supabase
        .from('teams')
        .update({ zealy_user_id: userId })
        .eq('id', team.id);
    }

    // Get today's start time (00:00:00 UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    // Query for games played today - using correct schema column names
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, status, created_at, team1, team2')
      .or(`team1.eq.${team.id},team2.eq.${team.id}`)
      .eq('status', 'finished')
      .gte('created_at', todayStartISO)
      .limit(1);

    if (gamesError) {
      console.error('Error querying games:', gamesError, 'RequestID:', requestId);
      return NextResponse.json({
        message: `Error checking games. Please contact support with Request ID: ${requestId}`
      }, { status: 400 });
    }

    if (!games || games.length === 0) {
      return NextResponse.json({
        message: `No games played today. Play at least one game at play.tactiball.fun to complete this quest!`
      }, { status: 400 });
    }

    // Quest completed successfully!
    return NextResponse.json({
      message: `✅ Quest completed! Team ${team.name} has played a game today!`
    }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in Zealy verification:', error);
    return NextResponse.json({
      message: 'An unexpected error occurred. Please try again later.'
    }, { status: 400 });
  }
}