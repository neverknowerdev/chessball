// app/api/waiting-rooms/[roomId]/route.ts
// Get details of a specific waiting room

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        // Await params in Next.js 15
        const { roomId } = await params;

        // Fetch room with team details
        const { data: room, error } = await supabase
            .from('waiting_rooms')
            .select(`
                *,
                host_team:teams!host_team_id (
                    id,
                    name,
                    elo_rating,
                    country,
                    primary_wallet
                ),
                guest_team:teams!guest_team_id (
                    id,
                    name,
                    elo_rating,
                    country,
                    primary_wallet
                )
            `)
            .eq('id', roomId)
            .single();

        if (error || !room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            room
        });

    } catch (error) {
        console.error('Error fetching waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}