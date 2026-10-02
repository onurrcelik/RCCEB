'use client';

import React, { useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

function Section({ title, description, children }: {
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <div className="text-[15px] font-bold text-slate-900">{title}</div>
                {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

export default function SettingsPage() {
    const [health, setHealth] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

    const checkHealth = async () => {
        setHealth('checking');
        try {
            const res = await fetch('/api/admin/settings', { cache: 'no-store' });
            setHealth(res.ok ? 'ok' : 'error');
        } catch {
            setHealth('error');
        }
    };

    return (
        <div className="p-4 md:p-12 text-slate-700">
            <div className="max-w-2xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Settings</h1>
                    <p className="text-sm text-slate-400">Portal configuration</p>
                </header>

                <div className="space-y-6">
                    <Section title="System Status" description="Verifies that the server and database connection are healthy.">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {health === 'ok' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                                {health === 'error' && <ExclamationCircleIcon className="w-5 h-5 text-red-500" />}
                                {health === 'idle' && <div className="w-2.5 h-2.5 rounded-full bg-slate-200 ml-1" />}
                                {health === 'checking' && <div className="w-2.5 h-2.5 rounded-full bg-brand-blue-400 animate-pulse ml-1" />}
                                <span className="text-sm text-slate-600">
                                    {health === 'idle' && 'Click to run health check'}
                                    {health === 'checking' && 'Checking...'}
                                    {health === 'ok' && 'All systems operational'}
                                    {health === 'error' && 'Database check failed — check DATABASE_URL'}
                                </span>
                            </div>
                            <button
                                onClick={checkHealth}
                                disabled={health === 'checking'}
                                className="px-4 py-2 bg-slate-100 text-slate-700 text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
                            >
                                {health === 'checking' ? 'Checking...' : 'Run Check'}
                            </button>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
