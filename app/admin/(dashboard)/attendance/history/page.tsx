'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    CalendarDaysIcon,
    CheckIcon,
    CloudArrowUpIcon,
    ExclamationTriangleIcon,
    PencilIcon,
    TrashIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';

interface Member {
    id: string;
    name: string | null;
    email: string | null;
}

interface Meeting {
    id: string;
    meeting_date: string;
    screenshot_file_name: string | null;
    created_at: string;
    updated_at: string;
}

interface AttendanceRow {
    member_id: string;
    meeting_id: string;
    present: boolean;
    matched_text: string | null;
    match_score: number | null;
    match_strategy: string | null;
    manually_adjusted: boolean;
}

interface AttendanceResponse {
    members: Member[];
    meetings: Meeting[];
    selectedMeeting: Meeting | null;
    attendance: AttendanceRow[];
    history: AttendanceRow[];
    streaks: Record<string, number>;
}

interface ChartPoint {
    date: string;
    groupPct: number | null;
    memberPcts: Record<string, number | null>;
}

interface MatchRoundStub {
    id: string;
    week_of: string;
    status: string;
    responses: { member_id: string; opted_in: boolean | null; member: { name: string | null; email: string | null } | null }[];
    matches: { member1: { name: string | null; email: string | null } | null; member2: { name: string | null; email: string | null } | null }[];
}

interface ChatMessage {
    date: string;
    sender: string;
}

interface ChatDayData {
    date: string;
    total: number;
    bySender: Record<string, number>;
}

function formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatShortDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
    });
}

function HistoryCell({
    row,
    isActive,
    isUpdating,
    onActivate,
    onSelect,
}: {
    row?: AttendanceRow;
    isActive: boolean;
    isUpdating: boolean;
    onActivate: () => void;
    onSelect: (present: boolean | null) => void;
}) {
    if (isUpdating) {
        return <span className="mx-auto block h-6 w-6 rounded-sm bg-slate-200 animate-pulse" />;
    }

    if (isActive) {
        return (
            <div className="flex items-center justify-center gap-1">
                <button
                    onClick={() => onSelect(true)}
                    className="h-4 w-4 rounded-sm bg-emerald-400 hover:bg-emerald-500 transition-colors ring-2 ring-transparent hover:ring-emerald-300"
                    title="Present"
                />
                <button
                    onClick={() => onSelect(false)}
                    className="h-4 w-4 rounded-sm bg-red-400 hover:bg-red-500 transition-colors ring-2 ring-transparent hover:ring-red-300"
                    title="Absent"
                />
                <button
                    onClick={() => onSelect(null)}
                    className="h-4 w-4 rounded-sm bg-slate-100 border border-slate-300 hover:bg-slate-200 transition-colors"
                    title="Clear"
                />
            </div>
        );
    }

    if (!row) {
        return (
            <span
                onClick={onActivate}
                className="mx-auto block h-6 w-6 rounded-sm bg-slate-100 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors"
                title="No record"
            />
        );
    }

    return (
        <span
            onClick={onActivate}
            className={`mx-auto block h-6 w-6 rounded-sm cursor-pointer transition-colors ${
                row.present
                    ? 'bg-emerald-400 hover:bg-emerald-500'
                    : 'bg-red-400 hover:bg-red-500'
            } ${row.manually_adjusted ? 'ring-1 ring-offset-1 ring-slate-400' : ''}`}
            title={`${row.present ? 'Present' : 'Absent'}${row.manually_adjusted ? ' · manual' : ''}`}
        />
    );
}

