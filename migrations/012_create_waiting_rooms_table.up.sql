-- Migration: 012_create_waiting_rooms_table.up.sql

-- Create waiting_rooms table
CREATE TABLE IF NOT EXISTS public.waiting_rooms (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Host team information
    host_team_id BIGINT NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    
    -- Room settings
    minimum_elo_rating NUMERIC DEFAULT 0,
    
    -- Room status
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'full', 'starting', 'cancelled', 'expired')),
    
    -- Guest team (when someone joins)
    guest_team_id BIGINT REFERENCES public.teams(id) ON DELETE SET NULL,
    
    -- Game request created when both teams are ready
    game_request_id BIGINT,
    
    -- Expiration (rooms expire after 24 hours)
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create indexes
CREATE INDEX idx_waiting_rooms_status ON public.waiting_rooms(status);
CREATE INDEX idx_waiting_rooms_host_team ON public.waiting_rooms(host_team_id);
CREATE INDEX idx_waiting_rooms_created_at ON public.waiting_rooms(created_at DESC);
CREATE INDEX idx_waiting_rooms_expires_at ON public.waiting_rooms(expires_at);

-- Create composite index for efficient lobby queries
CREATE INDEX idx_waiting_rooms_lobby ON public.waiting_rooms(status, created_at DESC) 
WHERE status = 'open';

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_waiting_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_waiting_rooms_updated_at
    BEFORE UPDATE ON public.waiting_rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_waiting_rooms_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_rooms TO PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE public.waiting_rooms_id_seq TO PUBLIC;

-- Add comments
COMMENT ON TABLE public.waiting_rooms IS 'Waiting rooms for matchmaking lobby system';
COMMENT ON COLUMN public.waiting_rooms.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN public.waiting_rooms.host_team_id IS 'Team that created the room';
COMMENT ON COLUMN public.waiting_rooms.minimum_elo_rating IS 'Minimum ELO rating filter for opponents';
COMMENT ON COLUMN public.waiting_rooms.status IS 'Room status: open, full, starting, cancelled, expired';
COMMENT ON COLUMN public.waiting_rooms.guest_team_id IS 'Team that joined the room';
COMMENT ON COLUMN public.waiting_rooms.game_request_id IS 'Game request ID when both teams confirm';
COMMENT ON COLUMN public.waiting_rooms.expires_at IS 'Room expiration time (24 hours from creation)';