'use client';

import { useState } from 'react';
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardDocumentIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Offered when the member opens onboarding: draft the profile with the ChatGPT that
// already knows them, or fill it in by hand. Shown once on arrival (not on a timer, which
// would land mid-typing); the form keeps a link to bring it back.
export function ChatGptPromptDialog({ prompt, onClose }: { prompt: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(prompt);
        } catch {
            // Clipboard can be blocked (older browsers, some in-app webviews): show the text
            // so it can be selected by hand instead.
            setShowPrompt(true);
            return;
        }
        setCopied(true);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="chatgpt-prompt-title"
                onClick={e => e.stopPropagation()}
                className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-zinc-700 bg-zinc-900 p-6 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
                <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors">
                    <XMarkIcon className="w-5 h-5" />
                </button>

                <div className="w-11 h-11 rounded-2xl bg-gold-400/15 flex items-center justify-center mb-5">
                    <SparklesIcon className="w-6 h-6 text-gold-300" />
                </div>
                <h2 id="chatgpt-prompt-title" className="text-xl font-bold text-white pr-8">Let ChatGPT draft your profile</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Your ChatGPT already knows a lot about you. We wrote a prompt, with your name, class year and city already in it, that asks for exactly what this page needs.
                </p>
                <ol className="mt-4 space-y-1.5 text-sm text-zinc-400">
                    <li><span className="text-gold-300 font-semibold">1.</span> Copy the prompt and paste it into ChatGPT.</li>
                    <li><span className="text-gold-300 font-semibold">2.</span> Answer anything it asks.</li>
                    <li><span className="text-gold-300 font-semibold">3.</span> Paste each answer into its field here.</li>
                </ol>

                <div className="mt-6 space-y-3">
                    <button
                        onClick={copy}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold-400 py-3.5 text-sm font-bold text-zinc-950 hover:bg-gold-300 transition-colors shadow-[0_8px_24px_rgba(201,168,106,0.25)]"
                    >
                        {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                        {copied ? 'Copied. Now paste it into ChatGPT' : 'Copy my ChatGPT prompt'}
                    </button>
                    {copied && (
                        <a
                            href="https://chatgpt.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 rounded-xl border border-gold-400/40 py-3 text-sm font-semibold text-gold-200 hover:bg-gold-400/10 transition-colors"
                        >
                            Open ChatGPT
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        </a>
                    )}
                    <button onClick={onClose} className="w-full rounded-xl py-3 text-sm font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                        {copied ? 'Back to the form' : "I'll fill it in myself"}
                    </button>
                </div>

                <button onClick={() => setShowPrompt(s => !s)} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4">
                    {showPrompt ? 'Hide the prompt' : 'See the prompt'}
                </button>
                {showPrompt && (
                    <textarea
                        readOnly
                        value={prompt}
                        onFocus={e => e.currentTarget.select()}
                        className="mt-3 w-full h-56 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300 focus:outline-none focus:border-gold-400/50"
                    />
                )}
            </div>
        </div>
    );
}
