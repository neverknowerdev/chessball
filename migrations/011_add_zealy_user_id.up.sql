BEGIN;
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS zealy_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_teams_zealy_user_id 
ON teams(zealy_user_id) 
WHERE zealy_user_id IS NOT NULL;

ALTER TABLE teams 
ADD CONSTRAINT unique_zealy_user_id UNIQUE (zealy_user_id);

COMMIT;