import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/app/lib/db';
import { escapeHtml } from '@/app/lib/html-escape';
import { verifyMatchConfirm, type MetAnswer } from '@/app/lib/match-confirm';

export const dynamic = 'force-dynamic';

// Landing page for the "did you meet?" buttons in the weekly 1-on-1 emails. It sits
// outside /members and /api/members on purpose: proxy.ts gates those behind a
// session, and requiring a login is the exact friction that kept people from answering.
// The signed token in the link is what stands in for auth.

// Why a pair didn't meet. Kept deliberately short and blame-free — combined with
// opener_member_id (who was supposed to send the first message) "we never connected"
// already says whose side it broke on, so the member doesn't have to say it.
const REASONS: { value: string; label: string }[] = [
    { value: 'no_contact', label: 'We never connected' },
    { value: 'no_schedule', label: 'We messaged, never scheduled' },
    { value: 'fell_through', label: 'We scheduled, it fell through' },
    { value: 'no_time', label: 'No time this week' },
];

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
  .name { font-weight:600; color:#0e1b2d; }
  button { font:inherit; font-weight:600; font-size:14px; cursor:pointer; border-radius:10px;
           padding:11px 22px; border:1px solid #0e1b2d; background:#0e1b2d; color:#fff; }
  button:hover { background:#000; }
  button.ghost { background:transparent; color:#52525b; border-color:#d4d4d8; }
  button.ghost:hover { background:#f4f4f5; color:#0e1b2d; }
  button.block { display:block; width:100%; margin:0 0 8px; text-align:left; }
  .reasons { margin:0 0 16px; text-align:left; }
  .reasons label { display:flex; align-items:center; gap:10px; padding:10px 12px; margin:0 0 6px;
                   border:1px solid #d4d4d8; border-radius:10px; font-size:14px; color:#2f3848; cursor:pointer; }
  .reasons label:has(input:checked) { border-color:#0e1b2d; color:#0e1b2d; background:#f4f4f5; }
  .reasons input { accent-color:#0e1b2d; margin:0; }
  .stars { display:inline-flex; flex-direction:row-reverse; gap:4px; margin:0 0 16px; }
  .stars input { position:absolute; opacity:0; width:1px; height:1px; }
  .stars label { font-size:34px; line-height:1; color:#d4d4d8; cursor:pointer; padding:2px; border-radius:6px; }
  .stars input:checked ~ label, .stars label:hover, .stars label:hover ~ label { color:#f59e0b; }
  .stars input:focus-visible + label { outline:2px solid #0e1b2d; outline-offset:2px; }
  textarea { font:inherit; font-size:14px; width:100%; box-sizing:border-box; min-height:84px; resize:vertical;
             padding:10px 12px; border:1px solid #d4d4d8; border-radius:10px; margin:0 0 16px;
             background:transparent; color:inherit; }
  textarea:focus { outline:none; border-color:#0e1b2d; }
  .field-label { display:block; text-align:left; font-size:13px; font-weight:600; color:#2f3848; margin:0 0 6px; }
  .quiet { font-size:12px; color:#a1a1aa; margin:20px 0 0; }
  .quiet a, .quiet button { color:#a1a1aa; font-size:12px; }
  .quiet button { border:none; background:none; padding:0; text-decoration:underline; font-weight:400; }
  .quiet button:hover { background:none; color:#52525b; }
  .brand { margin:24px 0 0; font-size:12px; color:#a1a1aa; }
  form { margin:0; }
  @media (prefers-color-scheme: dark) {
    body { background:#0a1628; color:#fafafa; }
    .card { background:#0e1b2d; border-color:#1d283f; }
    p { color:#a1a1aa; } .name { color:#fafafa; }
    button { background:#f4f1ea; color:#0e1b2d; border-color:#fafafa; }
    button.ghost { background:transparent; color:#a1a1aa; border-color:#2f3848; }
    button.ghost:hover { background:#1d283f; color:#fafafa; }
    .reasons label { border-color:#2f3848; color:#d4d4d8; }
    .reasons label:has(input:checked) { border-color:#fafafa; color:#fafafa; background:#1d283f; }
    .reasons input { accent-color:#fafafa; }
    .stars label { color:#2f3848; }
    .stars input:focus-visible + label { outline-color:#fafafa; }
    textarea { border-color:#2f3848; } textarea:focus { border-color:#fafafa; }
    .field-label { color:#d4d4d8; }
  }
</style></head><body><div class="card">${body}<p class="brand">Robert College Community Entrepreneurs Bond</p></div></body></html>`;
    return new NextResponse(html, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

const INVALID = () => page('Link expired', `<h1>This link isn't valid any more</h1>
<p>It may have been truncated by your email client, or the round it belongs to has been removed. You can always answer from the portal instead.</p>
<p><a href="/members/dashboard?section=match">Open the portal →</a></p>`, 400);

type Params = { roundId: string; memberId: string; answer: MetAnswer; queryString: string };

function readParams(request: NextRequest): Params | null {
    const search = request.nextUrl.searchParams;
    const roundId = search.get('r');
    const memberId = search.get('m');
    const answer = search.get('a');
    const token = search.get('t');
    if (!roundId || !memberId || !token) return null;
    if (answer !== 'yes' && answer !== 'no') return null;
    if (!verifyMatchConfirm(roundId, memberId, token)) return null;
    return { roundId, memberId, answer, queryString: search.toString() };
}

// A valid signature still isn't enough: the member has to have actually been paired in
// this round, otherwise a link could record a meeting that was never assigned (SA-03).
async function loadMatch(roundId: string, memberId: string) {
    const { rows } = await query<{ member1_id: string; member2_id: string }>(
        'SELECT member1_id, member2_id FROM matches WHERE round_id = $1 AND (member1_id = $2 OR member2_id = $2)',
        [roundId, memberId],
    );
    const match = rows[0];
    if (!match) return null;

    const partnerId = match.member1_id === memberId ? match.member2_id : match.member1_id;
    const { rows: partners } = await query<{ name: string | null }>('SELECT name FROM members WHERE id = $1', [partnerId]);
    return { partnerId, partnerName: partners[0]?.name || 'your match' };
}

type ResponseRow = {
    id: string;
    confirmed_met: boolean | null;
    not_met_reason: string | null;
    met_rating: number | null;
    feedback_note: string | null;
};

async function loadResponse(roundId: string, memberId: string) {
    const { rows } = await query<ResponseRow>(
        'SELECT id, confirmed_met, not_met_reason, met_rating, feedback_note FROM match_responses WHERE round_id = $1 AND member_id = $2',
        [roundId, memberId],
    );
    return rows[0] ?? null;
}

// Whether the follow-up for the answer they gave has been filled in yet. An "already
// answered" visit with it still empty gets the form again instead of a dead end.
function hasFollowUp(row: ResponseRow) {
    if (row.confirmed_met === true) return row.met_rating != null || row.feedback_note != null;
    return row.not_met_reason != null || row.feedback_note != null;
}

const NOTE_MAX = 2000;

// The follow-up asked after each answer, entirely optional: the answer we needed is
// already saved by the time it's shown, so closing the tab here costs nothing.
function followUpForm(params: Params, met: boolean) {
    const action = `/api/match-confirm?${params.queryString}`;
    if (met) {
        const stars = [5, 4, 3, 2, 1].map(n =>
            `<input type="radio" id="star-${n}" name="rating" value="${n}"${n === 5 ? ' required' : ''}>`
            + `<label for="star-${n}" title="${n} star${n === 1 ? '' : 's'}" aria-label="${n} star${n === 1 ? '' : 's'}">★</label>`).join('');
        return `<form method="post" action="${action}">
<input type="hidden" name="action" value="feedback">
<div class="stars" role="radiogroup" aria-label="Rate the meeting">${stars}</div>
<label class="field-label" for="note">How was it? <span style="font-weight:400;color:#a1a1aa">(optional)</span></label>
<textarea id="note" name="note" maxlength="${NOTE_MAX}" placeholder="What did you talk about? Anything we should know?"></textarea>
<button type="submit">Send</button></form>`;
    }
    const reasons = REASONS.map(r =>
        `<label><input type="radio" name="reason" value="${r.value}">${r.label}</label>`).join('');
    return `<form method="post" action="${action}">
<input type="hidden" name="action" value="feedback">
<div class="reasons">${reasons}</div>
<label class="field-label" for="note">Anything to add? <span style="font-weight:400;color:#a1a1aa">(optional)</span></label>
<textarea id="note" name="note" maxlength="${NOTE_MAX}" placeholder="Anything that would help us make the next match work"></textarea>
<button type="submit">Send</button></form>`;
}

function flipLink(params: Params, label: string) {
    const flipped = new URLSearchParams(params.queryString);
    flipped.set('a', params.answer === 'yes' ? 'no' : 'yes');
    return `<div class="quiet"><form method="post" action="/api/match-confirm?${flipped.toString()}">
<input type="hidden" name="action" value="answer"><button type="submit">${label}</button></form></div>`;
}

// GET never writes. Corporate mail scanners fetch every link in a message before the
// person ever sees it, so recording the answer here would fill the table with whatever
// the scanner happened to open last — see the same note on /api/unsubscribe.
//
// The answer is posted by the inline script instead, which scanners don't run and people
// don't notice: one tap in the email, a page that says "got it". The visible button is the
// fallback for anyone whose client blocks the script.
export async function GET(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();

    const match = await loadMatch(params.roundId, params.memberId);
    if (!match) return INVALID();

    const name = escapeHtml(match.partnerName);
    const response = await loadResponse(params.roundId, params.memberId);
    const answered = response?.confirmed_met ?? null;

    if (response && answered !== null) {
        const flip = flipLink({ ...params, answer: answered ? 'yes' : 'no' }, answered ? "Actually, we didn't meet" : 'Actually, we did meet');
        if (!hasFollowUp(response)) {
            return page('Already answered', `<h1>You've already answered</h1>
<p>You told us you ${answered ? 'met' : "didn't meet"} <span class="name">${name}</span> that week. ${answered ? 'How would you rate it?' : "Why didn't you meet?"}</p>
${followUpForm(params, answered)}
${flip}`);
        }
        return page('Already answered', `<h1>You've already answered</h1>
<p>You told us you ${answered ? 'met' : "didn't meet"} <span class="name">${name}</span> that week. Thanks — that's all we needed.</p>
${flip}`);
    }

    const label = params.answer === 'yes' ? 'Yes, we met' : "No, we didn't meet";
    return page('Saving your answer', `<h1>Saving your answer…</h1>
<p>Recording that you ${params.answer === 'yes' ? 'met' : "didn't meet"} <span class="name">${name}</span>.</p>
<form id="answer-form" method="post" action="/api/match-confirm?${params.queryString}">
<input type="hidden" name="action" value="answer"><button type="submit">${label}</button></form>
<script>document.getElementById('answer-form').submit();</script>`);
}

export async function POST(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();

    const match = await loadMatch(params.roundId, params.memberId);
    if (!match) return INVALID();

    let body: URLSearchParams;
    try {
        body = new URLSearchParams(await request.text());
    } catch {
        return INVALID();
    }

    const name = escapeHtml(match.partnerName);
    const isFeedback = body.get('action') === 'feedback';
    let feedbackMet: boolean | null = null;

    try {
        const existing = await loadResponse(params.roundId, params.memberId);

        if (isFeedback) {
            // The follow-up belongs to whatever answer is stored, not the one in the link:
            // someone who flipped their answer on the page is still holding the old URL.
            if (!existing || existing.confirmed_met == null) return INVALID();
            feedbackMet = existing.confirmed_met;

            const note = (body.get('note') || '').trim().slice(0, NOTE_MAX) || null;
            if (feedbackMet) {
                const rating = Number(body.get('rating'));
                const validRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
                await query(
                    'UPDATE match_responses SET met_rating = COALESCE($1, met_rating), feedback_note = COALESCE($2, feedback_note) WHERE id = $3',
                    [validRating, note, existing.id],
                );
            } else {
                const reason = body.get('reason');
                const validReason = REASONS.some(r => r.value === reason) ? reason : null;
                await query(
                    'UPDATE match_responses SET not_met_reason = COALESCE($1, not_met_reason), feedback_note = COALESCE($2, feedback_note) WHERE id = $3',
                    [validReason, note, existing.id],
                );
            }
        } else if (existing) {
            // Changing the answer wipes the follow-up that went with the old one — a rating
            // on a meeting that didn't happen, or a reason for one that did, is just noise.
            await query(
                `UPDATE match_responses SET
                    not_met_reason = CASE WHEN confirmed_met IS DISTINCT FROM $1::boolean THEN NULL ELSE not_met_reason END,
                    met_rating     = CASE WHEN confirmed_met IS DISTINCT FROM $1::boolean THEN NULL ELSE met_rating END,
                    feedback_note  = CASE WHEN confirmed_met IS DISTINCT FROM $1::boolean THEN NULL ELSE feedback_note END,
                    confirmed_met  = $1::boolean
                  WHERE id = $2`,
                [params.answer === 'yes', existing.id],
            );
        } else {
            await query(
                'INSERT INTO match_responses (round_id, member_id, confirmed_met) VALUES ($1, $2, $3)',
                [params.roundId, params.memberId, params.answer === 'yes'],
            );
        }
    } catch (error) {
        console.error('match-confirm write failed', error);
        return page('Something went wrong', `<h1>We couldn't save that</h1>
<p>Your answer didn't go through. Try again from the portal and it'll stick.</p>
<p><a href="/members/dashboard?section=match">Open the portal →</a></p>`, 500);
    }

    if (feedbackMet !== null) {
        return page('Thanks', `<h1>Thanks — that helps</h1>
<p>${feedbackMet ? 'Glad you two got to talk.' : "Noted. You're in this week's round either way."}</p>`);
    }

    const met = params.answer === 'yes';
    return page('Thanks', `<h1>Got it — thanks</h1>
<p>Marked that you ${met ? 'met' : "didn't meet"} <span class="name">${name}</span>. ${met ? 'How would you rate it?' : "Why didn't you meet?"}</p>
${followUpForm(params, met)}
${flipLink(params, met ? "Actually, we didn't meet" : 'Actually, we did meet')}`);
}
