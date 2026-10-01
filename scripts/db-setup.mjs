// Creates every table in the database DATABASE_URL points at (Aurora).
// Usage: npm run db:setup   (reads .env.local; safe to run more than once)
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.loadEnvFile?.('.env.local');
const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is not set in .env.local');
    process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 60_000 });
console.log('Connecting (a paused Aurora Serverless cluster can take ~15s to wake)…');
await client.connect();
await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
const { rows } = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
console.log(`Done — ${rows[0].n} tables in the database.`);
await client.end();
