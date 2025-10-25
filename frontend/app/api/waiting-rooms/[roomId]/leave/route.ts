// app/api/waiting-rooms/[roomId]/leave/route.ts
// Leave a waiting room

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

        // Get room
        const { data: room, error: roomError } = await supabase
            .from('waiting_rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (roomError || !room) {
            return NextResponse.json(
                { success: false, error: 'Room not found' },
                { status: 404 }
            );
        }

        // Check if user is host or guest
        if (room.host_team_id === team_id) {
            // Host is leaving, cancel the room
            const { error: cancelError } = await supabase
                .from('waiting_rooms')
                .update({ status: 'cancelled' })
                .eq('id', roomId);

            if (cancelError) {
                return NextResponse.json(
                    { success: false, error: 'Failed to cancel room' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Room cancelled'
            });
        } else if (room.guest_team_id === team_id) {
            // Guest is leaving, remove them and reopen room
            const { error: leaveError } = await supabase
                .from('waiting_rooms')
                .update({ 
                    guest_team_id: null,
                    status: 'open'
                })
                .eq('id', roomId);

            if (leaveError) {
                return NextResponse.json(
                    { success: false, error: 'Failed to leave room' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'Left room successfully'
            });
        } else {
            return NextResponse.json(
                { success: false, error: 'You are not in this room' },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error('Error leaving waiting room:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}