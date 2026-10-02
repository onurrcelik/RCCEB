import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Server-to-server calls from the rcceb.org site (new applications, RC clerk decisions)
// carry `Authorization: Bearer <APPLICATIONS_INTAKE_SECRET>`. The secret never reaches a
// browser, and these routes sit outside /api/admin and /api/members, so proxy.ts doesn't
// gate them: this check is the only thing in front of them.
export function isIntakeAuthorized(request: NextRequest) {
    const secret = process.env.APPLICATIONS_INTAKE_SECRET;
    if (!secret) return false;
    const header = request.headers.get('authorization');
    const given = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!given) return false;
    const expected = Buffer.from(secret);
    const actual = Buffer.from(given);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}
