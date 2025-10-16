import { NextRequest, NextResponse } from 'next/server';
import { CONTRACT_ADDRESS } from '@/lib/contract';
import { createAnonClient } from '@/lib/supabase';
import { redis } from '@/lib/redis';

// Function to prettify numbers (1M, 140K, etc.)
function prettifyNumber(num: number): string {
    if (num >= 1_000_000) {
        const millions = num / 1_000_000;
        // Show one decimal place if it's significant, otherwise round
        return millions >= 10 || millions % 1 === 0 
            ? `${Math.round(millions)}M` 
            : `${Math.round(millions * 10) / 10}M`;
    }
    
    if (num >= 1_000) {
        const thousands = num / 1_000;
        // Show one decimal place if it's significant, otherwise round
        return thousands >= 10 || thousands % 1 === 0 
            ? `${Math.round(thousands)}K` 
            : `${Math.round(thousands * 10) / 10}K`;
    }
    
    // For numbers under 1000, format with commas
    return num.toLocaleString('en-US');
}

// Function to get event count from Basescan with caching
async function getEventCountFromBasescan(): Promise<number> {
    const cacheKey = `basescan-event-count:${CONTRACT_ADDRESS}`;

    // Check cache first
    if (redis) {
        try {
            const cachedCount = await redis.get(cacheKey);
            if (cachedCount !== null) {
                console.log('Returning cached event count from Basescan');
                return parseInt(cachedCount as string, 10);
            }
        } catch (cacheError) {
            console.warn('Redis cache read error:', cacheError);
        }
    }

    try {
        const apiKey = process.env.BASESCAN_API_KEY;
        if (!apiKey) {
            console.warn('BASESCAN_API_KEY not found, using fallback estimation');
            return 0;
        }

        // Get event logs for the contract address
        // We'll fetch logs for relevant events: GameStarted, MoveMade, GameStateChanged, GameFinished
        const url = `https://api.basescan.org/api?module=logs&action=getLogs&address=${CONTRACT_ADDRESS}&fromBlock=0&toBlock=latest&page=1&offset=10000&apikey=${apiKey}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Basescan API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== '1') {
            console.warn('Basescan API returned error:', data.message);
            return 0;
        }

        // Count events (result is an array of event logs)
        const eventCount = Array.isArray(data.result) ? data.result.length : 0;
        console.log(`Found ${eventCount} events for contract ${CONTRACT_ADDRESS}`);

        // Cache the result for 10 minutes (600 seconds)
        if (redis) {
            try {
                await redis.setex(cacheKey, 600, eventCount.toString());
                console.log('Cached event count from Basescan');
            } catch (cacheError) {
                console.warn('Redis cache write error:', cacheError);
            }
        }

        return eventCount;
    } catch (error) {
        console.error('Error fetching events from Basescan:', error);
        return 0;
    }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        // Get team count from Supabase
        const supabase = createAnonClient();
        const { count: teamCount, error: teamError } = await supabase
            .from('teams')
            .select('*', { count: 'exact', head: true });

        if (teamError) {
            console.error('Error fetching team count:', teamError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch team count' },
                { status: 500 }
            );
        }

        // Get total games count from Supabase
        const { count: gameCount, error: gameError } = await supabase
            .from('games')
            .select('*', { count: 'exact', head: true });

        if (gameError) {
            console.error('Error fetching game count:', gameError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch game count' },
                { status: 500 }
            );
        }

        // Get event count from Basescan API
        let eventCount = 0;
        try {
            // Try to get real event count from Basescan
            eventCount = await getEventCountFromBasescan();

            // Fallback to estimation if Basescan fails
            if (eventCount === 0) {
                console.log('Using fallback estimation for event count');
                // Estimate: ~45 events per game (moves + state changes) * 3 (average multiplier)
                // Based on your data: 45x3 events per game, 23 games played
                const estimatedEventsPerGame = 45 * 3;
                eventCount = (gameCount || 0) * estimatedEventsPerGame;
            }
        } catch (eventError) {
            console.error('Error fetching event count:', eventError);
            // Fallback to estimated count
            const estimatedEventsPerGame = 45 * 3;
            eventCount = (gameCount || 0) * estimatedEventsPerGame;
        }

        // Format the numbers for display
        const formattedEventCount = prettifyNumber(eventCount);
        const formattedTeamCount = prettifyNumber(teamCount || 0);
        const formattedGameCount = prettifyNumber(gameCount || 0);

        return NextResponse.json({
            success: true,
            data: {
                total_teams: teamCount || 0,
                total_games: gameCount || 0,
                total_events: eventCount,
                // Include formatted versions for display
                formatted: {
                    total_teams: formattedTeamCount,
                    total_games: formattedGameCount,
                    total_events: formattedEventCount,
                },
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in get-global-stat API:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}