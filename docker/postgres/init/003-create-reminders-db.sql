-- Create reminders database used by reminders-service Prisma
-- Note: CREATE DATABASE cannot run inside a DO block.
-- This pattern uses psql to conditionally execute CREATE DATABASE.
SELECT 'CREATE DATABASE outbib_reminders'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'outbib_reminders')\gexec
