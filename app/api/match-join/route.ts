import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { MATCH_POOL_SELECT, isMatchEligible, type MatchPoolSource } from '@/app/lib/categories';
import { verifyMatchJoin } from '@/app/lib/match-join';

export const dynamic = 'force-dynamic';

// Landing page for the "Count me in" button in the monthly 1-on-1 invitation. Like
// /api/match-confirm it sits outside /members and /api/members, so proxy.ts doesn't ask for
// a session: the signed token in the link stands in for auth.
//
// "Count me in every month" is the same link with &a=always: it joins this month and sets
// members.match_auto_opt_in, so later rounds put them in without asking.
//
// GET never writes. Mail scanners fetch links before the member does, so the page posts
// the answer back with a script (which scanners don't run), with a button as fallback.

function page(title: string, body: string, status = 200) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · RCCEB</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         background:#f4f1ea; color:#0e1b2d; padding:24px; }
  .card { max-width:440px; width:100%; background:#fff; border:1px solid #dbd7cf; border-radius:16px;
          padding:32px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.04); }
  h1 { font-family:'Playfair Display',Georgia,serif; font-size:22px; margin:0 0 12px; font-weight:600; letter-spacing:-0.01em; }
  p { font-size:14px; line-height:1.6; color:#52525b; margin:0 0 20px; }
  button { font:inherit; font-weight:600; font-size:14px; cursor:pointer; border-radius:10px;
           padding:11px 22px; border:1px solid #0e1b2d; background:#0e1b2d; color:#fff; }
  .quiet { font-size:12px; color:#a1a1aa; margin:20px 0 0; }
  .quiet a, .quiet button { color:#a1a1aa; font-size:12px; }
  .quiet button { border:none; background:none; padding:0; text-decoration:underline; font-weight:400; }
  .brand { margin:24px 0 0; font-size:12px; color:#a1a1aa; }
  form { margin:0; }
  @media (prefers-color-scheme: dark) {
    body { background:#0a1628; color:#fafafa; }
    .card { background:#0e1b2d; border-color:#1d283f; }
    p { color:#a1a1aa; }
    button { background:#f4f1ea; color:#0e1b2d; border-color:#fafafa; }
  }
</style></head><body><div class="card">${body}<p class="brand">Robert College Community Entrepreneurs Bond</p></div></body></html>`;
    return new NextResponse(html, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

const PORTAL_LINK = '<p><a href="/members/dashboard?section=match">Open the portal →</a></p>';

const INVALID = () => page('Link expired', `<h1>This link isn't valid any more</h1>
<p>It may have been cut off by your email client, or the round it belongs to has been removed. You can still join from the portal.</p>
${PORTAL_LINK}`, 400);

const CLOSED = () => page('Round closed', `<h1>This month's round has closed</h1>
<p>Matches for this month have already gone out. Watch for next month's invitation.</p>
${PORTAL_LINK}`, 400);

type Params = { roundId: string; memberId: string; queryString: string };

function readParams(request: NextRequest): Params | null {
    const search = request.nextUrl.searchParams;
    const roundId = search.get('r');
    const memberId = search.get('m');
    const token = search.get('t');
    if (!roundId || !memberId || !token || !verifyMatchJoin(roundId, memberId, token)) return null;
    return { roundId, memberId, queryString: search.toString() };
}

// A valid signature isn't enough on its own: the round must still be the current one and
// taking answers, and the member must still be in the pool (onboarded, not a past member).
// Mirrors the portal's rule in /api/members/match: while the round is open members can join
// or leave; once it has been matched, only a late join is allowed, for the admin to pair up.
async function check(params: Params, joining: boolean) {
    const { rows: rounds } = await query<{ id: string; status: string }>(
        'SELECT id, status FROM match_rounds ORDER BY created_at DESC LIMIT 1',
    );
    const round = rounds[0];
    if (!round || round.id !== params.roundId) return 'closed';
    if (round.status !== 'open' && !(round.status === 'matched' && joining)) return 'closed';

    const { rows: members } = await query<MatchPoolSource>(
        `SELECT ${MATCH_POOL_SELECT} FROM members WHERE id = $1`,
        [params.memberId],
    );
    if (!members[0] || !isMatchEligible(members[0])) return 'invalid';
    return { round };
}

async function currentAnswer(params: Params) {
    const { rows } = await query<{ opted_in: boolean | null }>(
        'SELECT opted_in FROM match_responses WHERE round_id = $1 AND member_id = $2',
        [params.roundId, params.memberId],
    );
    return rows[0]?.opted_in ?? null;
}

function leaveLink(params: Params) {
    return `<div class="quiet"><form method="post" action="/api/match-join?${params.queryString}">
<input type="hidden" name="action" value="leave"><button type="submit">Changed your mind? Sit this month out</button></form></div>`;
}

async function isAutoJoiner(params: Params) {
    const { rows } = await query<{ match_auto_opt_in: boolean }>('SELECT match_auto_opt_in FROM members WHERE id = $1', [params.memberId]);
    return rows[0]?.match_auto_opt_in === true;
}

function joinedPage(params: Params, roundStatus: string, auto: boolean) {
    const late = roundStatus === 'matched';
    const autoBlock = auto
        ? `<p>You're also set to join <strong>every month</strong>: we'll skip the invitation and just send you your match. You can turn this off in the portal's 1:1 section.</p>`
        : `<form method="post" action="/api/match-join?${params.queryString}" style="margin:0 0 4px">
<input type="hidden" name="action" value="always"><button type="submit">Count me in every month</button></form>
<p style="font-size:12px;margin:8px 0 0">Skip this email from now on and just get your match each month.</p>`;
    return page("You're in", `<h1>You're in for this month</h1>
<p>${late
        ? "Matches already went out, so you're on the late list. We'll pair you up if we can and email you your match."
        : "We'll email you your match once the round runs, including who reaches out first."}</p>
${autoBlock}
${late ? '' : leaveLink(params)}`);
}

export async function GET(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();
    const result = await check(params, true);
    if (result === 'invalid') return INVALID();
    if (result === 'closed') return CLOSED();

    const always = request.nextUrl.searchParams.get('a') === 'always';
    if ((await currentAnswer(params)) === true && (!always || (await isAutoJoiner(params)))) {
        return joinedPage(params, result.round.status, await isAutoJoiner(params));
    }

    return page('Joining', `<h1>Joining ${always ? 'every month' : "this month's 1-on-1"}…</h1>
<form id="join-form" method="post" action="/api/match-join?${params.queryString}">
<input type="hidden" name="action" value="${always ? 'always' : 'join'}"><button type="submit">Count me in</button></form>
<script>document.getElementById('join-form').submit();</script>`);
}

export async function POST(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();

    let action: string | null;
    try {
        action = new URLSearchParams(await request.text()).get('action');
    } catch {
        return INVALID();
    }
    const joining = action !== 'leave';

    const result = await check(params, joining);
    if (result === 'invalid') return INVALID();
    if (result === 'closed') return CLOSED();

    try {
        await query(
            `INSERT INTO match_responses (round_id, member_id, opted_in) VALUES ($1, $2, $3)
             ON CONFLICT (round_id, member_id) DO UPDATE SET opted_in = EXCLUDED.opted_in`,
            [params.roundId, params.memberId, joining],
        );
        if (action === 'always') {
            await query('UPDATE members SET match_auto_opt_in = true WHERE id = $1', [params.memberId]);
        }
    } catch (error) {
        console.error('match-join write failed', error);
        return page('Something went wrong', `<h1>We couldn't save that</h1>
<p>Your answer didn't go through. Try again from the portal.</p>
${PORTAL_LINK}`, 500);
    }

    if (joining) return joinedPage(params, result.round.status, await isAutoJoiner(params));
    return page('Sitting out', `<h1>No problem, you're sitting this month out</h1>
<p>You won't be matched this month. We'll invite you again next month.</p>
<div class="quiet"><form method="post" action="/api/match-join?${params.queryString}">
<input type="hidden" name="action" value="join"><button type="submit">Actually, count me in</button></form></div>`);
}
