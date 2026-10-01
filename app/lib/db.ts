import { Pool, types } from 'pg';

// The code expects `date` columns as plain "YYYY-MM-DD" text;
// pg's default type parser instead returns a JS Date (in server-local time,
// not UTC), silently breaking any code doing string ops (.slice, >=/<=
// comparison) on what used to be a string. Keep pg's text format instead —
// it already matches what callers expect.
types.setTypeParser(types.builtins.DATE, (val) => val);

// Reused across Next.js dev-server hot-reloads (this module re-evaluates on
// every edit under `next dev`); without stashing it on globalThis, each edit
// leaks a new Pool until Aurora's max_connections is exhausted. No-op in
// production (one long-lived process, one pool).
const g = globalThis as unknown as { pgPool?: Pool };

function getPool(): Pool {
    if (!g.pgPool) {
        // Without this, pg falls back to localhost and fails with the opaque
        // "SASL: client password must be a string".
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not set — copy .env.example to .env.local and fill it in, then restart `npm run dev`.');
        }
        g.pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 10,
        });
    }
    return g.pgPool;
}

export function query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
) {
    return getPool().query<T>(text, params as unknown[]);
}

// Only for call sites that need more than one statement to commit atomically.
// Reaching for pool.connect()/release() ad hoc in a route is an easy way to
// leak a client on an early return, so this wraps that lifecycle once.
export async function withTransaction<T>(
    fn: (q: typeof query) => Promise<T>,
): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn((text, params) => client.query(text, params as unknown[]));
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}
