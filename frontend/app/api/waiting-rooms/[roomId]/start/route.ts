// app/api/waiting-rooms/[roomId]/start/route.ts
// Update room with game request ID and change status to 'starting'

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        const { game_request_id } = await request.json();

        if (!game_request_id) {
            return NextResponse.json(
                { success: false, error: 'Missing game_request_id' },
                { status: 400 }
            );
        }

        // Update room status to 'starting' and add game request ID
        const { data: updatedRoom, error } = await supabase
            .from('waiting_rooms')
            .update({ 
                game_request_id,
                status: 'starting'
            })
            .eq('id', roomId)
            .select()
            .single();

        if (error) {
            console.error('Error updating room:', error);
            return NextResponse.json(
                { success: false, error: 'Failed to update room' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            room: updatedRoom
        });

    } catch (error) {
        console.error('Error in room start:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}