// app/api/waiting-rooms/[roomId]/join/route.ts
// Join a waiting room

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAuthSignatureAndMessage } from '@/lib/auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        // Await params in Next.js 15
        const { roomId } = await params;
        const { team_id, wallet_address, signature, message } = await request.json();

        // Validate signature
        const { isValid, error: authError } = await checkAuthSignatureAndMessage(
            signature, 
            message, 
            wallet_address
        );
        
        if (!isValid) {
            return NextResponse.json(
                { success: false, error: authError },
                { status: 401 }
            );
        }

        // Check if room exists and is open
        const { data: room, error: roomError } = await supabase
            .from('waiting_rooms')
            .select('*, host_team:teams!host_team_id(id, elo_rating)')
            .eq('id', roomId)
            .eq('status', 'open')
            .single();

        if (roomError || !room) {
            return NextResponse.json(
                { success: false, error: 'Room not found or not open' },
                { status: 404 }
            );
        }

        // Check if room has expired
        if (new Date(room.expires_at) < new Date()) {
            await supabase
                .from('waiting_rooms')
                .update({ status: 'expired' })
                .eq('id', roomId);
                
            return NextResponse.json(
                { success: false, error: 'Room has expired' },
                { status: 400 }
            );
        }

        // Verify team
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, elo_rating, active_game_id')
            .eq('id', team_id)
            .eq('primary_wallet', wallet_address)
            .single();

        if (teamError || !team) {
            return NextResponse.json(
                { success: false, error: 'Team not found' },
                { status: 404 }
            );
        }

        if (team.active_game_id) {
            return NextResponse.json(
                { success: false, error: 'Team already has an active game' },
                { status: 400 }
            );
        }

        // Check if team is the host
        if (team_id === room.host_team_id) {
            return NextResponse.json(
                { success: false, error: 'Cannot join your own room' },
                { status: 400 }
            );
        }

        // Check ELO rating requirement
        if (team.elo_rating < room.minimum_elo_rating) {
            return NextResponse.json(
                { success: false, error: 'Your ELO rating is below the minimum requirement' },
                { status: 400 }
            );
        }

        // Update room with guest team
        const { data: updatedRoom, error: updateError } = await supabase
            .from('waiting_rooms')
            .update({ 
                guest_team_id: team_id,
                status: 'full'
            })
            .eq('id', roomId)
            .eq('status', 'open') // Ensure room is still open
            .select()
            .single();

        if (updateError) {
            return NextResponse.json(
                { success: false, error: 'Failed to join room (may be full)' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room: updatedRoom
        });

    } catch (error) {
        console.error('Error joining waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}