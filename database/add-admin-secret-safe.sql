-- Safe migration: Add admin_secret column if not exists (MySQL)
-- This stores the secret used to create answerCommitHash

-- Check if column exists, if not add it
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'images' 
    AND COLUMN_NAME = 'admin_secret'
);

SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE images ADD COLUMN admin_secret VARCHAR(255) NULL',
    'SELECT "Column admin_secret already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify the column was added
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'images' 
AND COLUMN_NAME = 'admin_secret';
