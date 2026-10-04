// Shared Neon database client for the serverless API functions.
// The connection string is kept server-side in the DATABASE_URL env var
// (set in the Vercel project settings), never exposed to the browser.

import { neon } from '@neondatabase/serverless';

// Accept the common connection-string env var names. The Neon/Vercel
// integration sometimes creates prefixed/suffixed names (e.g.
// DATABASE_URL_DATABASE_URL, POSTGRES_URL), so fall back across them.
function resolveConnectionString() {
  const env = process.env;
  const candidates = [
    env.DATABASE_URL,
    env.DATABASE_URL_DATABASE_URL,
    env.POSTGRES_URL,
    env.POSTGRES_PRISMA_URL,
    env.DATABASE_URL_UNPOOLED,
    env.POSTGRES_URL_NON_POOLING,
  ];
  // Also catch any *DATABASE_URL* / *POSTGRES_URL* variant the integration added.
  for (const [key, value] of Object.entries(env)) {
    if (value && /(DATABASE_URL|POSTGRES_URL)/.test(key)) {
      candidates.push(value);
    }
  }
  return candidates.find((v) => typeof v === 'string' && v.length > 0);
}

// Create the client lazily so a missing/invalid URL produces a clear error
// at request time instead of crashing module load with a cryptic message.
export function getSql() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error('No Postgres connection string found (checked DATABASE_URL and common variants).');
  }
  return neon(connectionString);
}

// Basic UUID v4 format check for the client-provided author token.
export function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
