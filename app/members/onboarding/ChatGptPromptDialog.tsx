'use client';

import { useState } from 'react';
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardDocumentIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { parseChatGptReply, type ParsedOnboarding } from '@/app/lib/onboarding-paste';

// Offered when the member opens onboarding: draft the profile with the ChatGPT that
// already knows them, or fill it in by hand. Step 1 copies our prompt; step 2 takes
// ChatGPT's whole reply and sorts it into the form (app/lib/onboarding-paste.ts).
// Shown once on arrival (not on a timer, which would land mid-typing); the form keeps a
// link to bring it back.
export function ChatGptPromptDialog({ prompt, onApply, onClose }: {
    prompt: string;
    onApply: (fields: ParsedOnboarding) => void;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [reply, setReply] = useState('');
    const [parseError, setParseError] = useState('');

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

    function apply() {
        const { fields, found } = parseChatGptReply(reply);
        if (found === 0) {
            setParseError("We couldn't find the numbered sections (1. Bio, 2. What I can help with…). Paste ChatGPT's whole reply, from \"1. Bio\" to the end.");
            return;
        }
        onApply(fields);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="chatgpt-prompt-title"
                onClick={e => e.stopPropagation()}
                className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-zinc-700 bg-zinc-900 p-6 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            >
                <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors">
                    <XMarkIcon className="w-5 h-5" />
                </button>

                <div className="w-11 h-11 rounded-2xl bg-gold-400/15 flex items-center justify-center mb-5">
                    <SparklesIcon className="w-6 h-6 text-gold-300" />
                </div>
                <h2 id="chatgpt-prompt-title" className="text-xl font-bold text-white pr-8">Let ChatGPT draft your profile</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    Your ChatGPT already knows a lot about you. We wrote a prompt, with your name, class year and city already in it, that asks for exactly what this page needs. Paste its reply back here and we&apos;ll fill in the form for you.
                </p>

                {/* Step 1 */}
                <div className="mt-6">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                        <span className="text-gold-300">Step 1</span> · Copy the prompt into ChatGPT
                    </div>
                    <button
                        onClick={copy}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gold-400 py-3.5 text-sm font-bold text-zinc-950 hover:bg-gold-300 transition-colors shadow-[0_8px_24px_rgba(196,162,101,0.25)]"
                    >
                        {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                        {copied ? 'Copied. Paste it into ChatGPT' : 'Copy my ChatGPT prompt'}
                    </button>
                    <div className="mt-2 flex items-center justify-between">
                        <button onClick={() => setShowPrompt(s => !s)} className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4">
                            {showPrompt ? 'Hide the prompt' : 'See the prompt'}
                        </button>
                        <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-gold-200 hover:text-gold-100">
                            Open ChatGPT
                            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                        </a>
                    </div>
                    {showPrompt && (
                        <textarea
                            readOnly
                            value={prompt}
                            onFocus={e => e.currentTarget.select()}
                            className="mt-3 w-full h-48 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300 focus:outline-none focus:border-gold-400/50"
                        />
                    )}
                </div>

                {/* Step 2 */}
                <div className="mt-6">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                        <span className="text-gold-300">Step 2</span> · Paste ChatGPT&apos;s whole reply
                    </div>
                    <textarea
                        value={reply}
                        onChange={e => { setReply(e.target.value); setParseError(''); }}
                        placeholder={'1. Bio\n…\n2. What I can help with\n…'}
                        className="w-full h-32 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm leading-relaxed text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400/50"
                    />
                    {parseError && <p className="mt-2 text-xs text-red-300">{parseError}</p>}
                    <button
                        onClick={apply}
                        disabled={!reply.trim()}
                        className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-gold-400/50 bg-gold-400/10 py-3 text-sm font-bold text-gold-100 hover:bg-gold-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <SparklesIcon className="w-4 h-4" />
                        Fill my profile
                    </button>
                </div>

                <button onClick={onClose} className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    I&apos;ll fill it in myself
                </button>
            </div>
        </div>
    );
}
