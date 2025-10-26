# PixPot MySQL Setup

## Prerequisites
- MySQL 8.0+ installed and running
- MySQL command line or GUI tool (e.g., MySQL Workbench, phpMyAdmin)

## Setup Steps

### 1. Create Database
```sql
CREATE DATABASE IF NOT EXISTS pixpot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Import Schema
From the project root, run:
```powershell
# PowerShell
Get-Content database/schema.sql | mysql -u root -p pixpot
```

Or import manually using MySQL Workbench or command line:
```bash
mysql -u root -p pixpot < database/schema.sql
```

### 3. Configure Environment
Copy `.env.example` to `.env.local` and update MySQL credentials:
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pixpot
```

### 4. Verify Tables
```sql
USE pixpot;
SHOW TABLES;
-- Should show: images, revealed_pixels, guesses
```

## Storage Strategy (Hybrid Approach)
- Images are automatically resized to **128×128 pixels** (16,384 pixels total)
- **Full pixel data** stored as BLOB in `images` table (~49KB per image)
- **Only revealed pixels** tracked in `revealed_pixels` table (minimal storage)
- This hybrid approach provides:
  - ✅ Fast upload (1 INSERT vs 16K INSERTs)
  - ✅ Efficient queries
  - ✅ Track who revealed which pixel
  - ✅ Easy to scale

## Default Admin Address
Only this wallet address can access `/admin`:
- `0xEDf20419eFECd79440C05CC645562D509a164263`

Change it in `.env.local` if needed:
```
NEXT_PUBLIC_ADMIN_ADDRESS=0xYourAdminAddress
```

## Testing Connection
The app will automatically connect on first API request.
Check for connection errors in the Next.js terminal.
