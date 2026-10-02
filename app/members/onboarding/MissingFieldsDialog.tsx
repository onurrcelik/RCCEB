'use client';

import { useEffect } from 'react';
import { ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Shown when Continue is pressed with required fields still empty: one line per field,
// instead of a long red sentence under the button.
export function MissingFieldsDialog({ fields, onClose }: {
    fields: string[];
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="missing-fields-title"
                onClick={e => e.stopPropagation()}
                className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-zinc-700 bg-zinc-900 p-6 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
                <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors">
                    <XMarkIcon className="w-5 h-5" />
                </button>

                <div className="w-11 h-11 rounded-2xl bg-gold-400/15 flex items-center justify-center mb-5">
                    <ExclamationCircleIcon className="w-6 h-6 text-gold-300" />
                </div>
                <h2 id="missing-fields-title" className="text-xl font-bold text-white pr-8">
                    {fields.length === 1 ? 'One thing left' : `${fields.length} things left`}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Fill these in to continue:
                </p>

                <ul className="mt-5 space-y-2">
                    {fields.map(field => (
                        <li key={field} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-white">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                            {field}
                        </li>
                    ))}
                </ul>

                <button
                    onClick={onClose}
                    autoFocus
                    className="mt-6 w-full rounded-xl bg-gold-400 py-3.5 text-sm font-bold text-zinc-950 hover:bg-gold-300 transition-colors"
                >
                    Got it
                </button>
            </div>
        </div>
    );
}
