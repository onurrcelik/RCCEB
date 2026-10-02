'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { ArrowRightIcon, ArrowLeftIcon, UserIcon, AcademicCapIcon, CheckCircleIcon, EnvelopeIcon, UserPlusIcon, CameraIcon, BookOpenIcon, PhoneIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { LinkedinIcon } from '@/app/components/ui/BrandIcons';
import Link from 'next/link';
import { RccebLogo } from '@/app/components/ui/RccebLogo';
import { categoryLabel, FIRST_GRADUATION_YEAR } from '@/app/lib/categories';
import { EMPTY_COMPANY, type CompanyDraft } from '@/app/lib/company-input';
import { ExpertisePicker } from '@/app/components/profile/ExpertisePicker';
import { CompanyFields } from '@/app/components/profile/CompanyFields';
import { buildOnboardingPrompt } from '@/app/lib/onboarding-prompt';
import { ChatGptPromptDialog } from './ChatGptPromptDialog';
import type { ParsedOnboarding } from '@/app/lib/onboarding-paste';
import { SparklesIcon } from '@heroicons/react/24/outline';

// Newest first, matching the dropdown on rcceb.org/join.
const GRADUATION_YEARS = Array.from(
    { length: new Date().getFullYear() + 6 - FIRST_GRADUATION_YEAR + 1 },
    (_, i) => new Date().getFullYear() + 6 - i,
);

function compressImage(file: File, maxPx: number, quality: number): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            canvas.toBlob(
                blob => blob ? resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' })) : reject(new Error('Compression failed')),
                'image/jpeg',
                quality,
            );
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
        img.src = url;
    });
}

