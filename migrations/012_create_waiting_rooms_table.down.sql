-- Migration: 012_create_waiting_rooms_table.down.sql

BEGIN;

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_waiting_rooms_updated_at ON public.waiting_rooms;

-- Drop the trigger function
DROP FUNCTION IF EXISTS update_waiting_rooms_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_waiting_rooms_lobby;
DROP INDEX IF EXISTS idx_waiting_rooms_expires_at;
DROP INDEX IF EXISTS idx_waiting_rooms_created_at;
DROP INDEX IF EXISTS idx_waiting_rooms_host_team;
DROP INDEX IF EXISTS idx_waiting_rooms_status;

-- Revoke permissions
REVOKE ALL ON SEQUENCE public.waiting_rooms_id_seq FROM PUBLIC;
REVOKE ALL ON public.waiting_rooms FROM PUBLIC;

-- Drop the table
DROP TABLE IF EXISTS public.waiting_rooms;

COMMIT;