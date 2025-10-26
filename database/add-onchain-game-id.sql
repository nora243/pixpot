-- Add onchain_game_id column to images table (MySQL)
-- This links the database record to the blockchain game

ALTER TABLE images 
ADD COLUMN onchain_game_id BIGINT UNSIGNED NULL UNIQUE COMMENT 'Game ID on blockchain contract';

-- Add index for faster lookups
CREATE INDEX idx_onchain_game_id ON images(onchain_game_id);
