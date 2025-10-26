-- Add admin_secret column to images table (MySQL)
-- This stores the secret used to create answerCommitHash
-- Admin will need this secret when players claim win

ALTER TABLE images ADD COLUMN admin_secret VARCHAR(255) NULL;

-- Note: For existing games, you'll need to update this manually
-- or regenerate the games with new admin secrets
