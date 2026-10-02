'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ArrowPathIcon, ArrowTrendingUpIcon, UsersIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { categoryLabel, MEMBER_CATEGORIES } from '@/app/lib/categories';

interface Applicant {
    id: string;
    name: string;
    status: string;
    admission_status: string;
    categories: string[];
    graduation_year: number | null;
    created_at: string;
}

// One pipeline stage per application: an admission decision, once made, wins over the
// verification status that led up to it.
function stageOf(a: Applicant): string {
    return a.admission_status || a.status;
}

const STATUS_COLORS: Record<string, string> = {
    submitted: 'bg-brand-blue-500',
    'sent to rc': 'bg-violet-500',
    'rc verified': 'bg-cyan-500',
    accepted: 'bg-green-500',
    deferred: 'bg-amber-400',
    declined: 'bg-red-400',
};

const STATUS_LABELS: Record<string, string> = {
    submitted: 'Submitted',
    'sent to rc': 'Sent to RC',
    'rc verified': 'RC Verified',
    accepted: 'Accepted',
    deferred: 'Deferred',
    declined: 'Declined',
};

function StatCard({ label, value, sub, icon: Icon, accent }: {
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ElementType;
    accent: string;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${accent}`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
            {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
        </div>
    );
}

export default function AnalyticsPage() {
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/applications')
            .then(async r => {
                const data = await r.json().catch(() => null);
                // A 401 or 500 returns { error }, not a list. Rendering zeroes off
                // a failed load reads as "no applicants", so say so instead.
                if (!r.ok || !Array.isArray(data)) {
                    throw new Error(data?.error || 'Failed to load applicants');
                }
                return data;
            })
            .then(data => { setApplicants(data); setError(null); })
            .catch(e => setError(e instanceof Error ? e.message : 'Failed to load applicants'))
            .finally(() => setLoading(false));
    }, []);

    const stats = useMemo(() => {
        const total = applicants.length;
        const accepted = applicants.filter(a => a.admission_status === 'accepted').length;
        const declined = applicants.filter(a => a.admission_status === 'declined').length;
        const inPipeline = applicants.filter(a => !a.admission_status).length;

        const now = new Date();
        const thisMonth = applicants.filter(a => {
            const d = new Date(a.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;

        // By status
        const byStatus = Object.entries(STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
            count: applicants.filter(a => stageOf(a) === value).length,
        }));

        // Monthly trend — last 6 months
        const months: { label: string; count: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleDateString('en-US', { month: 'short' });
            const count = applicants.filter(a => {
                const ad = new Date(a.created_at);
                return ad.getMonth() === d.getMonth() && ad.getFullYear() === d.getFullYear();
            }).length;
            months.push({ label, count });
        }

        // Pathways (an applicant can pick more than one)
        const memberTypes: [string, number][] = MEMBER_CATEGORIES.map(c => [
            categoryLabel(c.id, 'label'),
            applicants.filter(a => (a.categories ?? []).includes(c.id)).length,
        ]);

        // RC class decades
        const decadeMap: Record<string, number> = {};
        applicants.forEach(a => {
            const key = a.graduation_year ? `${Math.floor(a.graduation_year / 10) * 10}s` : 'Unknown';
            decadeMap[key] = (decadeMap[key] || 0) + 1;
        });
        const referrals = Object.entries(decadeMap).sort((a, b) => b[0].localeCompare(a[0]));

        return { total, accepted, declined, inPipeline, thisMonth, byStatus, months, memberTypes, referrals };
    }, [applicants]);

    const maxMonthCount = Math.max(...stats.months.map(m => m.count), 1);
    const maxTypeCount = Math.max(...stats.memberTypes.map(([, c]) => c), 1);
    const maxRefCount = Math.max(...stats.referrals.map(([, c]) => c), 1);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="w-6 h-6 animate-spin text-slate-300" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-12 text-slate-700 font-sans">
            <div className="max-w-[1100px] mx-auto">
                {/* Header */}
                <header className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Analytics</h1>
                    <p className="text-sm text-slate-400">Application pipeline and applicant mix</p>
                </header>

                {error && (
                    <div className="mb-6 px-4 py-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
                        {error} — the numbers below are not real. Try reloading, or log in again.
                    </div>
                )}

                {/* Top Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard label="Total Applicants" value={stats.total} icon={UsersIcon} accent="bg-brand-blue-500" />
                    <StatCard label="Accepted" value={stats.accepted} sub={stats.total ? `${Math.round(stats.accepted / stats.total * 100)}% acceptance rate` : '—'} icon={CheckCircleIcon} accent="bg-green-500" />
                    <StatCard label="Awaiting Decision" value={stats.inPipeline} sub="No admission decision yet" icon={ArrowTrendingUpIcon} accent="bg-violet-500" />
                    <StatCard label="This Month" value={stats.thisMonth} sub="New applications" icon={ClockIcon} accent="bg-cyan-500" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Pipeline Breakdown */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">Pipeline Breakdown</div>
                        <div className="space-y-3">
                            {stats.byStatus.map(({ value, label, count }) => (
                                <div key={value}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[12px] font-medium text-slate-600">{label}</span>
                                        <span className="text-[12px] font-bold text-slate-900">{count}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${STATUS_COLORS[value] || 'bg-slate-400'}`}
                                            style={{ width: stats.total ? `${(count / stats.total) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Monthly Trend */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">Monthly Applications</div>
                        <div className="flex items-end gap-2 h-36">
                            {stats.months.map(({ label, count }) => (
                                <div key={label} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[11px] font-bold text-slate-700">{count > 0 ? count : ''}</span>
                                    <div className="w-full flex flex-col justify-end" style={{ height: '96px' }}>
                                        <div
                                            className="w-full bg-brand-blue-500 rounded-t-md transition-all duration-700"
                                            style={{ height: `${(count / maxMonthCount) * 96}px`, minHeight: count > 0 ? '4px' : '0' }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Member Types */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">Pathway Distribution</div>
                        {stats.total === 0 ? (
                            <p className="text-sm text-slate-400 italic">No data yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {stats.memberTypes.map(([type, count]) => (
                                    <div key={type}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[12px] font-medium text-slate-600">{type}</span>
                                            <span className="text-[12px] font-bold text-slate-900">{count}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-indigo-400 transition-all duration-700"
                                                style={{ width: `${(count / maxTypeCount) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Applicants by RC Class */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5">Applicants by RC Class</div>
                        {stats.referrals.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No data yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {stats.referrals.map(([source, count]) => (
                                    <div key={source}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[12px] font-medium text-slate-600 truncate max-w-[200px]" title={source}>{source}</span>
                                            <span className="text-[12px] font-bold text-slate-900 shrink-0 ml-2">{count}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-cyan-400 transition-all duration-700"
                                                style={{ width: `${(count / maxRefCount) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
