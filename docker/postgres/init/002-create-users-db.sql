-- Create users database used by users-service Prisma
-- Note: CREATE DATABASE cannot run inside a DO block.
-- This pattern uses psql to conditionally execute CREATE DATABASE.
SELECT 'CREATE DATABASE outbib_users'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'outbib_users')\gexec
