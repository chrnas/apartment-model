// Shared Neon database client for the serverless API functions.
// The connection string is kept server-side in the DATABASE_URL env var
// (set in the Vercel project settings), never exposed to the browser.

import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Surfaced in function logs if the env var is missing.
  console.error('DATABASE_URL is not set.');
}

export const sql = neon(connectionString);

// Basic UUID v4 format check for the client-provided author token.
export function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
