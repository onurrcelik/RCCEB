'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

export default function AuthCallbackPage() {
    const router = useRouter();
    const [error, setError] = useState('');

    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookieOptions: { maxAge: 30 * 24 * 60 * 60 } },
        );

        async function handleCallback() {
            const hash = window.location.hash.slice(1);
            const hashParams = new URLSearchParams(hash);
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (accessToken && refreshToken) {
                const { error: sessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });
                if (sessionError) {
                    setError('This link is invalid or has expired.');
                    return;
                }
            } else {
                const code = new URLSearchParams(window.location.search).get('code');
                if (!code) {
                    setError('Invalid callback. No auth code found.');
                    return;
                }

                const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError) {
                    setError('This link is invalid or has expired.');
                    return;
                }
            }

            const res = await fetch('/api/members/profile', { cache: 'no-store' });
            if (!res.ok) {
                setError('You are not registered as a member.');
                return;
            }

            const { member } = await res.json();

            // ?next=/some/path lets a caller land somewhere other than the
            // dashboard once the session cookie is set — the mobile app uses it
            // to open /account/delete inside its own WebView. Only same-origin
            // absolute paths are accepted, so this can't become an open redirect.
            const next = new URLSearchParams(window.location.search).get('next');
            if (next && next.startsWith('/') && !next.startsWith('//')) {
                router.replace(next);
                return;
            }

            router.replace(member?.onboarding_complete ? '/members/dashboard' : '/members/onboarding');
        }

        handleCallback();
    }, [router]);

    if (error) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                        <XCircleIcon className="w-8 h-8 text-red-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Link expired</h1>
                    <p className="text-zinc-400 mb-8">{error}</p>
                    <Link
                        href="/members/login"
                        className="inline-flex items-center gap-2 bg-gold-400 text-zinc-950 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-gold-400/90 transition-colors"
                    >
                        Back to sign-in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-gold-400/30 border-t-gold-400 animate-spin" />
        </div>
    );
}
