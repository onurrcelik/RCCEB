'use client';

import { useEffect, useState } from 'react';
import { PERKS } from '@/app/members/dashboard/perks/perks-data';

type InterestRow = {
    perk_id: string;
    created_at: string;
    member: { id: string; name: string; email: string } | null;
};

export default function PerksAdminPage() {
    const [rows, setRows] = useState<InterestRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/perks', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : []))
            .then(data => setRows(Array.isArray(data) ? data : []))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Perks</h1>
            <p className="text-sm text-slate-500 mb-8">Members who tapped &quot;I&apos;m interested&quot; — reach out and introduce them to the partner.</p>

            {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
            ) : (
                PERKS.map(perk => {
                    const interested = rows.filter(row => row.perk_id === perk.id);
                    return (
                        <div key={perk.id} className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                                <h2 className="text-sm font-bold text-slate-900">{perk.name}</h2>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{interested.length} interested</span>
                            </div>
                            {interested.length === 0 ? (
                                <p className="px-5 py-4 text-sm text-slate-400">No one yet.</p>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {interested.map(row => (
                                        <div key={row.member?.id ?? row.created_at} className="flex items-center justify-between px-5 py-3">
                                            <div>
                                                <div className="text-sm font-medium text-slate-900">{row.member?.name ?? 'Unknown member'}</div>
                                                <div className="text-xs text-slate-500">{row.member?.email}</div>
                                            </div>
                                            <div className="text-xs text-slate-400">{new Date(row.created_at).toLocaleDateString()}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
