'use client';

import { EXPERTISE_OPTIONS } from '@/app/lib/categories';

export function ExpertisePicker({
    selected,
    onChange,
}: {
    selected: string[];
    onChange: (next: string[]) => void;
}) {
    function toggle(option: string) {
        onChange(selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option]);
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXPERTISE_OPTIONS.map(option => {
                const on = selected.includes(option);
                return (
                    <button
                        key={option}
                        type="button"
                        onClick={() => toggle(option)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                            on
                                ? 'border-gold-400 bg-gold-400/15 text-white'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                        }`}
                    >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-gold-400 bg-gold-400' : 'border-zinc-500'}`}>
                            {on && <span className="h-2 w-2 rounded-sm bg-zinc-950" />}
                        </span>
                        {option}
                    </button>
                );
            })}
        </div>
    );
}