function parseWhatsAppChat(text: string): ChatMessage[] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const messages: ChatMessage[] = [];
    // Android: "DD/MM/YY, HH:MM - Sender: text"  (also YYYY, also AM/PM, also dot separator)
    const androidRe = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})[,\s]\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?\s*[-–]\s+(.+?):\s/;
    // iOS: "[DD/MM/YYYY, HH:MM:SS AM] Sender: text"
    const iosRe = /^\[(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4}),\s*\d{1,2}:\d{2}:\d{2}(?:\s?[AaPp][Mm])?\]\s+(.+?):\s/;
    for (const line of lines) {
        const match = line.match(androidRe) || line.match(iosRe);
        if (!match) continue;
        const [, d, m, y, sender] = match;
        const date = `${y.length === 2 ? `20${y}` : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        messages.push({ date, sender: sender.trim() });
    }
    return messages;
}

function niceYMax(value: number): number {
    if (value <= 10) return 10;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    return Math.ceil(value / magnitude) * magnitude;
}

function linearRegression(values: number[]): { y0: number; y1: number } {
    const n = values.length;
    if (n < 2) return { y0: values[0] ?? 0, y1: values[0] ?? 0 };
    const sumX = (n * (n - 1)) / 2;
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    const sumY = values.reduce((s, v) => s + v, 0);
    const sumXY = values.reduce((s, v, i) => s + i * v, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { y0: intercept, y1: slope * (n - 1) + intercept };
}

type ChatPeriod = 'daily' | 'weekly' | 'monthly';

function aggregateDays(days: ChatDayData[], period: ChatPeriod): ChatDayData[] {
    if (period === 'daily') return days;
    const buckets = new Map<string, { total: number; bySender: Record<string, number> }>();
    for (const day of days) {
        let key: string;
        if (period === 'weekly') {
            const d = new Date(day.date + 'T00:00:00');
            const dow = d.getDay();
            d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow)); // shift to Monday
            key = d.toISOString().slice(0, 10);
        } else {
            key = day.date.slice(0, 7) + '-01';
        }
        if (!buckets.has(key)) buckets.set(key, { total: 0, bySender: {} });
        const b = buckets.get(key)!;
        b.total += day.total;
        for (const [sender, count] of Object.entries(day.bySender)) {
            b.bySender[sender] = (b.bySender[sender] ?? 0) + count;
        }
    }
    return [...buckets.keys()].sort().map(date => ({
        date,
        total: buckets.get(date)!.total,
        bySender: buckets.get(date)!.bySender,
    }));
}

function chatAxisLabel(date: string, period: ChatPeriod): string {
    const d = new Date(date + 'T00:00:00');
    if (period === 'monthly') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return formatShortDate(date);
}

function ChatTrendChart({
    days,
    senders,
    highlightedSender,
    onHighlight,
}: {
    days: ChatDayData[];
    senders: string[];
    highlightedSender: string | null;
    onHighlight: (sender: string | null) => void;
}) {
    const [zoomDays, setZoomDays] = useState<number | null>(null);
    const [period, setPeriod] = useState<ChatPeriod>('daily');

    const visibleDays = zoomDays ? days.slice(-zoomDays) : days;
    const aggregatedDays = aggregateDays(visibleDays, period);
    const n = aggregatedDays.length;
    if (n === 0) return null;

    const VW = 900, VH = 300;
    const pad = { top: 24, right: 44, bottom: 52, left: 52 };
    const innerW = VW - pad.left - pad.right;
    const innerH = VH - pad.top - pad.bottom;

    const yMax = niceYMax(Math.max(...aggregatedDays.map(d => d.total), 1));
    const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];

    const xOf = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yOf = (v: number) => pad.top + innerH - (v / yMax) * innerH;
    const clamp = (v: number) => Math.max(0, Math.min(yMax, v));

    const toPath = (values: number[]) => {
        let d = '';
        for (let i = 0; i < values.length; i++) {
            d += d === '' ? `M${xOf(i)},${yOf(values[i])}` : `L${xOf(i)},${yOf(values[i])}`;
        }
        return d;
    };

    const step = Math.max(1, Math.ceil(n / Math.floor(innerW / 60)));
    const totalPath = toPath(aggregatedDays.map(d => d.total));

    const rollingAvgPath = period === 'daily' && n > 30 ? (() => {
        const w = 7;
        const smoothed = aggregatedDays.map((_, i) => {
            const slice = aggregatedDays.slice(Math.max(0, i - Math.floor(w / 2)), i + Math.ceil(w / 2));
            return slice.reduce((s, d) => s + d.total, 0) / slice.length;
        });
        return toPath(smoothed);
    })() : null;

    const totalReg = linearRegression(aggregatedDays.map(d => d.total));
    const senderReg = highlightedSender
        ? linearRegression(aggregatedDays.map(d => d.bySender[highlightedSender] ?? 0))
        : null;

    const ZOOM_OPTIONS: { label: string; value: number | null }[] = [
        { label: '1W', value: 7 },
        { label: '1M', value: 30 },
        { label: '3M', value: 90 },
        { label: '6M', value: 180 },
        { label: 'All', value: null },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                {/* Period toggle */}
                <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    {(['daily', 'weekly', 'monthly'] as ChatPeriod[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 text-[10px] font-bold capitalize transition-all ${
                                period === p
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                {/* Zoom */}
                <div className="flex items-center gap-0.5">
                    {ZOOM_OPTIONS.map(opt => {
                        const active = zoomDays === opt.value;
                        const disabled = opt.value !== null && days.length <= opt.value;
                        return (
                            <button
                                key={opt.label}
                                onClick={() => setZoomDays(opt.value)}
                                disabled={disabled}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                                    active
                                        ? 'bg-slate-900 text-white'
                                        : disabled
                                            ? 'text-slate-200 cursor-default'
                                            : 'text-slate-400 hover:text-slate-700'
                                }`}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: 300 }}>
                {yTicks.map(tick => (
                    <g key={tick}>
                        <line x1={pad.left} y1={yOf(tick)} x2={pad.left + innerW} y2={yOf(tick)}
                            stroke={tick === 0 ? '#e2e8f0' : '#f1f5f9'} strokeWidth={1} />
                        <text x={pad.left - 8} y={yOf(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8">
                            {tick}
                        </text>
                    </g>
                ))}
                <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="#e2e8f0" strokeWidth={1} />
                {aggregatedDays.map((day, i) => {
                    if (i % step !== 0 && i !== n - 1) return null;
                    return (
                        <text key={i} x={xOf(i)} y={pad.top + innerH + 16} textAnchor="middle" fontSize={9} fill="#94a3b8">
                            {chatAxisLabel(day.date, period)}
                        </text>
                    );
                })}

                {/* Sender lines */}
                {senders.map((sender, si) => {
                    const path = toPath(aggregatedDays.map(d => d.bySender[sender] ?? 0));
                    const isHighlighted = highlightedSender === sender;
                    const isDimmed = highlightedSender !== null && !isHighlighted;
                    const color = getMemberColor(si);
                    return (
                        <path key={sender} d={path} fill="none"
                            stroke={isHighlighted ? color : isDimmed ? '#f1f5f9' : '#e2e8f0'}
                            strokeWidth={isHighlighted ? 2 : 1.5} />
                    );
                })}
                {n <= 30 && highlightedSender && senders.map((sender, si) => {
                    if (sender !== highlightedSender) return null;
                    const color = getMemberColor(si);
                    return aggregatedDays.map((day, i) => {
                        const v = day.bySender[sender];
                        if (!v) return null;
                        return <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3} fill={color} stroke="white" strokeWidth={1.5} />;
                    });
                })}

                {/* Best fit — total */}
                <line
                    x1={xOf(0)} y1={yOf(clamp(totalReg.y0))}
                    x2={xOf(n - 1)} y2={yOf(clamp(totalReg.y1))}
                    stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3"
                />
                <text x={pad.left + innerW + 5} y={yOf(clamp(totalReg.y1))} dominantBaseline="middle" fontSize={9} fill="#f59e0b" fontWeight="700">
                    {Math.round(totalReg.y1)}
                </text>

                {/* Best fit — highlighted sender */}
                {senderReg && highlightedSender && (() => {
                    const color = getMemberColor(senders.indexOf(highlightedSender));
                    return (
                        <g>
                            <line
                                x1={xOf(0)} y1={yOf(clamp(senderReg.y0))}
                                x2={xOf(n - 1)} y2={yOf(clamp(senderReg.y1))}
                                stroke={color} strokeWidth={1.5} strokeDasharray="5 3"
                            />
                            <text x={pad.left + innerW + 5} y={yOf(clamp(senderReg.y1))} dominantBaseline="middle" fontSize={9} fill={color} fontWeight="700">
                                {senderReg.y1.toFixed(1)}
                            </text>
                        </g>
                    );
                })()}

                {/* Raw daily total */}
                {totalPath && (
                    <path d={totalPath} fill="none"
                        stroke={rollingAvgPath ? '#cbd5e1' : '#0f172a'}
                        strokeWidth={rollingAvgPath ? 1 : 2}
                        strokeLinecap="round" strokeLinejoin="round" />
                )}
                {/* 7-day rolling average */}
                {rollingAvgPath && (
                    <path d={rollingAvgPath} fill="none" stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                )}
                {n <= 30 && aggregatedDays.map((day, i) => (
                    <circle key={i} cx={xOf(i)} cy={yOf(day.total)} r={3} fill="#0f172a" />
                ))}
            </svg>

            <div className="flex flex-wrap gap-1.5 px-1">
                <button
                    onClick={() => onHighlight(null)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
                        highlightedSender === null
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                    }`}
                >
                    <span className="h-2 w-5 rounded-sm" style={{ backgroundColor: highlightedSender === null ? 'white' : '#0f172a' }} />
                    Total
                </button>
                {senders.map((sender, si) => {
                    const color = getMemberColor(si);
                    const isHighlighted = highlightedSender === sender;
                    return (
                        <button
                            key={sender}
                            onClick={() => onHighlight(isHighlighted ? null : sender)}
                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-all"
                            style={isHighlighted
                                ? { backgroundColor: color + '18', borderColor: color, color }
                                : { backgroundColor: 'white', borderColor: '#e2e8f0', color: '#94a3b8' }}
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isHighlighted ? color : '#e2e8f0' }} />
                            {sender}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function matchSenderToMember(sender: string, members: Member[]): Member | null {
    const s = sender.toLowerCase().trim();
    for (const m of members) {
        if (!m.name) continue;
        const name = m.name.toLowerCase().trim();
        if (s === name) return m;
        const sFirst = s.split(' ')[0];
        const mFirst = name.split(' ')[0];
        if (sFirst.length > 2 && mFirst.length > 2 && (s.includes(mFirst) || name.includes(sFirst))) return m;
    }
    return null;
}

function SenderReview({
    allSenders,
    members,
    initialMapping,
    onConfirm,
    onDelete,
}: {
    allSenders: string[];
    members: Member[];
    initialMapping: Record<string, string> | null;
    onConfirm: (mapping: Record<string, string>) => void;
    onDelete: (sender: string) => void;
}) {
    const [mapping, setMapping] = useState<Record<string, string>>(() => {
        if (initialMapping) return { ...initialMapping };
        const m: Record<string, string> = {};
        for (const sender of allSenders) {
            const matched = matchSenderToMember(sender, members);
            m[sender] = matched?.name ?? sender;
        }
        return m;
    });

    // Sync when a sender is deleted (allSenders shrinks)
    useEffect(() => {
        const set = new Set(allSenders);
        setMapping(m => {
            const next = { ...m };
            for (const k of Object.keys(next)) {
                if (!set.has(k)) delete next[k];
            }
            return next;
        });
    }, [allSenders]);

    const matched = allSenders.filter(s => matchSenderToMember(s, members) !== null);
    const unmatched = allSenders.filter(s => matchSenderToMember(s, members) === null);

    const renderRow = (sender: string) => (
        <div key={sender} className="flex items-center gap-3 px-4 py-2 bg-white hover:bg-slate-50/50 transition-colors">
            <span className="flex-1 text-xs font-semibold text-slate-800 truncate min-w-0">{sender}</span>
            <select
                value={mapping[sender] ?? sender}
                onChange={e => setMapping(m => ({ ...m, [sender]: e.target.value }))}
                className="text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-md px-2 py-1 bg-white outline-none focus:border-slate-400 min-w-0 max-w-[200px] truncate"
            >
                <option value={sender}>(keep original name)</option>
                {members.map(m => m.name && (
                    <option key={m.id} value={m.name}>{m.name}</option>
                ))}
            </select>
            <button
                onClick={() => onDelete(sender)}
                className="shrink-0 text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
                Delete
            </button>
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-bold text-slate-900">Review senders</div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        {allSenders.length} senders · map each to a member name or delete their messages entirely
                    </p>
                </div>
                <button
                    onClick={() => onConfirm(mapping)}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-700 transition-colors"
                >
                    Confirm
                </button>
            </div>

            {matched.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                        Likely members — {matched.length}
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                        {matched.map(renderRow)}
                    </div>
                </div>
            )}

            {unmatched.length > 0 && (
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                        No match found — {unmatched.length}
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                        {unmatched.map(renderRow)}
                    </div>
                </div>
            )}
        </div>
    );
}

const MEMBER_COLORS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6',
    '#8b5cf6', '#10b981', '#f97316', '#06b6d4', '#84cc16',
];
function getMemberColor(index: number) { return MEMBER_COLORS[index % MEMBER_COLORS.length]; }

function ParticipationChart({
    chartData,
    sortedMembers,
    highlightedMember,
    onHighlight,
}: {
    chartData: ChartPoint[];
    sortedMembers: Member[];
    highlightedMember: string | null;
    onHighlight: (id: string | null) => void;
}) {
    const VW = 900, VH = 280;
    const pad = { top: 24, right: 44, bottom: 52, left: 48 };
    const innerW = VW - pad.left - pad.right;
    const innerH = VH - pad.top - pad.bottom;
    const n = chartData.length;

    if (n === 0) return null;

    const xOf = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yOf = (pct: number) => pad.top + innerH - (pct / 100) * innerH;

    const toPath = (values: (number | null)[]) => {
        let d = '';
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v === null) continue;
            d += d === '' ? `M${xOf(i)},${yOf(v)}` : `L${xOf(i)},${yOf(v)}`;
        }
        return d;
    };

    const maxLabels = Math.floor(innerW / 56);
    const step = Math.max(1, Math.ceil(n / maxLabels));

    const groupValues = chartData.map(p => p.groupPct);
    const groupPath = toPath(groupValues);
    const validGroupValues = groupValues.filter((v): v is number => v !== null);
    const groupReg = validGroupValues.length >= 2 ? linearRegression(validGroupValues) : null;
    const clamp = (v: number) => Math.max(0, Math.min(100, v));

    // Per-member trend line when highlighted
    let memberRegLine: { x1: number; y1: number; x2: number; y2: number; color: string; endPct: number } | null = null;
    if (highlightedMember) {
        const mi = sortedMembers.findIndex(m => m.id === highlightedMember);
        if (mi >= 0) {
            const indexed = chartData
                .map((p, i) => ({ i, v: p.memberPcts[highlightedMember] ?? null }))
                .filter((pt): pt is { i: number; v: number } => pt.v !== null);
            if (indexed.length >= 2) {
                const reg = linearRegression(indexed.map(pt => pt.v));
                memberRegLine = {
                    x1: xOf(indexed[0].i),
                    y1: yOf(clamp(reg.y0)),
                    x2: xOf(indexed[indexed.length - 1].i),
                    y2: yOf(clamp(reg.y1)),
                    color: getMemberColor(mi),
                    endPct: reg.y1,
                };
            }
        }
    }

    return (
        <div className="space-y-3">
            <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: 280 }}>
                {/* Y grid */}
                {[0, 25, 50, 75, 100].map(pct => (
                    <g key={pct}>
                        <line
                            x1={pad.left} y1={yOf(pct)}
                            x2={pad.left + innerW} y2={yOf(pct)}
                            stroke={pct === 50 ? '#cbd5e1' : '#f1f5f9'}
                            strokeWidth={1}
                            strokeDasharray={pct === 50 ? '4 3' : undefined}
                        />
                        <text x={pad.left - 8} y={yOf(pct)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#94a3b8">
                            {pct}%
                        </text>
                    </g>
                ))}

                {/* X axis */}
                <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke="#e2e8f0" strokeWidth={1} />

                {/* X labels */}
                {chartData.map((point, i) => {
                    if (i % step !== 0 && i !== n - 1) return null;
                    return (
                        <text key={i} x={xOf(i)} y={pad.top + innerH + 16} textAnchor="middle" fontSize={9} fill="#94a3b8">
                            {formatShortDate(point.date)}
                        </text>
                    );
                })}

                {/* Member rolling-avg lines */}
                {sortedMembers.map((member, mi) => {
                    const isHighlighted = highlightedMember === member.id;
                    const isDimmed = highlightedMember !== null && !isHighlighted;
                    const path = toPath(chartData.map(p => p.memberPcts[member.id] ?? null));
                    if (!path) return null;
                    const color = getMemberColor(mi);
                    return (
                        <path
                            key={member.id}
                            d={path}
                            fill="none"
                            stroke={isHighlighted ? color : isDimmed ? '#f1f5f9' : '#dde3ea'}
                            strokeWidth={isHighlighted ? 2.5 : 1}
                        />
                    );
                })}

                {/* Dots for highlighted member */}
                {highlightedMember && sortedMembers.map((member, mi) => {
                    if (member.id !== highlightedMember) return null;
                    const color = getMemberColor(mi);
                    return chartData.map((point, i) => {
                        const v = point.memberPcts[member.id];
                        if (v === null) return null;
                        return <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3} fill={color} stroke="white" strokeWidth={1.5} />;
                    });
                })}

                {/* Group line */}
                {groupPath && (
                    <path d={groupPath} fill="none" stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                )}

                {/* Group dots */}
                {chartData.map((point, i) => {
                    if (point.groupPct === null) return null;
                    return <circle key={i} cx={xOf(i)} cy={yOf(point.groupPct)} r={3.5} fill="#0f172a" />;
                })}

                {/* Group best-fit trend line */}
                {groupReg && (
                    <>
                        <line
                            x1={xOf(0)} y1={yOf(clamp(groupReg.y0))}
                            x2={xOf(n - 1)} y2={yOf(clamp(groupReg.y1))}
                            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 3"
                        />
                        <text x={pad.left + innerW + 5} y={yOf(clamp(groupReg.y1))} dominantBaseline="middle" fontSize={9} fill="#f59e0b" fontWeight="700">
                            {Math.round(groupReg.y1)}%
                        </text>
                    </>
                )}

                {/* Member best-fit trend line */}
                {memberRegLine && (
                    <>
                        <line
                            x1={memberRegLine.x1} y1={memberRegLine.y1}
                            x2={memberRegLine.x2} y2={memberRegLine.y2}
                            stroke={memberRegLine.color} strokeWidth={1.5} strokeDasharray="5 3"
                        />
                        <text x={memberRegLine.x2 + 5} y={memberRegLine.y2} dominantBaseline="middle" fontSize={9} fill={memberRegLine.color} fontWeight="700">
                            {Math.round(memberRegLine.endPct)}%
                        </text>
                    </>
                )}
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap gap-1.5 px-1">
                <button
                    onClick={() => onHighlight(null)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
                        highlightedMember === null
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                    }`}
                >
                    <span className="h-2 w-5 rounded-sm" style={{ backgroundColor: highlightedMember === null ? 'white' : '#0f172a' }} />
                    Group avg
                </button>
                {sortedMembers.map((member, mi) => {
                    const color = getMemberColor(mi);
                    const isHighlighted = highlightedMember === member.id;
                    return (
                        <button
                            key={member.id}
                            onClick={() => onHighlight(isHighlighted ? null : member.id)}
                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold border transition-all"
                            style={isHighlighted
                                ? { backgroundColor: color + '18', borderColor: color, color }
                                : { backgroundColor: 'white', borderColor: '#e2e8f0', color: '#94a3b8' }
                            }
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isHighlighted ? color : '#e2e8f0' }} />
                            {member.name || 'Unnamed'}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// localStorage key for members hidden from the grid on this browser.
const EXCLUDED_KEY = 'attendance-excluded-members';

export default function AttendanceHistoryPage() {
    const [data, setData] = useState<AttendanceResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [updatingKey, setUpdatingKey] = useState<string | null>(null);
    const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
    const [editingMeetingDate, setEditingMeetingDate] = useState('');
    const [savingMeetingId, setSavingMeetingId] = useState<string | null>(null);
    const [pendingDeletedMeetings, setPendingDeletedMeetings] = useState<Record<string, Meeting>>({});
    const [activeCell, setActiveCell] = useState<string | null>(null);
    const [highlightedMember, setHighlightedMember] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatError, setChatError] = useState('');
    const [chatHighlightedSender, setChatHighlightedSender] = useState<string | null>(null);
    const [chatDragOver, setChatDragOver] = useState(false);
    const [chatSaved, setChatSaved] = useState(false);
    const [chatSaving, setChatSaving] = useState(false);
    const [chatDeleting, setChatDeleting] = useState(false);
    const [senderMapping, setSenderMapping] = useState<Record<string, string> | null>(null);
    const [showSenderReview, setShowSenderReview] = useState(false);
    const [matchRounds, setMatchRounds] = useState<MatchRoundStub[]>([]);
    const [matchHighlightedMember, setMatchHighlightedMember] = useState<string | null>(null);
    const [excludedMemberIds, setExcludedMemberIds] = useState<Set<string>>(new Set());
    const [showExcludePanel, setShowExcludePanel] = useState(false);
    const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const fetchData = async (date = selectedDate) => {
        setLoading(true);
        setError('');
        try {
            const p = new URLSearchParams();
            if (date) p.set('date', date);
            const res = await fetch(`/api/admin/attendance?${p}`);
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Failed to load');
            setData(d);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sortedMembers = useMemo(() => {
        if (!data?.members) return [];
        return [...data.members].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    }, [data]);

    const sortedMeetings = useMemo(() => {
        if (!data?.meetings) return [];
        return [...data.meetings]
            .filter(meeting => !pendingDeletedMeetings[meeting.id])
            .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    }, [data, pendingDeletedMeetings]);

    const historyByMemberMeeting = useMemo(() => {
        const map = new Map<string, AttendanceRow>();
        for (const row of data?.history ?? []) map.set(`${row.member_id}:${row.meeting_id}`, row);
        return map;
    }, [data]);

    const meetingParticipation = useMemo(() => {
        const map = new Map<string, { present: number; total: number }>();
        for (const meeting of sortedMeetings) {
            let present = 0, total = 0;
            for (const member of sortedMembers) {
                const row = historyByMemberMeeting.get(`${member.id}:${meeting.id}`);
                if (row) { total++; if (row.present) present++; }
            }
            map.set(meeting.id, { present, total });
        }
        return map;
    }, [sortedMeetings, sortedMembers, historyByMemberMeeting]);

    const memberParticipation = useMemo(() => {
        const map = new Map<string, { present: number; total: number }>();
        for (const member of sortedMembers) {
            let present = 0, total = 0;
            for (const meeting of sortedMeetings) {
                const row = historyByMemberMeeting.get(`${member.id}:${meeting.id}`);
                if (row) { total++; if (row.present) present++; }
            }
            map.set(member.id, { present, total });
        }
        return map;
    }, [sortedMeetings, sortedMembers, historyByMemberMeeting]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(EXCLUDED_KEY);
            if (stored) setExcludedMemberIds(new Set(JSON.parse(stored)));
        } catch {}
    }, []);

    const toggleExclude = (memberId: string) => {
        setExcludedMemberIds(prev => {
            const next = new Set(prev);
            if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
            try { localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next])); } catch {}
            return next;
        });
    };

    const visibleMembers = useMemo(
        () => sortedMembers.filter(m => !excludedMemberIds.has(m.id)),
        [sortedMembers, excludedMemberIds]
    );

    const chartData = useMemo<ChartPoint[]>(() => {
        const chronological = [...sortedMeetings].reverse(); // oldest → newest
        return chronological.map((meeting, i) => {
            // Per-meeting group % — only visible (non-excluded) members
            let totalPresent = 0, totalRecords = 0;
            for (const member of visibleMembers) {
                const row = historyByMemberMeeting.get(`${member.id}:${meeting.id}`);
                if (row) { totalRecords++; if (row.present) totalPresent++; }
            }
            // 4-meeting rolling average per visible member
            const window = chronological.slice(Math.max(0, i - 3), i + 1);
            const memberPcts: Record<string, number | null> = {};
            for (const member of visibleMembers) {
                let present = 0, records = 0;
                for (const m of window) {
                    const row = historyByMemberMeeting.get(`${member.id}:${m.id}`);
                    if (row) { records++; if (row.present) present++; }
                }
                memberPcts[member.id] = records > 0 ? (present / records) * 100 : null;
            }
            return {
                date: meeting.meeting_date,
                groupPct: totalRecords > 0 ? (totalPresent / totalRecords) * 100 : null,
                memberPcts,
            };
        });
    }, [sortedMeetings, visibleMembers, historyByMemberMeeting]);

    const allSenders = useMemo(() => {
        const set = new Set<string>();
        for (const { sender } of chatMessages) set.add(sender);
        return [...set];
    }, [chatMessages]);

    const chatAnalysis = useMemo(() => {
        if (chatMessages.length === 0) return null;
        const dayMap = new Map<string, { total: number; bySender: Record<string, number> }>();
        const senderTotals: Record<string, number> = {};
        for (const { date, sender } of chatMessages) {
            const displayName = senderMapping ? (senderMapping[sender] ?? sender) : sender;
            if (!dayMap.has(date)) dayMap.set(date, { total: 0, bySender: {} });
            const day = dayMap.get(date)!;
            day.total++;
            day.bySender[displayName] = (day.bySender[displayName] ?? 0) + 1;
            senderTotals[displayName] = (senderTotals[displayName] ?? 0) + 1;
        }
        const days: ChatDayData[] = [...dayMap.keys()].sort().map(date => ({
            date,
            total: dayMap.get(date)!.total,
            bySender: dayMap.get(date)!.bySender,
        }));
        const senders = Object.keys(senderTotals).sort((a, b) => senderTotals[b] - senderTotals[a]);
        const totalMessages = Object.values(senderTotals).reduce((s, v) => s + v, 0);
        return { days, senders, totalMessages, senderTotals };
    }, [chatMessages, senderMapping]);

    const handleChatFile = (file: File) => {
        setChatError('');
        setChatSaved(false);
        setSenderMapping(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const messages = parseWhatsAppChat(text);
            if (messages.length === 0) {
                setChatError('No messages found. Make sure this is a WhatsApp chat export (.txt).');
                return;
            }
            setChatMessages(messages);
            setChatHighlightedSender(null);
            setShowSenderReview(true);
        };
        reader.onerror = () => setChatError('Failed to read the file.');
        reader.readAsText(file, 'UTF-8');
    };

    const handleDeleteSender = (sender: string) => {
        const newMessages = chatMessages.filter(m => m.sender !== sender);
        const newMapping = senderMapping ? { ...senderMapping } : null;
        if (newMapping) delete newMapping[sender];
        setChatMessages(newMessages);
        setSenderMapping(newMapping);
        saveChatAnalysis(newMessages, newMapping);
    };

    const saveChatAnalysis = async (msgs: ChatMessage[] = chatMessages, mapping: Record<string, string> | null = senderMapping) => {
        setChatSaving(true);
        setChatError('');
        try {
            const res = await fetch('/api/admin/attendance/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: msgs, mapping }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setChatSaved(true);
        } catch {
            setChatError('Failed to save chat analysis.');
        } finally {
            setChatSaving(false);
        }
    };

    const deleteChatAnalysis = async () => {
        setChatDeleting(true);
        setChatError('');
        try {
            const res = await fetch('/api/admin/attendance/chat', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setChatMessages([]);
            setChatSaved(false);
            setChatHighlightedSender(null);
            setSenderMapping(null);
            setShowSenderReview(false);
        } catch {
            setChatError('Failed to delete chat analysis.');
        } finally {
            setChatDeleting(false);
        }
    };

    useEffect(() => {
        fetch('/api/admin/attendance/chat')
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!data) return;
                if (Array.isArray(data)) {
                    // legacy format
                    setChatMessages(data);
                } else if (data.messages) {
                    setChatMessages(data.messages);
                    if (data.mapping) setSenderMapping(data.mapping);
                    setChatSaved(true);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        fetch('/api/admin/matches')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (Array.isArray(data)) setMatchRounds(data); })
            .catch(() => {});
    }, []);

    const matchChartData = useMemo<ChartPoint[]>(() => {
        if (!matchRounds.length || !sortedMembers.length) return [];

        const chronological = [...matchRounds]
            .filter(r => r.status !== 'open')
            .sort((a, b) => a.week_of.localeCompare(b.week_of));
        if (!chronological.length) return [];

        const participatedEmails = (round: MatchRoundStub): Set<string> => {
            const s = new Set<string>();
            for (const r of round.responses) {
                if (r.member?.email && r.opted_in === true) s.add(r.member.email);
            }
            for (const m of round.matches) {
                if (m.member1?.email) s.add(m.member1.email);
                if (m.member2?.email) s.add(m.member2.email);
            }
            return s;
        };

        // A member has history if they have any attendance record OR appeared in any match round.
        // Members with zero history anywhere are genuinely new — exclude them entirely.
        const memberHasHistory = new Map<string, boolean>();
        for (const member of visibleMembers) {
            const hasAttendance = sortedMeetings.some(
                meeting => historyByMemberMeeting.has(`${member.id}:${meeting.id}`)
            );
            const hasMatchHistory = chronological.some(
                round => member.email && participatedEmails(round).has(member.email)
            );
            memberHasHistory.set(member.id, hasAttendance || hasMatchHistory);
        }

        const activeMembers = visibleMembers.filter(m => memberHasHistory.get(m.id));

        return chronological.map((round, i) => {
            const participated = participatedEmails(round);
            const optedIn = activeMembers.filter(m => m.email && participated.has(m.email)).length;
            const groupPct = activeMembers.length > 0 ? (optedIn / activeMembers.length) * 100 : null;

            const window = chronological.slice(Math.max(0, i - 3), i + 1);
            const memberPcts: Record<string, number | null> = {};
            for (const member of visibleMembers) {
                if (!memberHasHistory.get(member.id)) {
                    memberPcts[member.id] = null;
                    continue;
                }
                let count = 0, total = 0;
                for (const r of window) {
                    count += member.email && participatedEmails(r).has(member.email) ? 1 : 0;
                    total++;
                }
                memberPcts[member.id] = total > 0 ? (count / total) * 100 : null;
            }

            return { date: round.week_of, groupPct, memberPcts };
        });
    }, [matchRounds, visibleMembers, sortedMeetings, sortedMembers.length, historyByMemberMeeting]);

    const toggleCell = async (member: Member, meeting: Meeting, nextPresent: boolean | null) => {
        const key = `${member.id}:${meeting.id}`;
        if (updatingKey) return;
        setActiveCell(null);

        const previous = data;
        setUpdatingKey(key);

        setData(current => {
            if (!current) return current;
            if (nextPresent === null) {
                return {
                    ...current,
                    history: current.history.filter(r => !(r.member_id === member.id && r.meeting_id === meeting.id)),
                };
            }
            const existing = current.history.find(r => r.member_id === member.id && r.meeting_id === meeting.id);
            const nextRow: AttendanceRow = {
                member_id: member.id,
                meeting_id: meeting.id,
                present: nextPresent,
                matched_text: existing?.matched_text ?? null,
                match_score: existing?.match_score ?? null,
                match_strategy: existing?.match_strategy ?? null,
                manually_adjusted: true,
            };
            return {
                ...current,
                history: existing
                    ? current.history.map(r => r.member_id === member.id && r.meeting_id === meeting.id ? nextRow : r)
                    : [...current.history, nextRow],
            };
        });

        try {
            const res = await fetch(`/api/admin/attendance/${member.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingId: meeting.id, present: nextPresent }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Update failed');
        } catch (err) {
            setData(previous);
            setError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setUpdatingKey(null);
        }
    };

    const startEditingMeeting = (meeting: Meeting) => {
        setError('');
        setEditingMeetingId(meeting.id);
        setEditingMeetingDate(meeting.meeting_date);
    };

    const cancelEditingMeeting = () => {
        setEditingMeetingId(null);
        setEditingMeetingDate('');
    };

    const saveMeetingDate = async (meeting: Meeting) => {
        if (!editingMeetingDate || savingMeetingId) return;
        setSavingMeetingId(meeting.id);
        setError('');
        try {
            const res = await fetch('/api/admin/attendance', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingId: meeting.id, meetingDate: editingMeetingDate }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to update meeting date');
            const nextSelectedDate = selectedDate === meeting.meeting_date ? editingMeetingDate : selectedDate;
            setSelectedDate(nextSelectedDate);
            cancelEditingMeeting();
            await fetchData(nextSelectedDate);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update meeting date');
        } finally {
            setSavingMeetingId(null);
        }
    };

    const permanentlyDeleteMeeting = async (meeting: Meeting) => {
        setSavingMeetingId(meeting.id);
        setError('');
        try {
            const res = await fetch(`/api/admin/attendance?meetingId=${encodeURIComponent(meeting.id)}`, { method: 'DELETE' });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to delete meeting');
            setPendingDeletedMeetings(prev => {
                const next = { ...prev };
                delete next[meeting.id];
                return next;
            });
            await fetchData(selectedDate === meeting.meeting_date ? '' : selectedDate);
        } catch (err) {
            setPendingDeletedMeetings(prev => {
                const next = { ...prev };
                delete next[meeting.id];
                return next;
            });
            setError(err instanceof Error ? err.message : 'Failed to delete meeting');
        } finally {
            deleteTimers.current.delete(meeting.id);
            setSavingMeetingId(null);
        }
    };

    const undoDeleteMeeting = (meetingId: string) => {
        const timer = deleteTimers.current.get(meetingId);
        if (timer) clearTimeout(timer);
        deleteTimers.current.delete(meetingId);
        setPendingDeletedMeetings(prev => {
            const next = { ...prev };
            delete next[meetingId];
            return next;
        });
    };

    const deleteMeeting = (meeting: Meeting) => {
        if (savingMeetingId) return;
        const ok = window.confirm(`Delete attendance for ${formatDate(meeting.meeting_date)}? This removes all records for that meeting.`);
        if (!ok) return;
        if (editingMeetingId === meeting.id) cancelEditingMeeting();
        if (selectedDate === meeting.meeting_date) setSelectedDate('');
        setPendingDeletedMeetings(prev => ({ ...prev, [meeting.id]: meeting }));
        const existingTimer = deleteTimers.current.get(meeting.id);
        if (existingTimer) clearTimeout(existingTimer);
        deleteTimers.current.set(meeting.id, setTimeout(() => {
            void permanentlyDeleteMeeting(meeting);
        }, 10000));
    };

    const pendingDeletedList = Object.values(pendingDeletedMeetings);

    return (
        <div className="min-h-screen bg-cream">

            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-slate-200 bg-white">
                <div className="px-6 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/attendance" className="text-slate-400 hover:text-slate-700 transition-colors">
                            <ArrowLeftIcon className="w-4 h-4" />
                        </Link>
                        <div className="h-4 w-px bg-slate-200" />
                        <h1 className="text-sm font-bold text-slate-900">Attendance history</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                            <CalendarDaysIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <select
                                value={selectedDate}
                                onChange={e => {
                                    const v = e.target.value;
                                    setSelectedDate(v);
                                    fetchData(v);
                                }}
                                className="bg-transparent text-xs font-semibold text-slate-700 outline-none"
                            >
                                <option value="">All meetings</option>
                                {data?.meetings.map(m => (
                                    <option key={m.id} value={m.meeting_date}>{formatDate(m.meeting_date)}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => fetchData()}
                            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>

                        <Link
                            href="/admin/attendance/upload"
                            className="flex items-center gap-1.5 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
                        >
                            <CloudArrowUpIcon className="w-3.5 h-3.5" />
                            Record
                        </Link>
                    </div>
                </div>
            </div>

            {error && (
                <div className="px-6 pt-4">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                </div>
            )}

            {pendingDeletedList.length > 0 && (
                <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
                    {pendingDeletedList.map(meeting => (
                        <div
                            key={meeting.id}
                            className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-900/10"
                        >
                            <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900">Attendance column queued for deletion</div>
                                <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{formatDate(meeting.meeting_date)}</div>
                            </div>
                            <button
                                onClick={() => undoDeleteMeeting(meeting.id)}
                                className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                Undo
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <main className="px-6 py-6">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Attendance history</div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                {data?.meetings.length
                                    ? `${data.meetings.length} meetings · ${sortedMembers.length} members`
                                    : 'No meetings recorded yet.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
                                Present
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                                Absent
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />
                                No record
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50/80">
                                    <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 min-w-52">Member</th>
                                    <th
                                        className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 min-w-16"
                                        title="Consecutive meetings missed"
                                    >
                                        Misses
                                    </th>
                                    <th
                                        className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 min-w-16"
                                        title="Overall attendance rate"
                                    >
                                        Rate
                                    </th>
                                    {sortedMeetings.map(meeting => {
                                        const mp = meetingParticipation.get(meeting.id);
                                        const pct = mp && mp.total > 0 ? Math.round((mp.present / mp.total) * 100) : null;
                                        const isEditingMeeting = editingMeetingId === meeting.id;
                                        const isSavingMeeting = savingMeetingId === meeting.id;
                                        return (
                                            <th
                                                key={meeting.id}
                                                className={`px-2 py-3 text-center text-[10px] font-bold min-w-[88px] ${
                                                    meeting.id === data?.selectedMeeting?.id
                                                        ? 'bg-amber-50 text-amber-600'
                                                        : 'text-slate-400'
                                                }`}
                                            >
                                                {isEditingMeeting ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <input
                                                            type="date"
                                                            value={editingMeetingDate}
                                                            onChange={e => setEditingMeetingDate(e.target.value)}
                                                            className="w-[84px] rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-slate-400"
                                                            disabled={isSavingMeeting}
                                                        />
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => saveMeetingDate(meeting)}
                                                                disabled={isSavingMeeting}
                                                                className="rounded border border-emerald-200 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                                                title="Save date"
                                                            >
                                                                <CheckIcon className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                onClick={cancelEditingMeeting}
                                                                disabled={isSavingMeeting}
                                                                className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                                                                title="Cancel"
                                                            >
                                                                <XMarkIcon className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div>{formatShortDate(meeting.meeting_date)}</div>
                                                        {pct !== null && (
                                                            <div className={`text-[9px] font-bold mt-0.5 ${
                                                                meeting.id === data?.selectedMeeting?.id ? 'text-amber-500' : 'text-slate-300'
                                                            }`}>
                                                                {pct}%
                                                            </div>
                                                        )}
                                                        <div className="mt-1 flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => startEditingMeeting(meeting)}
                                                                disabled={isSavingMeeting}
                                                                className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                                title="Edit meeting date"
                                                            >
                                                                <PencilIcon className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteMeeting(meeting)}
                                                                disabled={isSavingMeeting}
                                                                className="rounded border border-red-100 bg-white p-1 text-red-300 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                title="Delete meeting"
                                                            >
                                                                {isSavingMeeting ? <ArrowPathIcon className="h-3 w-3 animate-spin" /> : <TrashIcon className="h-3 w-3" />}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && (
                                    <tr>
                                        <td colSpan={sortedMeetings.length + 3} className="px-5 py-10 text-center text-sm text-slate-400">
                                            Loading…
                                        </td>
                                    </tr>
                                )}
                                {!loading && sortedMembers.map(member => {
                                    const missCount = data?.streaks[member.id] ?? 0;
                                    return (
                                        <tr key={member.id} className="bg-white hover:bg-slate-50/40">
                                            <td className="sticky left-0 z-10 bg-inherit px-5 py-1.5">
                                                <div className="font-semibold text-slate-900 text-xs leading-tight">{member.name || 'Unnamed'}</div>
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                <span className={`text-sm font-bold ${
                                                    missCount >= 3
                                                        ? 'text-red-600'
                                                        : missCount >= 1
                                                            ? 'text-amber-600'
                                                            : 'text-slate-300'
                                                }`}>
                                                    {missCount}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                {(() => {
                                                    const mp = memberParticipation.get(member.id);
                                                    if (!mp || mp.total === 0) return <span className="text-xs text-slate-300">–</span>;
                                                    const pct = Math.round((mp.present / mp.total) * 100);
                                                    return (
                                                        <span className={`text-xs font-bold ${
                                                            pct >= 80 ? 'text-emerald-600' :
                                                            pct >= 50 ? 'text-amber-600' :
                                                            'text-red-600'
                                                        }`}>
                                                            {pct}%
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            {sortedMeetings.map(meeting => {
                                                const key = `${member.id}:${meeting.id}`;
                                                const row = historyByMemberMeeting.get(key);
                                                const isSelected = meeting.id === data?.selectedMeeting?.id;
                                                return (
                                                    <td key={meeting.id} className={`px-2 py-1.5 text-center ${isSelected ? 'bg-amber-50/30' : ''}`}>
                                                        <HistoryCell
                                                            row={row}
                                                            isActive={activeCell === key}
                                                            isUpdating={updatingKey === key}
                                                            onActivate={() => setActiveCell(activeCell === key ? null : key)}
                                                            onSelect={(present) => toggleCell(member, meeting, present)}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                                {!loading && sortedMembers.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-5 py-10 text-center text-sm text-slate-400">
                                            No onboarded members yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Chart member filter */}
                {!loading && sortedMembers.length > 0 && (
                    <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <button
                            onClick={() => setShowExcludePanel(v => !v)}
                            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Chart members</div>
                                {excludedMemberIds.size > 0 && (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                        {excludedMemberIds.size} excluded
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] text-slate-400">{showExcludePanel ? '▲' : '▼'}</span>
                        </button>
                        {showExcludePanel && (
                            <div className="border-t border-slate-100 px-5 py-4">
                                <p className="text-[11px] text-slate-400 mb-3">Excluded members are removed from group averages and chart lines in both charts below.</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {sortedMembers.map(member => {
                                        const excluded = excludedMemberIds.has(member.id);
                                        return (
                                            <button
                                                key={member.id}
                                                onClick={() => toggleExclude(member.id)}
                                                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border transition-all ${
                                                    excluded
                                                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                                                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                                                }`}
                                            >
                                                {excluded ? '✕' : '✓'} {member.name || 'Unnamed'}
                                            </button>
                                        );
                                    })}
                                </div>
                                {excludedMemberIds.size > 0 && (
                                    <button
                                        onClick={() => {
                                            setExcludedMemberIds(new Set());
                                            try { localStorage.removeItem(EXCLUDED_KEY); } catch {}
                                        }}
                                        className="mt-3 text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
                                    >
                                        Reset — include all
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Participation trend chart */}
                {!loading && chartData.length > 0 && (
                    <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Participation trend</div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Group: per-meeting rate · Members: 4-meeting rolling average — click a name to highlight
                            </p>
                        </div>
                        <div className="px-5 py-5">
                            <ParticipationChart
                                chartData={chartData}
                                sortedMembers={visibleMembers}
                                highlightedMember={highlightedMember}
                                onHighlight={setHighlightedMember}
                            />
                        </div>
                    </div>
                )}

                {/* 1:1 match participation */}
                {!loading && matchChartData.length > 0 && (
                    <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">1:1 Match Participation</div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Opt-in rate per round — group rate and 4-round rolling average per member
                            </p>
                        </div>
                        <div className="px-5 py-5">
                            <ParticipationChart
                                chartData={matchChartData}
                                sortedMembers={sortedMembers}
                                highlightedMember={matchHighlightedMember}
                                onHighlight={setMatchHighlightedMember}
                            />
                        </div>
                    </div>
                )}

                {/* WhatsApp chat analysis */}
                <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">WhatsApp chat analysis</div>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Upload a chat export to see message activity by day and member
                            </p>
                        </div>
                        {chatMessages.length > 0 && (
                            <div className="flex items-center gap-3">
                                {!showSenderReview && (
                                    <button
                                        onClick={() => setShowSenderReview(true)}
                                        className="text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
                                    >
                                        Review senders
                                    </button>
                                )}
                                {chatSaved ? (
                                    <>
                                        <span className="text-[10px] font-bold text-emerald-600">Saved</span>
                                        <button
                                            onClick={deleteChatAnalysis}
                                            disabled={chatDeleting}
                                            className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                        >
                                            {chatDeleting ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => saveChatAnalysis()}
                                            disabled={chatSaving || showSenderReview}
                                            className="text-[10px] font-bold text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50"
                                        >
                                            {chatSaving ? 'Saving…' : 'Save'}
                                        </button>
                                        <button
                                            onClick={() => { setChatMessages([]); setChatError(''); setSenderMapping(null); setShowSenderReview(false); }}
                                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {showSenderReview && chatMessages.length > 0 ? (
                        <div className="p-5">
                            <SenderReview
                                allSenders={allSenders}
                                members={sortedMembers}
                                initialMapping={senderMapping}
                                onConfirm={(mapping) => {
                                    setSenderMapping(mapping);
                                    setShowSenderReview(false);
                                    saveChatAnalysis(chatMessages, mapping);
                                }}
                                onDelete={handleDeleteSender}
                            />
                        </div>
                    ) : !chatAnalysis ? (
                        <div className="p-5">
                            <div
                                onDragOver={(e) => { e.preventDefault(); setChatDragOver(true); }}
                                onDragLeave={() => setChatDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setChatDragOver(false);
                                    const f = e.dataTransfer.files[0];
                                    if (f) handleChatFile(f);
                                }}
                                className={`rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
                                    chatDragOver ? 'border-slate-400 bg-slate-50' : 'border-slate-200'
                                }`}
                            >
                                <input
                                    type="file"
                                    accept=".txt"
                                    id="chat-file-input"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleChatFile(f);
                                        e.target.value = '';
                                    }}
                                />
                                <div className="text-xs text-slate-400">
                                    <label htmlFor="chat-file-input" className="cursor-pointer font-semibold text-slate-700 hover:text-slate-900 transition-colors">
                                        Choose a file
                                    </label>
                                    {' '}or drag &amp; drop
                                </div>
                                <div className="mt-1.5 text-[10px] text-slate-400">
                                    WhatsApp chat export · .txt · Export without media
                                </div>
                                {chatError && (
                                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-red-600">
                                        <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                                        {chatError}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 space-y-6">
                            {/* Summary stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Messages', value: chatAnalysis.totalMessages.toLocaleString() },
                                    { label: 'Active days', value: chatAnalysis.days.length },
                                    { label: 'Members', value: chatAnalysis.senders.length },
                                    { label: 'Avg / day', value: Math.round(chatAnalysis.totalMessages / chatAnalysis.days.length) },
                                ].map(stat => (
                                    <div key={stat.label} className="rounded-lg bg-slate-50 px-4 py-3">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</div>
                                        <div className="mt-1 text-xl font-bold text-slate-900">{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Trend chart */}
                            <ChatTrendChart
                                days={chatAnalysis.days}
                                senders={chatAnalysis.senders}
                                highlightedSender={chatHighlightedSender}
                                onHighlight={setChatHighlightedSender}
                            />

                            {/* Sender breakdown */}
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Breakdown by member</div>
                                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
                                    {chatAnalysis.senders.map((sender, si) => {
                                        const total = chatAnalysis.senderTotals[sender];
                                        const pct = Math.round((total / chatAnalysis.totalMessages) * 100);
                                        const color = getMemberColor(si);
                                        return (
                                            <div key={sender} className="flex items-center gap-4 px-4 py-2.5 bg-white hover:bg-slate-50/60 transition-colors">
                                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{sender}</span>
                                                <span className="text-xs font-bold text-slate-700 w-16 text-right">{total.toLocaleString()}</span>
                                                <div className="flex items-center gap-2 w-28">
                                                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{pct}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
