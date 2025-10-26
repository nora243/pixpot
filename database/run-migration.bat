@echo off
REM Run MySQL migration for admin_secret column
REM Update these variables with your MySQL credentials

set MYSQL_USER=root
set MYSQL_PASS=
set MYSQL_DB=pixpot
set MYSQL_HOST=localhost

echo Running migration: add-admin-secret.sql
mysql -u %MYSQL_USER% -p%MYSQL_PASS% -h %MYSQL_HOST% %MYSQL_DB% < add-admin-secret.sql

if %ERRORLEVEL% EQU 0 (
    echo Migration completed successfully!
) else (
    echo Migration failed!
)

pause
