'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ADMIN_COOKIE_NAME } from '@/app/lib/admin-session';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';

export default function AdminAuthCallbackPage() {
    const router = useRouter();
    const [error, setError] = useState('');

    useEffect(() => {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookieOptions: { name: ADMIN_COOKIE_NAME } },
        );

        async function handleCallback() {
            const hashParams = new URLSearchParams(window.location.hash.slice(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');

            if (accessToken && refreshToken) {
                const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                if (sessionError) { setError('This link is invalid or has expired.'); return; }
            } else {
                const code = new URLSearchParams(window.location.search).get('code');
                if (!code) { setError('Invalid callback. No auth code found.'); return; }
                const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError) { setError('This link is invalid or has expired.'); return; }
            }

            router.replace('/admin');
        }

        handleCallback();
    }, [router]);

    if (error) {
        return (
            <div className="min-h-screen bg-cream flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                        <XCircleIcon className="w-8 h-8 text-red-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-3">Link expired</h1>
                    <p className="text-slate-500 mb-8">{error}</p>
                    <Link href="/admin/login" className="inline-flex items-center gap-2 bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors">
                        Back to sign-in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
        </div>
    );
}
