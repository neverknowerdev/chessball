BEGIN;
-- Drop the unique constraint
ALTER TABLE teams 
DROP CONSTRAINT IF EXISTS unique_zealy_user_id;

-- Drop the index
DROP INDEX IF EXISTS idx_teams_zealy_user_id;

-- Drop the column
ALTER TABLE teams 
DROP COLUMN IF EXISTS zealy_user_id;

COMMIT;
