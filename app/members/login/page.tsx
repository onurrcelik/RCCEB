'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRightIcon, EnvelopeIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { RccebLogo } from '@/app/components/ui/RccebLogo';
import { BRAND } from '@/app/lib/brand';
import { OTP_MIN_LENGTH, OTP_MAX_LENGTH } from '@/app/lib/otp';

// Set by /members/invite when it can't hand the member straight into onboarding.
const NOTICES: Record<string, string> = {
    invite_expired: "That invite link has expired. Enter your email and we'll send you a fresh one.",
    invite_used: "You've already completed onboarding — sign in below.",
    invite_invalid: "We couldn't read that invite link. Enter your email to sign in.",
    invite_throttled: 'Too many attempts just now. Wait a few minutes, then try again.',
    invite_error: "Something went wrong opening your invite. Enter your email to sign in.",
};

function MemberLoginContent() {
    const notice = NOTICES[useSearchParams().get('notice') || ''];
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [code, setCode] = useState('');
    const [verifying, setVerifying] = useState(false);

    async function handleVerifyCode(e: React.FormEvent) {
        e.preventDefault();
        const token = code.trim();
        if (token.length < OTP_MIN_LENGTH) return;
        setVerifying(true);
        setError('');
        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'member', email: email.trim().toLowerCase(), code: token }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Invalid or expired code. Please try again.');
            window.location.href = data.redirectTo;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
            setVerifying(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/members/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Something went wrong.');
            if (json.devLink) { window.location.href = json.devLink; return; }
            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden">
            {/* Soft gold glow behind the seal */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-gold-300/20 blur-3xl pointer-events-none" />

            <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
                <div className="w-full max-w-md">
                    <div className="flex justify-center mb-10">
                        <RccebLogo tone="light" size={56} />
                    </div>
                    {sent ? (
                        <div className="text-center animate-fade-in">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(174,141,81,0.12)', border: '1px solid rgba(174,141,81,0.3)' }}>
                                <CheckCircleIcon className="w-7 h-7 text-gold-600" />
                            </div>
                            <h1 className="text-3xl font-semibold text-navy-900 mb-3">Check your inbox</h1>
                            <p className="text-zinc-500 text-base leading-relaxed font-light">
                                We sent a sign-in link and a code to your email.
                            </p>

                            <form onSubmit={handleVerifyCode} className="mt-8 space-y-3 text-left">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
                                    placeholder="Enter code from email"
                                    className="w-full bg-white border border-cream-300 rounded-xl px-4 py-3.5 text-navy-900 text-center tracking-[0.4em] font-bold placeholder:tracking-normal placeholder:font-normal placeholder:text-zinc-400 focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/15 transition-all text-sm shadow-sm"
                                />
                                {error && (
                                    <p className="text-red-500 text-sm font-light text-center">{error}</p>
                                )}
                                <button
                                    type="submit"
                                    disabled={verifying || code.trim().length < OTP_MIN_LENGTH}
                                    className="w-full flex items-center justify-center gap-2 bg-navy-900 hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm uppercase tracking-[0.12em] py-3.5 rounded-xl transition-all duration-200 shadow-md shadow-navy-900/20"
                                >
                                    {verifying ? (
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Sign in with code
                                            <ArrowRightIcon className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <p className="mt-4 text-sm text-zinc-400 leading-relaxed font-light">
                                Having trouble?{' '}
                                <a href="mailto:hello@rcceb.org" className="text-navy-700 hover:underline transition-colors font-medium">
                                    hello@rcceb.org
                                </a>
                            </p>
                            <button
                                onClick={() => { setSent(false); setEmail(''); setCode(''); setError(''); }}
                                className="mt-8 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 hover:text-zinc-600 transition-colors"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="mb-10">
                                <h1 className="text-4xl font-semibold text-navy-900 mb-3 leading-tight">
                                    Member Access
                                </h1>
                                <p className="text-zinc-500 font-light">
                                    Enter your email to receive a magic link.
                                </p>
                                {notice && (
                                    <p className="mt-5 rounded-xl border border-gold-500/25 bg-gold-100/60 px-4 py-3 text-sm font-light leading-relaxed text-navy-800">
                                        {notice}
                                    </p>
                                )}
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-3">
                                <div className="relative group">
                                    <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-gold-600 transition-colors" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        required
                                        className="w-full bg-white border border-cream-300 rounded-xl pl-11 pr-4 py-3.5 text-navy-900 placeholder:text-zinc-400 focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/15 transition-all text-sm shadow-sm"
                                    />
                                </div>

                                {error && (
                                    <p className="text-red-500 text-sm font-light">{error}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !email.trim()}
                                    className="w-full flex items-center justify-center gap-2 bg-navy-900 hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm uppercase tracking-[0.12em] py-3.5 rounded-xl transition-all duration-200 shadow-md shadow-navy-900/20"
                                >
                                    {loading ? (
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Send magic link
                                            <ArrowRightIcon className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>

                            <p className="mt-8 text-center text-xs text-zinc-500 font-light">
                                Not a member yet?{' '}
                                <a href={BRAND.joinUrl} className="text-navy-700 font-semibold hover:underline transition-colors">
                                    Join the Bond
                                </a>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function MemberLoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-cream" />}>
            <MemberLoginContent />
        </Suspense>
    );
}
