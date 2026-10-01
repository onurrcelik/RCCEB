import { NextRequest, NextResponse } from 'next/server';
import { replyToAddress } from '@/app/lib/brand';
import { decodeEmailParam, verifyToken, recordUnsubscribe, clearUnsubscribe } from '@/app/lib/unsubscribe';
import { query } from '@/app/lib/db';
import { escapeHtml } from '@/app/lib/html-escape';

export const dynamic = 'force-dynamic';

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
  .email { font-weight:600; color:#0e1b2d; word-break:break-all; }
  button { font:inherit; font-weight:600; font-size:14px; cursor:pointer; border-radius:10px;
           padding:11px 22px; border:1px solid #0e1b2d; background:#0e1b2d; color:#fff; }
  button:hover { background:#000; }
  button.ghost { background:transparent; color:#52525b; border-color:#d4d4d8; }
  button.ghost:hover { background:#f4f4f5; color:#0e1b2d; }
  .brand { margin:24px 0 0; font-size:12px; color:#a1a1aa; }
  form { margin:0; }
  @media (prefers-color-scheme: dark) {
    body { background:#0a1628; color:#fafafa; }
    .card { background:#0e1b2d; border-color:#1d283f; }
    p { color:#a1a1aa; } .email { color:#fafafa; }
    button { background:#f4f1ea; color:#0e1b2d; border-color:#fafafa; }
    button.ghost { background:transparent; color:#a1a1aa; border-color:#2f3848; }
  }
</style></head><body><div class="card">${body}<p class="brand">Robert College Community Entrepreneurs Bond</p></div></body></html>`;
    return new NextResponse(html, {
        status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

const INVALID = () => page('Link expired', `<h1>This unsubscribe link isn't valid</h1>
<p>It may have been truncated by your email client. Email <a href="mailto:${replyToAddress()}?subject=unsubscribe">${replyToAddress()}</a> and we'll take you off the list right away.</p>`, 400);

function readParams(request: NextRequest) {
    const url = request.nextUrl;
    const email = decodeEmailParam(url.searchParams.get('e'));
    const token = url.searchParams.get('t');
    if (!email || !token || !verifyToken(email, token)) return null;
    return { email, token };
}

// Confirmation screen. We deliberately do NOT unsubscribe on GET: corporate mail
// scanners prefetch every link in a message, which would silently opt people out.
export async function GET(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();

    const safeEmail = escapeHtml(params.email);
    const queryString = request.nextUrl.searchParams.toString();

    let unsubscribed = false;
    try {
        const { rows } = await query<{ email: string }>(
            'SELECT email FROM email_unsubscribes WHERE email = $1',
            [params.email],
        );
        unsubscribed = Boolean(rows[0]);
    } catch (error) {
        console.error('unsubscribe lookup failed', error);
    }

    if (unsubscribed) {
        return page('Unsubscribed', `<h1>You're unsubscribed</h1>
<p><span class="email">${safeEmail}</span> won't receive 1-on-1 match emails or announcements from us. Account emails you ask for — like login links — still work.</p>
<form method="post" action="/api/unsubscribe?${queryString}"><input type="hidden" name="action" value="resubscribe">
<button class="ghost" type="submit">Resubscribe</button></form>`);
    }

    return page('Unsubscribe', `<h1>Unsubscribe from RCCEB emails</h1>
<p>Confirm that <span class="email">${safeEmail}</span> should stop receiving 1-on-1 match emails and announcements.</p>
<form method="post" action="/api/unsubscribe?${queryString}"><input type="hidden" name="action" value="unsubscribe">
<button type="submit">Unsubscribe</button></form>`);
}

// Handles both the confirmation form above and RFC 8058 one-click unsubscribe,
// where the mail client POSTs "List-Unsubscribe=One-Click" with no user visible.
export async function POST(request: NextRequest) {
    const params = readParams(request);
    if (!params) return INVALID();

    let action = '';
    try {
        action = new URLSearchParams(await request.text()).get('action') || '';
    } catch {
        // one-click bodies are tiny and well-formed; treat anything else as unsubscribe
    }

    try {
        if (action === 'resubscribe') {
            await clearUnsubscribe(params.email);
            return page('Resubscribed', `<h1>You're back on the list</h1>
<p><span class="email">${escapeHtml(params.email)}</span> will receive RCCEB emails again.</p>`);
        }
        await recordUnsubscribe(params.email, action === 'unsubscribe' ? 'link' : 'one_click');
    } catch (error) {
        console.error('unsubscribe write failed', error);
        return page('Something went wrong', `<h1>We couldn't save that</h1>
<p>Your request didn't go through. Email <a href="mailto:${replyToAddress()}?subject=unsubscribe">${replyToAddress()}</a> and we'll handle it manually.</p>`, 500);
    }

    return page('Unsubscribed', `<h1>You're unsubscribed</h1>
<p>We've removed <span class="email">${escapeHtml(params.email)}</span> from 1-on-1 match emails and announcements. It can take a few minutes to take effect.</p>
<form method="post" action="/api/unsubscribe?${request.nextUrl.searchParams.toString()}"><input type="hidden" name="action" value="resubscribe">
<button class="ghost" type="submit">Undo</button></form>`);
}
