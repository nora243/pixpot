-- Add admin_secret column to guesses table (MySQL)
-- This stores the admin secret for correct guesses to enable claiming prize later

ALTER TABLE guesses 
ADD COLUMN admin_secret VARCHAR(255) NULL COMMENT 'Admin secret for claiming prize (only for correct guesses)';
