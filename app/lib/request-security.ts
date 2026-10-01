import { NextRequest } from 'next/server';
import { isIP } from 'net';
import { lookup } from 'dns/promises';
import { query } from '@/app/lib/db';

type RateLimitOptions = {
    limit: number;
    windowMs: number;
    key: string;
    failClosed?: boolean;
};

type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};

// If the deployment sits behind Cloudflare, it
// overwrites CF-Connecting-IP at its edge — a client can't spoof it as long
// as Cloudflare is the sole ingress. x-forwarded-for/x-real-ip are kept only
// as a documented fallback: they're attacker-controlled if this deployment
// is ever reachable directly, so don't treat them as a trust boundary.
export function getClientIp(request: NextRequest): string {
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();

    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();

    return 'unknown';
}

// Backed by the `rate_limits` table + `rate_limit_hit` RPC (see
// supabase/migrations/rate-limits-table.sql) instead of an in-memory Map, so
// counters survive restarts and are shared across all instances (IDF-02).
// The increment and window-rollover happen atomically inside the RPC's
// single UPSERT statement, so concurrent requests for the same key can't
// race a read-then-write in application code.
export async function checkRateLimit({ limit, windowMs, key, failClosed = false }: RateLimitOptions): Promise<RateLimitResult> {
    try {
        const { rows } = await query<{ count: number; reset_at: string }>(
            'SELECT * FROM rate_limit_hit($1, $2)',
            [key, windowMs],
        );
        const row = rows[0];
        const resetAt = new Date(row.reset_at).getTime();
        return {
            allowed: row.count <= limit,
            remaining: Math.max(0, limit - row.count),
            resetAt,
        };
    } catch (error) {
        if (failClosed) throw new Error('Rate limiter unavailable');
        // Fail open on infra errors: these routes' own DB writes would fail
        // anyway if the database is down, and a rate limiter outage shouldn't
        // be the thing that takes down public forms/login on its own.
        console.error('checkRateLimit query failed, failing open:', error);
        return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs };
    }
}

// Seconds until `resetAt`, for a `Retry-After` header on 429 responses.
export function retryAfterSeconds(resetAt: number): number {
    return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

export function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isLikelyUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function normalizeText(value: FormDataEntryValue | string | null | undefined): string {
    if (typeof value !== 'string') return '';
    return value.trim();
}

// Blocks loopback, link-local (incl. the 169.254.169.254 cloud metadata
// address), and RFC1918 private ranges — for SSRF guards on server-side
// fetches of user-supplied URLs. Resolves the hostname so a public domain
// that DNS-rebinds to an internal IP is also rejected, not just literal IPs.
function isPrivateOrReservedIp(ip: string): boolean {
    const version = isIP(ip);
    if (version === 4) {
        const [a, b] = ip.split('.').map(Number);
        if (a === 127) return true; // loopback
        if (a === 10) return true; // RFC1918
        if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
        if (a === 192 && b === 168) return true; // RFC1918
        if (a === 169 && b === 254) return true; // link-local + cloud metadata
        if (a === 0) return true;
        return false;
    }
    if (version === 6) {
        const lower = ip.toLowerCase();
        if (lower === '::1') return true; // loopback
        if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
        if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
        if (lower.startsWith('::ffff:')) return isPrivateOrReservedIp(lower.slice(7)); // IPv4-mapped
        return false;
    }
    return true; // not a valid IP at all — treat as unresolvable/unsafe
}

// Fetches `url` and returns its body as text, capped at `maxBytes` read from
// the stream (not read-then-truncate, so a malicious/oversized response
// can't force full in-memory buffering) — or '' if the URL isn't publicly
// routable (see isPrivateOrReservedIp) or the fetch fails for any reason.
// Redirects are never followed (`redirect: 'manual'`) since a redirect
// target isn't re-checked against the same SSRF guard.
export async function fetchTextSafely(url: string, maxBytes: number, timeoutMs = 5000): Promise<string> {
    if (!(await isPubliclyRoutableUrl(url))) return '';

    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'manual',
        });
        if (!res.body) return '';

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let bytesRead = 0;
        while (bytesRead < maxBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesRead += value.byteLength;
            text += decoder.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
        return text;
    } catch {
        return '';
    }
}

export async function isPubliclyRoutableUrl(value: string): Promise<boolean> {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const hostname = url.hostname;
    if (hostname === 'localhost') return false;

    if (isIP(hostname)) return !isPrivateOrReservedIp(hostname);

    try {
        const { address } = await lookup(hostname);
        return !isPrivateOrReservedIp(address);
    } catch {
        return false;
    }
}