function OnboardingContent() {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [savingReferrals, setSavingReferrals] = useState(false);
    const [error, setError] = useState('');
    const [expertise, setExpertise] = useState<string[]>([]);
    const [pathways, setPathways] = useState<string[]>([]);
    const [companies, setCompanies] = useState<CompanyDraft[]>([{ ...EMPTY_COMPANY }]);
    const [memberEmail, setMemberEmail] = useState('');
    const totalSteps = 2;
    const [avatarUrl, setAvatarUrl] = useState('');
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [filledFromChatGpt, setFilledFromChatGpt] = useState(0);
    // Kept apart from `error`: clicking Continue overwrites `error` with the
    // missing-fields line, which used to bury why the upload actually failed.
    const [uploadError, setUploadError] = useState('');

    const [form, setForm] = useState({
        name: '', phone: '', linkedin: '', graduation_year: '', location: '',
        bio: '', can_help_with: '', working_on: '', education: '',
        favorite_resource: '',
    });

    const [referrals, setReferrals] = useState([
        { name: '', email: '', linkedin: '', notes: '' },
        { name: '', email: '', linkedin: '', notes: '' },
    ]);

    useEffect(() => {
        fetch('/api/members/profile')
            .then(r => r.json())
            .then(d => {
                const m = d.member;
                if (!m) return;
                if (m.email) setMemberEmail(m.email);

                // Name, phone, LinkedIn, class year and pathway were copied from the
                // rcceb.org/join application when the invite was sent.
                setForm(f => ({
                    ...f,
                    name: m.name ?? f.name,
                    phone: m.phone ?? f.phone,
                    linkedin: m.linkedin ?? f.linkedin,
                    graduation_year: m.graduation_year ? String(m.graduation_year) : f.graduation_year,
                    location: m.location ?? f.location,
                    bio: m.bio ?? f.bio,
                    can_help_with: m.can_help_with ?? f.can_help_with,
                    working_on: m.working_on ?? f.working_on,
                    education: m.education ?? m.instagram ?? f.education,
                    favorite_resource: m.favorite_resource ?? f.favorite_resource,
                }));
                if (Array.isArray(m.categories)) setPathways(m.categories);
                if (Array.isArray(m.expertise)) setExpertise(m.expertise);
                if (Array.isArray(d.companies) && d.companies.length > 0) {
                    setCompanies(d.companies.map((company: { name?: string; role?: string | null; website?: string | null; linkedin?: string | null }) => ({
                        name: company.name || '',
                        role: company.role || '',
                        website: company.website || '',
                        linkedin: company.linkedin || '',
                    })));
                }
                if (m.avatar_url) setAvatarUrl(m.avatar_url);

                // Offer the ChatGPT prompt once, as soon as their details are in. Remembered
                // per browser so a reload doesn't bring it back; the link under the title does.
                const seenKey = `rcceb-onboarding-prompt-seen:${m.email ?? ''}`;
                let seen = false;
                try { seen = localStorage.getItem(seenKey) === '1'; localStorage.setItem(seenKey, '1'); } catch { /* storage blocked */ }
                if (!seen && !m.bio) setShowPrompt(true);
            });
    }, []);

    const chatGptPrompt = useMemo(
        () => buildOnboardingPrompt({ name: form.name, graduation_year: form.graduation_year, location: form.location, categories: pathways }),
        [form.name, form.graduation_year, form.location, pathways],
    );

    // Puts a pasted ChatGPT reply into the form. Only sections it found are touched, so a
    // partial reply never wipes what the member already typed.
    function applyChatGpt(fields: ParsedOnboarding) {
        setForm(f => ({
            ...f,
            bio: fields.bio ?? f.bio,
            can_help_with: fields.can_help_with ?? f.can_help_with,
            working_on: fields.working_on ?? f.working_on,
            education: fields.education ?? f.education,
            favorite_resource: fields.favorite_resource ?? f.favorite_resource,
        }));
        if (fields.expertise) setExpertise(fields.expertise);
        if (fields.companies) setCompanies(fields.companies);
        setFilledFromChatGpt(Object.keys(fields).length);
        setShowPrompt(false);
        setError('');
    }

    function update(key: string, val: string) {
        setForm(f => ({ ...f, [key]: val }));
    }

    function updateReferral(index: number, key: 'name' | 'email' | 'linkedin' | 'notes', val: string) {
        setReferrals(prev => prev.map((r, i) => i === index ? { ...r, [key]: val } : r));
    }

    async function handleAvatarUpload(file: File) {
        setUploadingAvatar(true);
        setError('');
        setUploadError('');
        try {
            const compressed = await compressImage(file, 1200, 0.85);
            const fd = new FormData();
            fd.append('file', compressed);
            const res = await fetch('/api/members/upload-avatar', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) { const m = data.error || 'Upload failed'; setError(m); setUploadError(m); return; }
            if (data.url) setAvatarUrl(data.url);
        } catch {
            setError('Upload failed. Please try again.');
            setUploadError('Upload failed. Please try again.');
        } finally {
            setUploadingAvatar(false);
        }
    }

    async function handleSaveProfile() {
        const missing: string[] = [];
        if (!avatarUrl) missing.push(uploadError ? `Photo (${uploadError})` : 'Photo');
        if (!form.name) missing.push('Full Name');
        if (!form.phone) missing.push('Phone');
        if (!form.linkedin) missing.push('LinkedIn');
        if (!form.graduation_year) missing.push('RC Graduation Year');
        if (!form.location.trim()) missing.push('Location');
        if (!form.bio) missing.push('Bio');
        if (!form.can_help_with) missing.push('What I can help with');
        if (!form.working_on) missing.push("What I'm working on");
        if (expertise.length < 1) missing.push('Expertise');
        if (!companies.some(company => company.name.trim())) missing.push('Companies you are affiliated with');
        else {
            if (companies.some(company => company.name.trim() && !company.role.trim())) missing.push('Your role at each company');
            if (companies.some(company => company.name.trim() && !company.website.trim())) missing.push('A website for each company');
        }
        if (!form.education) missing.push('Education after RC');
        if (!form.favorite_resource) missing.push('Favorite Read / Video / Person / Source');
        if (missing.length > 0) {
            setError(`Please complete: ${missing.join(', ')}`);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await fetch('/api/members/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    bio: form.bio,
                    linkedin: form.linkedin,
                    phone: form.phone,
                    graduation_year: form.graduation_year,
                    location: form.location,
                    can_help_with: form.can_help_with,
                    working_on: form.working_on,
                    expertise,
                    education: form.education,
                    favorite_resource: form.favorite_resource,
                    companies,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');
            setStep(2);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveReferrals() {
        setSavingReferrals(true);
        setError('');
        try {
            const filled = referrals.filter(r => r.name.trim());
            await fetch('/api/members/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ website: JSON.stringify(filled) }),
            });
            const res = await fetch('/api/members/onboarding', { method: 'PATCH' });
            if (!res.ok) throw new Error();
            window.location.href = '/members/dashboard';
        } catch {
            setError('Failed to save. Please try again.');
        } finally {
            setSavingReferrals(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950">
            {showPrompt && step === 1 && <ChatGptPromptDialog prompt={chatGptPrompt} onApply={applyChatGpt} onClose={() => setShowPrompt(false)} />}
            {/* Top bar */}
            <div className="px-4 md:px-12 py-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:pt-8 border-b border-zinc-900">
                <div className="flex items-center justify-between">
                    <Link href="/members/dashboard" className="inline-flex flex-col">
                        <RccebLogo className="mb-2.5 ml-2" />
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gold-500/15 text-[10px] font-bold text-gold-300 tracking-[0.15em] uppercase">Onboarding</span>
                    </Link>
                    <div className="hidden sm:flex items-center gap-3">
                        {Array.from({ length: totalSteps }, (_, i) => i + 1).map(n => (
                            <div key={n} className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    step === n
                                        ? 'bg-gold-400 text-zinc-950'
                                        : step > n
                                        ? 'bg-gold-400/10 text-gold-400'
                                        : 'bg-zinc-800 text-zinc-500'
                                }`}>
                                    {step > n ? <CheckCircleIcon className="w-4 h-4" /> : n}
                                </div>
                                {n < totalSteps && <div className={`w-10 h-px ${step > n ? 'bg-gold-400' : 'bg-zinc-800'}`} />}
                            </div>
                        ))}
                    </div>
                </div>
                {/* Steps row on mobile */}
                <div className="flex sm:hidden items-center justify-center gap-3 mt-3">
                    {Array.from({ length: totalSteps }, (_, i) => i + 1).map(n => (
                        <div key={n} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                step === n
                                    ? 'bg-gold-400 text-zinc-950'
                                    : step > n
                                    ? 'bg-gold-400/10 text-gold-400'
                                    : 'bg-zinc-800 text-zinc-500'
                            }`}>
                                {step > n ? <CheckCircleIcon className="w-4 h-4" /> : n}
                            </div>
                            {n < totalSteps && <div className={`w-10 h-px ${step > n ? 'bg-gold-400' : 'bg-zinc-800'}`} />}
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6 md:py-12 md:pb-12">

                {/* ── Step 1: Profile ── */}
                {step === 1 && (
                    <div className="animate-fade-in">
                        <div className="mb-6 md:mb-8">
                            <h1 className="text-2xl font-bold text-white">Complete your profile</h1>
                            <button
                                type="button"
                                onClick={() => setShowPrompt(true)}
                                className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3.5 py-1.5 text-xs font-semibold text-gold-200 hover:bg-gold-400/20 transition-colors"
                            >
                                <SparklesIcon className="w-3.5 h-3.5" />
                                {filledFromChatGpt ? 'Paste a new ChatGPT reply' : 'Let ChatGPT draft it for you'}
                            </button>
                            {filledFromChatGpt > 0 && (
                                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                                    <CheckCircleIcon className="w-5 h-5 shrink-0 text-emerald-400" />
                                    <span>Filled {filledFromChatGpt} of 7 sections from ChatGPT. Read them over, edit anything, and add your photo before you continue.</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            {/* Photo upload */}
                            <div className="flex flex-col items-center mb-2 gap-1">
                                <label className="cursor-pointer group relative">
                                    <div className="w-24 h-24 rounded-full bg-zinc-900 border-2 border-zinc-700 group-hover:border-gold-400 transition-colors flex items-center justify-center overflow-hidden relative">
                                        {uploadingAvatar ? (
                                            <span className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                        ) : avatarUrl ? (
                                            <>
                                                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/60 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <CameraIcon className="w-5 h-5 text-zinc-950" />
                                                </div>
                                            </>
                                        ) : (
                                            <CameraIcon className="w-7 h-7 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                        )}
                                    </div>
                                    <div className={`absolute bottom-0 right-0 w-7 h-7 bg-gold-400 rounded-full items-center justify-center border-2 border-black ${avatarUrl ? 'flex md:hidden' : 'flex'}`}>
                                        <CameraIcon className="w-3.5 h-3.5 text-zinc-950" />
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) handleAvatarUpload(file);
                                        }}
                                    />
                                </label>
                                <span className="text-[10px] text-zinc-600">Photo *</span>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Full Name *</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        value={form.name}
                                        onChange={e => update('name', e.target.value)}
                                        autoComplete="name"
                                        placeholder="Alex Johnson"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Phone *</label>
                                <div className="relative">
                                    <PhoneIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        value={form.phone}
                                        onChange={e => update('phone', e.target.value)}
                                        type="tel"
                                        inputMode="tel"
                                        autoComplete="tel"
                                        placeholder="+90 555 000 00 00"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    />
                                </div>
                            </div>

                            {memberEmail && (
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">E-mail</label>
                                    <div className="relative">
                                        <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                        <input
                                            value={memberEmail}
                                            readOnly
                                            className="w-full bg-zinc-900/50 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-zinc-500 text-sm cursor-default select-none"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">LinkedIn *</label>
                                <div className="relative">
                                    <LinkedinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        value={form.linkedin}
                                        onChange={e => update('linkedin', e.target.value)}
                                        inputMode="url"
                                        autoComplete="url"
                                        placeholder="linkedin.com/in/..."
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">RC Graduation Year *</label>
                                <div className="relative">
                                    <AcademicCapIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <select
                                        value={form.graduation_year}
                                        onChange={e => update('graduation_year', e.target.value)}
                                        className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    >
                                        <option value="">Select your class year</option>
                                        {GRADUATION_YEARS.map(year => <option key={year} value={year}>{year}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Location *</label>
                                <div className="relative">
                                    <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        value={form.location}
                                        onChange={e => update('location', e.target.value)}
                                        autoComplete="address-level2"
                                        placeholder="Istanbul, Turkey"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    />
                                </div>
                            </div>

                            {pathways.length > 0 && (
                                <div>
                                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Pathway</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {pathways.map(id => (
                                            <span key={id} className="text-[11px] font-semibold rounded-full border border-gold-400/40 bg-gold-500/15 px-2.5 py-1 text-gold-200">
                                                {categoryLabel(id, 'label')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Bio *</label>
                                <textarea
                                    value={form.bio}
                                    onChange={e => update('bio', e.target.value)}
                                    placeholder="A few lines on who you are and what you have built."
                                    rows={4}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm resize-none transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What I can help with *</label>
                                <textarea
                                    value={form.can_help_with}
                                    onChange={e => update('can_help_with', e.target.value)}
                                    placeholder="Introductions, fundraising advice, hiring, go-to-market…"
                                    rows={3}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm resize-none transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What I&apos;m working on *</label>
                                <textarea
                                    value={form.working_on}
                                    onChange={e => update('working_on', e.target.value)}
                                    placeholder="The company, fund, or project that has your attention now."
                                    rows={3}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm resize-none transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Expertise *</label>
                                <ExpertisePicker selected={expertise} onChange={setExpertise} />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Companies I&apos;m affiliated with *</label>
                                <p className="text-zinc-500 text-xs mb-3">Each company becomes a page other members can open, so they can see who in RCCEB can introduce them.</p>
                                <CompanyFields companies={companies} onChange={setCompanies} />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Education after RC *</label>
                                <div className="relative">
                                    <AcademicCapIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        value={form.education}
                                        onChange={e => update('education', e.target.value)}
                                        placeholder="BSc Economics, Boğaziçi; MBA, INSEAD…"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Favorite Read / Video / Person / Source *</label>
                                <div className="relative">
                                    <BookOpenIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-600" />
                                    <textarea
                                        value={form.favorite_resource}
                                        onChange={e => update('favorite_resource', e.target.value)}
                                        placeholder="Zero to One, Paul Graham Essays, Acquired Podcast…"
                                        rows={2}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

                        <button
                            onClick={handleSaveProfile}
                            disabled={saving || uploadingAvatar}
                            className="mt-8 w-full flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-3.5 rounded-xl transition-all text-sm"
                        >
                            {saving ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>Continue <ArrowRightIcon className="w-4 h-4" /></>
                            )}
                        </button>
                    </div>
                )}

                {/* ── Step 2: Referrals ── */}
                {step === 2 && (
                    <div className="animate-fade-in">
                        <div className="mb-8">
                            <div className="w-12 h-12 rounded-full bg-gold-400/15 flex items-center justify-center mb-5">
                                <UserPlusIcon className="w-5 h-5 text-gold-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">Who else belongs in the Bond?</h1>
                            <p className="text-zinc-500 text-sm leading-relaxed">
                                Suggest 2 Robert College alumni you think would be a great addition to RCCEB. We&apos;ll reach out to them.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {referrals.map((ref, i) => (
                                <div key={i} className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5">
                                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                                        Friend {i + 1}
                                    </div>
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                            <input
                                                value={ref.name}
                                                onChange={e => updateReferral(i, 'name', e.target.value)}
                                                placeholder="Full name"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                        </div>
                                        <div className="relative">
                                            <PhoneIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                            <input
                                                value={ref.email}
                                                onChange={e => updateReferral(i, 'email', e.target.value)}
                                                placeholder="Phone number"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                        </div>
                                        <div className="relative">
                                            <LinkedinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                            <input
                                                value={ref.linkedin}
                                                onChange={e => updateReferral(i, 'linkedin', e.target.value)}
                                                placeholder="LinkedIn"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                        </div>
                                        <textarea
                                            value={ref.notes}
                                            onChange={e => updateReferral(i, 'notes', e.target.value)}
                                            placeholder="Additional notes (optional)"
                                            rows={2}
                                            className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-gold-400 text-sm transition-colors resize-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}

                        <button
                            onClick={handleSaveReferrals}
                            disabled={savingReferrals}
                            className="mt-8 w-full flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-3.5 rounded-xl transition-all text-sm"
                        >
                            {savingReferrals ? (
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>Finish <ArrowRightIcon className="w-4 h-4" /></>
                            )}
                        </button>

                        <button
                            onClick={() => handleSaveReferrals()}
                            className="mt-2 w-full flex items-center justify-center text-zinc-600 hover:text-zinc-400 text-xs py-2 transition-colors"
                        >
                            Skip for now
                        </button>

                        <button
                            onClick={() => setStep(1)}
                            className="mt-1 w-full flex items-center justify-center gap-1.5 text-zinc-700 hover:text-zinc-500 text-xs py-2 transition-colors"
                        >
                            <ArrowLeftIcon className="w-3 h-3" />
                            Back
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function OnboardingPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-gold-400/30 border-t-gold-400 animate-spin" />
            </div>
        }>
            <OnboardingContent />
        </Suspense>
    );
}
