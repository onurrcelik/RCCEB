'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function VerifyRedirect() {
    const router = useRouter();
    const params = useSearchParams();

    useEffect(() => {
        const qs = params.toString();
        router.replace(`/auth/callback${qs ? `?${qs}` : ''}`);
    }, [params, router]);

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-2 border-gold-400/30 border-t-gold-400 animate-spin" />
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full border-2 border-gold-400/30 border-t-gold-400 animate-spin" />
            </div>
        }>
            <VerifyRedirect />
        </Suspense>
    );
}
