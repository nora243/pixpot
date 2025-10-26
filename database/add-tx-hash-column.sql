-- Add tx_hash column to revealed_pixels table
-- This stores the blockchain transaction hash for pixel reveals

ALTER TABLE revealed_pixels 
ADD COLUMN tx_hash VARCHAR(66) NULL COMMENT 'Blockchain transaction hash' AFTER revealed_by;

-- Add index for faster tx_hash lookups
ALTER TABLE revealed_pixels 
ADD INDEX idx_tx_hash (tx_hash);
