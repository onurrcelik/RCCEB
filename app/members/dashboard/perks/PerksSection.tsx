'use client';

import { useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { PERKS, type Perk } from './perks-data';

function InterestToggle({ perkId, interested, onChange }: { perkId: string; interested: boolean; onChange: (next: boolean) => void }) {
    const [saving, setSaving] = useState(false);

    async function toggle() {
        const next = !interested;
        onChange(next);
        setSaving(true);
        try {
            const res = await fetch('/api/members/perks/interest', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ perkId, interested: next }),
            });
            if (!res.ok) throw new Error('save failed');
        } catch {
            onChange(!next);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <div>
                <div className="text-sm font-medium text-white">I&apos;m interested</div>
                <div className="mt-0.5 text-xs text-zinc-400">We&apos;ll personally introduce you.</div>
            </div>
            <button
                onClick={toggle}
                disabled={saving}
                aria-pressed={interested}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${interested ? 'bg-gold-400' : 'bg-zinc-700'}`}
            >
                <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${interested ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}

export function PerksSection() {
    const [activePerk, setActivePerk] = useState<Perk | null>(null);
    const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        let active = true;
        fetch('/api/members/perks/interest', { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (active && Array.isArray(data?.perkIds)) setInterestedIds(new Set(data.perkIds)); })
            .catch(() => {});
        return () => { active = false; };
    }, []);

    function setInterest(perkId: string, next: boolean) {
        setInterestedIds(prev => {
            const updated = new Set(prev);
            if (next) updated.add(perkId); else updated.delete(perkId);
            return updated;
        });
    }

    if (PERKS.length === 0) {
        return (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/55 px-6 py-10 text-center">
                <p className="text-sm font-medium text-zinc-200">Member perks are on the way.</p>
                <p className="mt-1 text-xs text-zinc-500">Partner offers for RCCEB members will appear here.</p>
            </div>
        );
    }

    return (
        <>
            <div className="overflow-hidden rounded-2xl">
                {PERKS.map(perk => (
                    <button
                        key={perk.id}
                        onClick={() => setActivePerk(perk)}
                        className="flex w-full items-center gap-3 border-x border-b border-zinc-800 bg-zinc-900/55 px-4 py-4 text-left transition-colors first:rounded-t-2xl first:border-t last:rounded-b-2xl hover:bg-zinc-900/85 sm:gap-4 sm:px-5"
                    >
                        <div className="flex h-11 w-20 shrink-0 items-center justify-center rounded-lg bg-black/40 px-2">
                            <img src={perk.logoSrc} alt={perk.name} className="max-h-5 max-w-full object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-white sm:text-[15px]">{perk.name}</h3>
                                <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">{perk.tag}</span>
                            </div>
                            <div className="mt-1 truncate text-xs font-semibold text-gold-300">{perk.offer}</div>
                        </div>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600" />
                    </button>
                ))}
            </div>

            {activePerk && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setActivePerk(null)}>
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    <div
                        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="relative shrink-0 border-b border-zinc-700 p-6 pb-5">
                            <button
                                onClick={() => setActivePerk(null)}
                                className="absolute top-4 right-4 text-zinc-400 transition-colors hover:text-white"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-lg bg-black/40 px-2">
                                    <img src={activePerk.logoSrc} alt={activePerk.name} className="max-h-6 max-w-full object-contain" />
                                </div>
                                <div>
                                    <a
                                        href={activePerk.website}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group flex items-center gap-1.5 text-lg font-bold text-white hover:text-gold-300"
                                    >
                                        {activePerk.name}
                                        <img src={activePerk.countryFlagSrc} alt={activePerk.countryLabel} title={activePerk.countryLabel} className="h-3 w-4 rounded-[2px] object-cover" />
                                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-gold-300" />
                                    </a>
                                    <p className="mt-0.5 text-xs text-zinc-400">{activePerk.tagline}</p>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-6">
                            <div className="rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-3">
                                <div className="text-sm font-semibold text-white">{activePerk.offer}</div>
                                <div className="mt-1 text-xs text-zinc-400">{activePerk.comparison}</div>
                            </div>

                            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{activePerk.details}</p>

                            <div className="mt-4">
                                <InterestToggle
                                    perkId={activePerk.id}
                                    interested={interestedIds.has(activePerk.id)}
                                    onChange={next => setInterest(activePerk.id, next)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
