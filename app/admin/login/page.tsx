'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ADMIN_COOKIE_NAME } from '@/app/lib/admin-session';
import { OTP_MIN_LENGTH, OTP_MAX_LENGTH } from '@/app/lib/otp';
import { RccebLogo } from '@/app/components/ui/RccebLogo';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [code, setCode] = useState('');
    const [verifying, setVerifying] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error || 'Login failed.');
            if (data?.devLink) { window.location.href = data.devLink; return; }
            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = code.trim();
        if (token.length < OTP_MIN_LENGTH) return;
        setVerifying(true);
        setError('');
        try {
            const supabase = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                { cookieOptions: { name: ADMIN_COOKIE_NAME } },
            );
            const { error: otpError } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token,
                type: 'email',
            });
            if (otpError) throw new Error('Invalid or expired code. Please try again.');
            window.location.href = '/admin';
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
            setVerifying(false);
        }
    };

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 w-full max-w-sm">
                <div className="mb-8 flex flex-col items-center text-center">
                    <RccebLogo tone="light" size={56} showWordmark={false} />
                    <div className="text-[10px] font-black text-gold-600 uppercase tracking-[0.2em] mt-4 mb-1">Admin Access</div>
                    <h1 className="text-2xl font-semibold text-slate-900">RCCEB</h1>
                </div>

                {sent ? (
                    <>
                        <p className="text-sm text-slate-500 text-center mb-6">
                            We sent a sign-in link and a code to <span className="font-medium text-slate-700">{email}</span>.
                        </p>
                        <form onSubmit={handleVerifyCode} className="space-y-4">
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
                                placeholder="Enter code from email"
                                autoFocus
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 text-center tracking-[0.3em] font-bold focus:outline-none focus:border-brand-blue-500 focus:ring-4 focus:ring-brand-blue-500/5 transition-all placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-normal"
                            />

                            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

                            <button
                                type="submit"
                                disabled={verifying || code.trim().length < OTP_MIN_LENGTH}
                                className="w-full py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                                {verifying ? 'Verifying...' : 'Sign in with code'}
                            </button>
                        </form>
                        <button
                            onClick={() => { setSent(false); setEmail(''); setCode(''); setError(''); }}
                            className="mt-6 w-full text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
                        >
                            Use a different email
                        </button>
                    </>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoFocus
                            required
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 focus:ring-4 focus:ring-brand-blue-500/5 transition-all placeholder:text-slate-400"
                        />

                        {error && (
                            <p className="text-xs text-red-500 font-medium">{error}</p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="w-full py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Sending...' : 'Send magic link'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
