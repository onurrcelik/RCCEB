'use client';

import React, { useEffect, useState } from 'react';
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
    const [meetingLink, setMeetingLink] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok'>('idle');
    const [saveError, setSaveError] = useState('');
    const [health, setHealth] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

    useEffect(() => {
        fetch('/api/admin/settings', { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.settings) setMeetingLink(d.settings.meeting_link || ''); })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        setSaveError('');
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meeting_link: meetingLink }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            setSaveStatus('ok');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save');
            setSaveStatus('idle');
        }
    };

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
                    <Section title="Applications" description="Used by the “Meet” button on the Applications page.">
                        {!loaded ? (
                            <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                        ) : (
                            <form onSubmit={save} className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Meeting booking link</label>
                                    <input
                                        type="url"
                                        value={meetingLink}
                                        onChange={e => setMeetingLink(e.target.value)}
                                        placeholder="https://calendly.com/rcceb/intro"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-blue-500 focus:ring-2 focus:ring-brand-blue-500/10"
                                    />
                                    <p className="text-xs text-slate-400 mt-1.5">Applicants receive this link to book their intro conversation.</p>
                                </div>
                                {saveError && <p className="text-sm text-red-500">{saveError}</p>}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saveStatus === 'saving'}
                                        className="px-5 py-2 bg-brand-blue-500 text-white text-[12px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-blue-600 transition-all disabled:opacity-50"
                                    >
                                        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'ok' ? 'Saved ✓' : 'Save'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </Section>

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
