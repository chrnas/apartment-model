// Shared Neon database client for the serverless API functions.
// The connection string is kept server-side in the DATABASE_URL env var
// (set in the Vercel project settings), never exposed to the browser.

import { neon } from '@neondatabase/serverless';

// Accept the common connection-string env var names. The Neon/Vercel
// integration sometimes creates prefixed/suffixed names (e.g.
// DATABASE_URL_DATABASE_URL, POSTGRES_URL), so fall back across them.
function isPostgresUrl(value) {
  return (
    typeof value === 'string' &&
    /^postgres(ql)?:\/\//.test(value)
  );
}

function resolveConnectionString() {
  const env = process.env;

  // Candidate connection strings, pooled variants first. The neon() HTTP
  // driver needs the POOLED endpoint (host contains "-pooler").
  const candidates = [
    env.DATABASE_URL,
    env.DATABASE_URL_DATABASE_URL,
    env.DATABASE_URL_POSTGRES_URL,
    env.POSTGRES_URL,
    env.DATABASE_URL_POSTGRES_PRISMA_URL,
    env.POSTGRES_PRISMA_URL,
    env.DATABASE_URL_UNPOOLED,
    env.DATABASE_URL_POSTGRES_URL_NON_POOLING,
    env.POSTGRES_URL_NON_POOLING,
  ].filter(isPostgresUrl);

  // Also include any other env value that is a Postgres URL.
  for (const value of Object.values(env)) {
    if (isPostgresUrl(value) && !candidates.includes(value)) {
      candidates.push(value);
    }
  }

  // Strongly prefer a pooled connection string for the serverless driver.
  const pooled = candidates.find((v) => v.includes('-pooler'));
  return pooled ?? candidates[0];
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
