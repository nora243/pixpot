-- Migration script: Convert from old schema to new Hybrid schema
-- Run this if you already have the old schema with individual pixel rows

-- Step 0: Modify answer column to TEXT to support multiple answers
ALTER TABLE images MODIFY COLUMN answer TEXT NOT NULL COMMENT 'Correct answers separated by |';

-- Step 0.05: Add suspended status and change default to archived
ALTER TABLE images MODIFY COLUMN status ENUM('active', 'completed', 'archived', 'suspended') DEFAULT 'archived' COMMENT 'suspended = cannot auto-activate, only manual';

-- Step 0.1: Add hint columns (safe method - check if exists first)
SET @dbname = DATABASE();
SET @tablename = 'images';

-- Add hint_0
SET @columnname = 'hint_0';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE (TABLE_SCHEMA = @dbname) AND (TABLE_NAME = @tablename) AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  'ALTER TABLE images ADD COLUMN hint_0 VARCHAR(500) NULL COMMENT "Hint at 0 pixels revealed" AFTER answer'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add hint_1000
SET @columnname = 'hint_1000';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE (TABLE_SCHEMA = @dbname) AND (TABLE_NAME = @tablename) AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  'ALTER TABLE images ADD COLUMN hint_1000 VARCHAR(500) NULL COMMENT "Hint at 1000 pixels revealed" AFTER hint_0'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add hint_2000
SET @columnname = 'hint_2000';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE (TABLE_SCHEMA = @dbname) AND (TABLE_NAME = @tablename) AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1',
  'ALTER TABLE images ADD COLUMN hint_2000 VARCHAR(500) NULL COMMENT "Hint at 2000 pixels revealed" AFTER hint_1000'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Step 1: Add pixel_data column to images table (safe method)
-- Check if column exists first, add only if missing
SET @dbname = DATABASE();
SET @tablename = 'images';
SET @columnname = 'pixel_data';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  'SELECT 1', -- Column exists, do nothing
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' MEDIUMBLOB AFTER height')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Step 2: Create new revealed_pixels table
CREATE TABLE IF NOT EXISTS revealed_pixels (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  image_id INT NOT NULL,
  pixel_index INT NOT NULL COMMENT 'Index in 0 to (width*height-1)',
  revealed_by VARCHAR(42) NULL COMMENT 'Wallet address who revealed',
  revealed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  UNIQUE KEY unique_pixel (image_id, pixel_index),
  INDEX idx_image (image_id),
  INDEX idx_revealed_by (revealed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Migrate revealed pixels data (if you have data in old pixels table)
-- INSERT INTO revealed_pixels (image_id, pixel_index, revealed_by, revealed_at)
-- SELECT image_id, pixel_index, revealed_by, revealed_at 
-- FROM pixels 
-- WHERE is_revealed = TRUE;

-- Step 4: Drop old pixels table (WARNING: This deletes all pixel data!)
-- DROP TABLE IF EXISTS pixels;

-- Step 5: Add performance indexes for profile queries
CREATE INDEX idx_revealed_by_time ON revealed_pixels(revealed_by, revealed_at DESC);
CREATE INDEX idx_wallet_guess_time ON guesses(wallet_address, created_at DESC);
CREATE INDEX idx_winner_status ON images(winner_address, status);
CREATE INDEX idx_image_pixel_reveal ON revealed_pixels(image_id, revealed_by);
CREATE INDEX idx_image_guess_wallet ON guesses(image_id, wallet_address);

-- Note: You'll need to re-upload images to generate pixel_data blobs
-- Or write a script to pack existing pixel colors into blob format
