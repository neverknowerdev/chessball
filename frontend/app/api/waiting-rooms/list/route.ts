import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type WaitingRoom = {
    id: string;
    host_team_id: string;
    guest_team_id: string | null;
    created_at: string;
    status: string;
    expires_at: string;
    host_team: {
        id: string;
        name: string;
        elo_rating: number;
        country: string;
    };
    // Add other fields from your waiting_rooms table
};

// Create client outside the handler to reuse connections
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        global: {
            fetch: (...args) => {
                return fetch(...args).catch(err => {
                    console.error('Fetch error:', err);
                    throw err;
                });
            }
        }
    }
);

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 8000)
        );

        const queryPromise = supabase
            .from('waiting_rooms')
            .select(`
                *,
                host_team:teams!host_team_id (
                    id,
                    name,
                    elo_rating,
                    country
                )
            `)
            .eq('status', 'open')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: rooms, error } = await Promise.race([
            queryPromise,
            timeoutPromise
        ]).catch(err => {
            console.error('Query failed:', err);
            return { data: null, error: err };
        }) as any;

        if (error) {
            console.error('Error fetching waiting rooms:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            return NextResponse.json(
                { success: false, error: 'Failed to fetch waiting rooms' },
                { status: 500 }
            );
        }

        const sortedRooms = rooms.sort((a: WaitingRoom, b: WaitingRoom) => {
            if (!a.guest_team_id && b.guest_team_id) return -1;
            if (a.guest_team_id && !b.guest_team_id) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return NextResponse.json({
            success: true,
            rooms: sortedRooms,
            total: rooms.length
        });

    } catch (error) {
        console.error('Error in list waiting rooms:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}