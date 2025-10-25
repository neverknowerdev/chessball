// app/api/waiting-rooms/create/route.ts
// Create a new waiting room

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAuthSignatureAndMessage } from '@/lib/auth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    try {
        const { 
            team_id, 
            minimum_elo_rating, 
            wallet_address, 
            signature, 
            message 
        } = await request.json();

        // Validate required fields
        if (!team_id || !wallet_address || !signature || !message) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

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

        // Check if team exists and has no active game
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('id, active_game_id, game_request_id')
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

        // Check if team already has an open waiting room (non-expired)
        const now = new Date().toISOString();
        const { data: existingRoom } = await supabase
            .from('waiting_rooms')
            .select('id, expires_at')
            .eq('host_team_id', team_id)
            .eq('status', 'open')
            .gt('expires_at', now) // Only check for non-expired rooms
            .single();

        if (existingRoom) {
            return NextResponse.json(
                { success: false, error: 'Team already has an open waiting room' },
                { status: 400 }
            );
        }

        // Auto-expire any old open rooms for this team
        await supabase
            .from('waiting_rooms')
            .update({ status: 'expired' })
            .eq('host_team_id', team_id)
            .eq('status', 'open')
            .lte('expires_at', now);

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Create waiting room
        const { data: room, error: createError } = await supabase
            .from('waiting_rooms')
            .insert({
                host_team_id: team_id,
                minimum_elo_rating: minimum_elo_rating || 0,
                status: 'open',
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creating waiting room:', createError);
            return NextResponse.json(
                { success: false, error: 'Failed to create waiting room' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room
        });

    } catch (error) {
        console.error('Error in create waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}