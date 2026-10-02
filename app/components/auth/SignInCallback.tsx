'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { RccebLogo } from '@/app/components/ui/RccebLogo';

// Landing page for an emailed sign-in link. The token is redeemed by a script-driven
// POST (see /api/auth/verify) so mail scanners that prefetch links can't spend it.
export function SignInCallback({ kind }: { kind: 'member' | 'admin' }) {
    const [error, setError] = useState('');
    const started = useRef(false);
    const loginHref = kind === 'admin' ? '/admin/login' : '/members/login';

    useEffect(() => {
        // React dev mode runs effects twice; a token can only be redeemed once.
        if (started.current) return;
        started.current = true;

        const token = new URLSearchParams(window.location.search).get('token');
        // Drop the token from the address bar and history as soon as it's read.
        window.history.replaceState(null, '', window.location.pathname);
        if (!token) {
            setError('This sign-in link is incomplete. Request a new one.');
            return;
        }
        fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, token }),
        })
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'This link is invalid or has expired.');
                window.location.replace(data.redirectTo);
            })
            .catch(err => setError(err instanceof Error ? err.message : 'This link is invalid or has expired.'));
    }, [kind]);

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center px-4">
            <div className="text-center max-w-sm">
                <div className="flex justify-center mb-8">
                    <RccebLogo tone="light" size={48} />
                </div>
                {error ? (
                    <>
                        <XCircleIcon className="w-10 h-10 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-semibold text-navy-900 mb-2">Link expired</h1>
                        <p className="text-sm text-slate-500 mb-8">{error}</p>
                        <Link href={loginHref} className="inline-flex items-center rounded-xl bg-navy-900 px-6 py-3 text-sm font-semibold text-white hover:bg-navy-700 transition-colors">
                            Back to sign-in
                        </Link>
                    </>
                ) : (
                    <>
                        <div className="w-10 h-10 rounded-full border-2 border-gold-500/30 border-t-gold-600 animate-spin mx-auto mb-4" />
                        <p className="text-sm text-slate-500">Signing you in…</p>
                    </>
                )}
            </div>
        </div>
    );
}
