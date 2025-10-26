-- PixPot Database Schema
-- Create database (run manually first time)
-- CREATE DATABASE IF NOT EXISTS pixpot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE pixpot;

-- Images table: stores uploaded images and metadata
CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  answer TEXT NOT NULL COMMENT 'Correct answers separated by | (e.g., "cat|kitten|feline")',
  hint_0 VARCHAR(500) NULL COMMENT 'Hint at 0 pixels revealed',
  hint_1000 VARCHAR(500) NULL COMMENT 'Hint at 1000 pixels revealed',
  hint_2000 VARCHAR(500) NULL COMMENT 'Hint at 2000 pixels revealed',
  pixel_data MEDIUMBLOB NOT NULL COMMENT 'RGB pixel data (3 bytes per pixel)',
  status ENUM('active', 'completed', 'archived', 'suspended') DEFAULT 'archived' COMMENT 'suspended = cannot auto-activate, only manual',
  total_pixels INT NOT NULL,
  revealed_pixels INT DEFAULT 0,
  pool_amount DECIMAL(18, 8) DEFAULT 0 COMMENT 'Prize pool in ETH',
  winner_address VARCHAR(42) NULL COMMENT 'Address of winner',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Revealed pixels table: only stores pixels that have been revealed
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

-- Guesses table: tracks all guess attempts
CREATE TABLE IF NOT EXISTS guesses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  image_id INT NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  guess_text VARCHAR(255) NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  tx_hash VARCHAR(66) NULL COMMENT 'Transaction hash',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
  INDEX idx_image_wallet (image_id, wallet_address),
  INDEX idx_correct (image_id, is_correct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
