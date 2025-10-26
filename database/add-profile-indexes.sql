-- Add indexes to optimize profile queries
-- Run this migration to improve profile page performance

-- Index for revealed_pixels queries by wallet address
CREATE INDEX idx_revealed_by_time ON revealed_pixels(revealed_by, revealed_at DESC);

-- Index for guesses queries by wallet address  
CREATE INDEX idx_wallet_guess_time ON guesses(wallet_address, created_at DESC);

-- Index for winner queries
CREATE INDEX idx_winner_status ON images(winner_address, status);

-- Composite index for image participation lookup
CREATE INDEX idx_image_pixel_reveal ON revealed_pixels(image_id, revealed_by);
CREATE INDEX idx_image_guess_wallet ON guesses(image_id, wallet_address);

-- Show current indexes
SHOW INDEXES FROM revealed_pixels;
SHOW INDEXES FROM guesses;
SHOW INDEXES FROM images;
