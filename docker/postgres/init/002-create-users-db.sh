#!/bin/bash
set -euo pipefail

# Create users database used by users-service Prisma.
# This file runs via the official Postgres image init hook.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
SELECT 'CREATE DATABASE outbib_users'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'outbib_users');
SQL
