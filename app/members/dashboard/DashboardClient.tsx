'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { EventImageGrid } from '@/app/components/events/EventImageGrid';
import { EventLightbox } from '@/app/components/events/EventLightbox';
import { EventRecord, formatEventDate } from '@/app/lib/events';
import {
    UsersIcon, LinkIcon, CalendarIcon, MapPinIcon, ChevronRightIcon, MagnifyingGlassIcon, XMarkIcon, ArrowTopRightOnSquareIcon, SparklesIcon, CheckCircleIcon, UserPlusIcon, EnvelopeIcon, DocumentTextIcon, GlobeAltIcon, PhotoIcon, ArrowsRightLeftIcon, PhoneIcon, BriefcaseIcon, TagIcon, GiftIcon
} from '@heroicons/react/24/outline';
import { LinkedinIcon, GithubIcon, InstagramIcon, YoutubeIcon } from '@/app/components/ui/BrandIcons';
import { categoryLabel, classYearLabel, FIRST_GRADUATION_YEAR, MEMBER_CATEGORIES, SECTOR_OPTIONS } from '@/app/lib/categories';
import { RccebLogo } from '@/app/components/ui/RccebLogo';
import { JobBoardSection } from './job-board/JobBoardSection';
import { MarketplaceSection } from './marketplace/MarketplaceSection';
import { PerksSection } from './perks/PerksSection';

type Member = {
    id: string;
    name: string;
    bio: string;
    avatar_url?: string;
    member_types?: string;
    linkedin?: string;
    location?: string;
    twitter?: string;
    instagram?: string;
    github?: string;
    favorite_resource?: string;
    occupation_link?: string;
    graduation_year?: number | null;
    categories?: string[];
    is_past_member?: boolean;
    created_at: string;
};

type SelfMember = Member & {
    email: string;
    phone?: string;
    onboarding_complete: boolean;
    website?: string;
};

type CommunityLink = {
    url: string;
    type: string;
    label: string;
    title: string;
    notes: string;
    description?: string;
};

type LinkGroup = {
    id: string;
    date_from: string;
    date_to: string;
    links: CommunityLink[];
};

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



const NAV_ITEMS = [
    { id: 'directory', label: 'Directory', icon: UsersIcon },
    { id: 'job-board', label: 'Job Board', icon: BriefcaseIcon },
    { id: 'marketplace', label: 'Marketplace', icon: TagIcon },
    { id: 'perks', label: 'Perks', icon: GiftIcon },
    { id: 'match', label: '1-on-1 Match', icon: ArrowsRightLeftIcon },
    { id: 'links', label: 'Links', icon: LinkIcon },
    { id: 'events', label: 'Events', icon: CalendarIcon },
    { id: 'referrals', label: 'Refer a Friend', icon: UserPlusIcon },
];

const BACKGROUND_OPTIONS = SECTOR_OPTIONS;

const VALID_SECTIONS = new Set(NAV_ITEMS.map(item => item.id));
const DEFAULT_SECTION = 'directory';

function getValidSection(section: string | null) {
    return section && VALID_SECTIONS.has(section) ? section : DEFAULT_SECTION;
}

function toggleBackgroundSelection(currentValue: string, option: string) {
    const current = currentValue.split(',').map(item => item.trim()).filter(Boolean);

    if (current.includes(option)) {
        return current.filter(item => item !== option).join(', ');
    }

    if (current.length >= 3) {
        return currentValue;
    }

    return [...current, option].join(', ');
}

function BackgroundChipSelector({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const selectedBackgrounds = value.split(',').map(item => item.trim()).filter(Boolean);

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Sectors</label>
                <span className="text-[10px] text-zinc-500">Pick up to 3</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {BACKGROUND_OPTIONS.map(option => {
                    const selected = selectedBackgrounds.includes(option);
                    const maxed = selectedBackgrounds.length >= 3 && !selected;

                    return (
                        <button
                            key={option}
                            type="button"
                            onClick={() => onChange(toggleBackgroundSelection(value, option))}
                            disabled={maxed}
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${
                                selected
                                    ? 'border-gold-400 bg-gold-400 text-zinc-950'
                                    : maxed
                                    ? 'cursor-not-allowed border-zinc-800 text-zinc-600'
                                    : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white'
                            }`}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function LinkTypeIcon({ type }: { type: string }) {
    switch (type) {
        case 'repo':    return <GithubIcon className="w-4 h-4 text-zinc-200" />;
        case 'youtube': return <YoutubeIcon className="w-4 h-4 text-red-400" />;
        case 'linkedin':return <LinkedinIcon className="w-4 h-4 text-gold-300" />;
        case 'twitter': return (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-zinc-200">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.396-5.402 6.396H2.746l7.73-9.138-8.227-10.862h6.145l4.333 5.73zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        );
        case 'instagram':return <InstagramIcon className="w-4 h-4 text-pink-400" />;
        case 'paper':   return <DocumentTextIcon className="w-4 h-4 text-purple-400" />;
        case 'article': return <DocumentTextIcon className="w-4 h-4 text-zinc-300" />;
        default:        return <GlobeAltIcon className="w-4 h-4 text-zinc-400" />;
    }
}

// Shown in place of the weekly round for members outside the 1-on-1 pool — unfinished
// onboarding, or marked as a past member. Their match history stays below, only new
// rounds are gone.
function IneligibleMatchCard() {
    return (
        <div className="max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-zinc-700 rounded-2xl p-10 text-center">
            <ArrowsRightLeftIcon className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">You&apos;re not in this round</h3>
            <p className="text-zinc-400 text-sm">The weekly 1-on-1s run for active, onboarded members. Your past matches are still below.</p>
        </div>
    );
}

// Whether a past pairing actually happened. Rendered in both your own match history and
// your current partner's, so the same meeting reads the same way in either list.
function MetBadge({ met, compact = false }: { met: boolean | null; compact?: boolean }) {
    if (met === null) return null;
    const size = compact ? 'text-[9px] px-1.5' : 'text-[10px] px-2 lg:whitespace-normal';
    const tone = met
        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
        : 'text-zinc-500 bg-zinc-800 border-zinc-700';
    return (
        <span className={`shrink-0 whitespace-nowrap font-semibold border py-0.5 rounded-full ${size} ${tone}`}>
            {met ? 'Met' : 'Didn\u2019t meet'}
        </span>
    );
}

function getInitials(name?: string) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// A dead avatar_url (storage object deleted or unreachable) must never fall through to
// the browser's broken-image rendering: it paints the img's alt text at the inherited
// font size, unclipped by the avatar circle, so the member's name spills across the card.
// Track the URL that failed rather than a boolean, so the fallback clears itself when the
// same component instance is reused for another member or the avatar is re-uploaded.
function Avatar({
    url,
    name,
    className,
    textClass,
}: {
    url?: string | null;
    name?: string;
    className: string;
    textClass: string;
}) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);

    if (!url || failedUrl === url) {
        return (
            <div className={`${className} rounded-full bg-navy-700 flex items-center justify-center`}>
                <span className={`text-gold-300 font-bold ${textClass}`}>{getInitials(name)}</span>
            </div>
        );
    }

    return (
        <img
            src={url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedUrl(url)}
            className={`${className} rounded-full object-cover`}
        />
    );
}

// One badge per RCCEB pathway the member chose, plus their RC class year. Categories
// get the brand gold so they read as the member's role at a glance.
function CategoryBadge({ id, size = 'sm' }: { id: string; size?: 'sm' | 'md' }) {
    const scale = size === 'md' ? 'text-[10px] px-2 py-1' : 'text-[9px] px-1.5 py-0.5';
    return (
        <span className={`shrink-0 font-bold uppercase tracking-wider border rounded ${scale} text-gold-200 bg-gold-500/15 border-gold-400/40`}>
            {categoryLabel(id)}
        </span>
    );
}

function ClassYearBadge({ year, size = 'sm' }: { year?: number | null; size?: 'sm' | 'md' }) {
    const label = classYearLabel(year);
    if (!label) return null;
    const scale = size === 'md' ? 'text-[10px] px-2 py-1' : 'text-[9px] px-1.5 py-0.5';
    return (
        <span className={`shrink-0 font-bold tracking-wider border rounded ${scale} text-zinc-200 bg-zinc-800 border-zinc-600`}>
            {label}
        </span>
    );
}

function MemberBadges({ member, size = 'sm' }: { member: Member; size?: 'sm' | 'md' }) {
    return (
        <>
            <ClassYearBadge year={member.graduation_year} size={size} />
            {(member.categories ?? []).map(id => <CategoryBadge key={id} id={id} size={size} />)}
        </>
    );
}

function MemberCard({ member, onClick }: { member: Member; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="group text-left w-full bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5 hover:border-gold-400/40 hover:bg-zinc-900 transition-all duration-200"
        >
            <div className="flex items-center gap-3 mb-3">
                <Avatar url={member.avatar_url} name={member.name} className="w-14 h-14 shrink-0" textClass="text-sm" />
                <div className="min-w-0">
                    {/* Wraps rather than squeezing: a member can carry several badges, and
                        without this the name truncates to make room for them. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="font-semibold text-white text-sm group-hover:text-gold-300 transition-colors truncate max-w-full">{member.name}</div>
                        <MemberBadges member={member} />
                        {member.is_past_member && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-400/90 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                                Past
                            </span>
                        )}
                    </div>
                    {member.location && (
                        <div className="flex items-center gap-1 text-zinc-400 text-xs mt-0.5">
                            <MapPinIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{member.location}</span>
                        </div>
                    )}
                </div>
            </div>
            {member.bio && (
                <p className="text-zinc-300 text-xs leading-relaxed mb-2">{member.bio}</p>
            )}
            {member.member_types && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {member.member_types.split(',').map(t => t.trim()).filter(Boolean).map(type => (
                        <span key={type} className="text-[10px] font-medium bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">
                            {type}
                        </span>
                    ))}
                </div>
            )}
            {member.instagram && (
                <p className="text-zinc-500 text-xs mb-2">{member.instagram}</p>
            )}
            {member.favorite_resource && (
                <p className="text-zinc-500 text-[11px] italic leading-relaxed mb-2 line-clamp-2">
                    ✦ {member.favorite_resource}
                </p>
            )}
            <div className="flex flex-wrap gap-2 mt-1">
                {member.linkedin && (
                    <div
                        onClick={e => { e.stopPropagation(); window.open(member.linkedin!.startsWith('http') ? member.linkedin! : `https://${member.linkedin}`, '_blank'); }}
                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                        <LinkedinIcon className="w-3 h-3" /> LinkedIn
                    </div>
                )}
                {member.github && (
                    <div
                        onClick={e => { e.stopPropagation(); window.open(member.github!.startsWith('http') ? member.github! : `https://${member.github}`, '_blank'); }}
                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition-all"
                    >
                        <GithubIcon className="w-3 h-3" /> GitHub
                    </div>
                )}
            </div>
        </button>
    );
}

function MemberModal({ member, onClose, isSelf, onEdit }: { member: Member; onClose: () => void; isSelf?: boolean; onEdit?: () => void }) {
    const types = member.member_types?.split(',').map(t => t.trim()).filter(Boolean) || [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden animate-fade-in max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 pb-5 border-b border-zinc-700 shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <Avatar url={member.avatar_url} name={member.name} className="w-24 h-24 shrink-0" textClass="text-2xl" />
                        <div>
                            <h2 className="text-lg font-bold text-white">{member.name}</h2>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <MemberBadges member={member} size="md" />
                            </div>
                            {member.location && (
                                <div className="flex items-center gap-1.5 text-zinc-400 text-sm mt-0.5">
                                    <MapPinIcon className="w-3.5 h-3.5" />
                                    {member.location}
                                </div>
                            )}
                            {types.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {types.map(type => (
                                        <span key={type} className="text-[10px] font-semibold bg-gold-500/15 text-gold-300 px-2.5 py-0.5 rounded-full">
                                            {type}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-6 space-y-5 overflow-y-auto">
                    {member.bio && (
                        <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Current Role</div>
                            <p className="text-zinc-200 text-sm leading-relaxed">{member.bio}</p>
                            {member.occupation_link && (
                                <a
                                    href={member.occupation_link.startsWith('http') ? member.occupation_link : `https://${member.occupation_link}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-gold-400 hover:underline mt-1.5"
                                >
                                    <GlobeAltIcon className="w-3 h-3" />
                                    {member.occupation_link.replace(/^https?:\/\//, '')}
                                </a>
                            )}
                        </div>
                    )}
                    {member.twitter && (
                        <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Area of Interest</div>
                            <p className="text-zinc-200 text-sm">{member.twitter}</p>
                        </div>
                    )}
                    {member.instagram && (
                        <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Education After RC</div>
                            <p className="text-zinc-200 text-sm">{member.instagram}</p>
                        </div>
                    )}
                    {member.favorite_resource && (
                        <div>
                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Favorite Read / Video / Person</div>
                            <p className="text-zinc-200 text-sm leading-relaxed">{member.favorite_resource}</p>
                        </div>
                    )}
                    {(member.linkedin || member.github) && (
                        <div className="pt-1 flex flex-wrap gap-2">
                            {member.linkedin && (
                                <a href={member.linkedin.startsWith('http') ? member.linkedin : `https://${member.linkedin}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 rounded-xl">
                                    <LinkedinIcon className="w-3.5 h-3.5" /> LinkedIn
                                </a>
                            )}
                            {member.github && (
                                <a href={member.github.startsWith('http') ? member.github : `https://${member.github}`} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 rounded-xl">
                                    <GithubIcon className="w-3.5 h-3.5" /> GitHub
                                </a>
                            )}
                        </div>
                    )}
                    {isSelf && onEdit && (
                        <div className="pt-2 border-t border-zinc-700">
                            <button
                                onClick={onEdit}
                                className="w-full py-2.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all"
                            >
                                Edit Profile
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MobileSidebarOverlay({
    open,
    onClose,
    activeSection,
    setActiveSection,
    navInactive,
    referralsDone,
    self,
}: {
    open: boolean;
    onClose: () => void;
    activeSection: string;
    setActiveSection: (section: string) => void;
    navInactive: string;
    referralsDone: boolean;
    self: SelfMember | null;
}) {
    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="md:hidden fixed inset-0 z-[100]" onClick={onClose}>
            <div className="absolute inset-0 bg-black/70" />
            <div
                className="fixed left-0 top-0 z-[101] flex w-64 max-w-[80vw] flex-col overflow-hidden border-r border-zinc-800 bg-navy-925 shadow-2xl"
                style={{ height: '100dvh', maxHeight: '100dvh' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="shrink-0 border-b border-zinc-800 bg-navy-925 px-5 py-4 pt-10">
                    <button onClick={() => { setActiveSection(DEFAULT_SECTION); onClose(); }} className="block text-left">
                        <RccebLogo className="mb-2.5 ml-2" />
                        <span className="inline-flex items-center rounded-full bg-gold-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gold-300 ml-2">Member Portal</span>
                    </button>
                </div>
                <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <div className="space-y-0.5 pb-3">
                        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => { setActiveSection(id); onClose(); }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                                    activeSection === id ? 'bg-gold-400/10 text-gold-300' : navInactive
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="flex-1 text-left">{label}</span>
                                {id === 'referrals' && <span className={`w-2 h-2 rounded-full shrink-0 ${referralsDone ? 'bg-emerald-500' : 'bg-red-500'}`} />}
                            </button>
                        ))}
                    </div>
                </nav>
                <div className="shrink-0 border-t border-zinc-800 bg-navy-925 px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <div className="space-y-0.5">
                        <button
                            onClick={() => { setActiveSection('profile'); onClose(); }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${activeSection === 'profile' ? 'bg-gold-400/10 text-gold-300' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'}`}
                        >
                            <Avatar url={self?.avatar_url} name={self?.name} className="w-5 h-5 shrink-0" textClass="text-[9px]" />
                            <span className="truncate">{self?.name || 'My Profile'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function DashboardContent() {
    const params = useSearchParams();

    const [activeSection, setActiveSection] = useState(() => getValidSection(params.get('section')));
    const [self, setSelf] = useState<SelfMember | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [linkGroups, setLinkGroups] = useState<LinkGroup[]>([]);
    const [loadingLinks, setLoadingLinks] = useState(false);
    const [linkSearch, setLinkSearch] = useState('');
    const [referrals, setReferrals] = useState([{ name: '', email: '', linkedin: '', notes: '' }, { name: '', email: '', linkedin: '', notes: '' }]);
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
    const [savingReferrals, setSavingReferrals] = useState(false);
    const [referralsSaved, setReferralsSaved] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarError, setAvatarError] = useState('');

    type MatchHistoryEntry = { round_id: string; week_of: string; partner: Member; confirmed_met: boolean | null };
    type PartnerHistoryEntry = { round_id: string; week_of: string; partner: Member; confirmed_met: boolean | null };
    type MatchData = {
        eligible?: boolean;
        currentRound: { id: string; week_of: string; status: string } | null;
        myResponse: { opted_in: boolean | null; confirmed_met: boolean | null } | null;
        myCurrentMatch: { id: string; name: string; email: string; phone?: string; bio?: string; linkedin?: string; github?: string; location?: string; avatar_url?: string; member_types?: string; twitter?: string; instagram?: string; favorite_resource?: string; occupation_link?: string; graduation_year?: number | null; categories?: string[]; is_past_member?: boolean; created_at?: string } | null;
        isOpener: boolean | null;
        pendingConfirmation: { round_id: string; member: { id: string; name: string; avatar_url?: string } } | null;
        matchHistory: MatchHistoryEntry[];
        currentMatchHistory: PartnerHistoryEntry[];
    };
    const [matchData, setMatchData] = useState<MatchData | null>(null);
    // Members outside the 1-on-1 pool keep their history but drop out of new rounds
    // (see app/lib/categories.ts).
    const matchEligible = matchData?.eligible !== false;
    const [loadingMatch, setLoadingMatch] = useState(false);
    const [matchConfirmationDone, setMatchConfirmationDone] = useState(false);
    const [submittingMatch, setSubmittingMatch] = useState(false);
    const [lateOptInDone, setLateOptInDone] = useState(false);
    const [matchError, setMatchError] = useState('');
    const [matchHistoryExpanded, setMatchHistoryExpanded] = useState(false);

    const fetchMatch = async () => {
        setLoadingMatch(true);
        try {
            const res = await fetch('/api/members/match');
            setMatchData(await res.json());
            setMatchConfirmationDone(false);
        } finally {
            setLoadingMatch(false);
        }
    };

    // Returns whether the server accepted it. Callers that flip local UI state on the back
    // of a submit must check this — a rejected opt-in used to leave the portal claiming
    // the member was in when nothing had been recorded.
    const submitMatch = async (payload: { round_id: string; opted_in?: boolean; confirmed_met?: boolean }) => {
        setSubmittingMatch(true);
        setMatchError('');
        try {
            const res = await fetch('/api/members/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setMatchError(data.error || 'Something went wrong. Please try again.');
                return false;
            }
            await fetchMatch();
            return true;
        } catch {
            setMatchError('Something went wrong. Please try again.');
            return false;
        } finally {
            setSubmittingMatch(false);
        }
    };

    const fetchMembers = useCallback((options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;
        if (!silent) setLoadingMembers(true);
        fetch(`/api/members/directory?t=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d.members) setMembers(d.members); })
            .finally(() => {
                if (!silent) setLoadingMembers(false);
            });
    }, []);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get('section') === activeSection) return;
        url.searchParams.set('section', activeSection);
        window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
    }, [activeSection]);

    useEffect(() => {
        fetch('/api/members/profile')
            .then(r => r.json())
            .then(d => {
                if (d.member) {
                    setSelf(d.member);
                    if (d.member.website) {
                        try {
                            const saved = JSON.parse(d.member.website);
                            if (Array.isArray(saved)) {
                                setReferrals([
                                    saved[0] || { name: '', email: '', linkedin: '', notes: '' },
                                    saved[1] || { name: '', email: '', linkedin: '', notes: '' },
                                ]);
                            }
                        } catch { /* not json, ignore */ }
                    }
                }
            });
    }, []);

    useEffect(() => {
        if (!sidebarOpen) return;

        const prevBodyOverflow = document.body.style.overflow;
        const prevBodyTouchAction = document.body.style.touchAction;
        const prevBodyOverscroll = document.body.style.overscrollBehavior;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;

        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.body.style.overscrollBehavior = 'none';
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.style.overscrollBehavior = 'none';

        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.body.style.touchAction = prevBodyTouchAction;
            document.body.style.overscrollBehavior = prevBodyOverscroll;
            document.documentElement.style.overflow = prevHtmlOverflow;
            document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
        };
    }, [sidebarOpen]);

    const fetchEvents = () => {
        setLoadingEvents(true);
        fetch(`/api/members/events?t=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => { if (d.events) setEvents(d.events); })
            .finally(() => setLoadingEvents(false));
    };

    useEffect(() => {
        if (activeSection === 'directory') {
            fetchMembers();
        }
        if (activeSection === 'links' && linkGroups.length === 0) {
            setLoadingLinks(true);
            fetch('/api/members/links')
                .then(r => r.json())
                .then(d => { if (d.groups) setLinkGroups(d.groups); })
                .finally(() => setLoadingLinks(false));
        }
        if (activeSection === 'events') {
            fetchEvents();
        }
        if (activeSection === 'match') {
            fetchMatch();
        }
    }, [activeSection, fetchMembers, linkGroups.length]);

    useEffect(() => {
        if (activeSection !== 'directory') return;

        const refreshDirectory = () => {
            if (document.visibilityState === 'visible') fetchMembers({ silent: true });
        };

        window.addEventListener('focus', refreshDirectory);
        document.addEventListener('visibilitychange', refreshDirectory);
        const intervalId = window.setInterval(refreshDirectory, 15000);

        return () => {
            window.removeEventListener('focus', refreshDirectory);
            document.removeEventListener('visibilitychange', refreshDirectory);
            window.clearInterval(intervalId);
        };
    }, [activeSection, fetchMembers]);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible' && activeSection === 'events') {
                fetchEvents();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [activeSection]);

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploadingAvatar(true);
        setAvatarError('');
        try {
            const compressed = await compressImage(file, 1200, 0.85);
            const fd = new FormData();
            fd.append('file', compressed);
            const res = await fetch('/api/members/upload-avatar', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) { setAvatarError(data.error || 'Upload failed'); return; }
            if (data.url) {
                setSelf(u => u ? { ...u, avatar_url: data.url } : u);
                setMembers(prev => prev.map(m => m.id === self?.id ? { ...m, avatar_url: data.url } : m));
                setSelectedMember(current => current && current.id === self?.id ? { ...current, avatar_url: data.url } : current);
            }
        } catch {
            setAvatarError('Upload failed. Please try again.');
        } finally {
            setUploadingAvatar(false);
        }
    }

    async function handleSaveReferrals() {
        setSavingReferrals(true);
        try {
            await fetch('/api/members/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ website: JSON.stringify(referrals.filter(r => r.name.trim())) }),
            });
            setReferralsSaved(true);
            setTimeout(() => setReferralsSaved(false), 2500);
        } finally {
            setSavingReferrals(false);
        }
    }

    const filteredMembers = members.filter(m =>
        (!categoryFilter || (m.categories ?? []).includes(categoryFilter)) && (
            !search ||
            m.name?.toLowerCase().includes(search.toLowerCase()) ||
            m.bio?.toLowerCase().includes(search.toLowerCase()) ||
            m.location?.toLowerCase().includes(search.toLowerCase()) ||
            m.member_types?.toLowerCase().includes(search.toLowerCase()) ||
            m.twitter?.toLowerCase().includes(search.toLowerCase()) ||
            String(m.graduation_year ?? '').includes(search)
        )
    );
    const currentMembers = filteredMembers.filter(m => !m.is_past_member);
    const pastMembers = filteredMembers.filter(m => m.is_past_member);

    const navInactive = 'text-zinc-300 hover:text-white hover:bg-zinc-900';
    const referralsDone = referrals.filter(r => r.name.trim() && r.email.trim() && r.linkedin.trim()).length >= 2;

    return (
        <div className={activeSection === 'match' ? 'min-h-screen w-full max-w-[100vw] lg:max-w-none min-w-0 overflow-x-hidden lg:overflow-x-visible bg-zinc-950 flex' : 'min-h-screen bg-zinc-950 flex'}>
            {/* Sidebar */}
            <aside className="hidden md:flex w-60 shrink-0 flex-col fixed h-screen z-20 bg-navy-925 border-r border-zinc-800">
                <div className="px-6 pt-12 pb-5 border-b border-zinc-900">
                    <button onClick={() => setActiveSection(DEFAULT_SECTION)} className="block text-left">
                        <RccebLogo className="mb-2.5 ml-2" />
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-gold-500/15 text-[10px] font-bold text-gold-300 tracking-[0.15em] uppercase">Member Portal</span>
                    </button>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                    {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                        const active = activeSection === id;
                        const isReferrals = id === 'referrals';
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveSection(id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                                    active ? 'bg-gold-400/10 text-gold-300' : navInactive
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="flex-1 text-left">{label}</span>
                                {isReferrals && <span className={`w-2 h-2 rounded-full shrink-0 ${referralsDone ? 'bg-emerald-500' : 'bg-red-500'}`} />}
                            </button>
                        );
                    })}
                </nav>
                <div className="px-3 py-3 border-t border-zinc-900 space-y-0.5">
                    <button
                        onClick={() => setActiveSection('profile')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${activeSection === 'profile' ? 'bg-gold-400/10 text-gold-300' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'}`}
                    >
                        <Avatar url={self?.avatar_url} name={self?.name} className="w-5 h-5 shrink-0" textClass="text-[9px]" />
                        <span className="truncate">{self?.name || 'My Profile'}</span>
                    </button>
                </div>
            </aside>

            {/* Mobile header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-navy-925 border-b border-zinc-800 px-4 pt-6 pb-3 flex items-center justify-between">
                <button onClick={() => setActiveSection(DEFAULT_SECTION)} className="flex items-center gap-2">
                    <RccebLogo size={26} />
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gold-500/15 text-[9px] font-bold text-gold-300 tracking-[0.15em] uppercase">Member Portal</span>
                </button>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-zinc-300 p-1">
                    <div className="w-5 h-0.5 bg-current mb-1" />
                    <div className="w-5 h-0.5 bg-current mb-1" />
                    <div className="w-5 h-0.5 bg-current" />
                </button>
            </div>

            <MobileSidebarOverlay
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                navInactive={navInactive}
                referralsDone={referralsDone}
                self={self}
            />

            {/* Main content */}
            <main className={activeSection === 'match' ? 'w-full max-w-[100vw] lg:max-w-none min-w-0 flex-1 overflow-x-hidden lg:overflow-x-visible md:ml-60 min-h-screen' : 'flex-1 md:ml-60 min-h-screen'}>
                <div className={
                    activeSection === 'match'
                        ? 'max-w-[100vw] lg:max-w-5xl mx-auto w-full lg:w-auto min-w-0 overflow-x-hidden lg:overflow-visible px-4 md:px-8 py-8 md:py-10 mt-14 md:mt-0'
                        : 'max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10 mt-14 md:mt-0'
                }>
                    {/* Section headers */}
                    <div className="mb-8">
                        {activeSection === 'directory' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Member Directory</h1>
                                <p className="text-zinc-400 text-sm">Founders, executives and investors of the RC community.</p>
                            </>
                        )}
                        {activeSection === 'job-board' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Job Board</h1>
                                <p className="text-zinc-400 text-sm">Jobs and needs from RCCEB members.</p>
                            </>
                        )}
                        {activeSection === 'marketplace' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Marketplace</h1>
                                <p className="text-zinc-400 text-sm">Post what you can help with — members contact you directly.</p>
                            </>
                        )}
                        {activeSection === 'perks' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Perks</h1>
                                <p className="text-zinc-400 text-sm">Exclusive offers for RCCEB members.</p>
                            </>
                        )}
                        {activeSection === 'links' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Links</h1>
                                <p className="text-zinc-400 text-sm">Every link shared in the RCCEB community.</p>
                            </>
                        )}
                        {activeSection === 'events' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Events</h1>
                                <p className="text-zinc-400 text-sm">Past and upcoming RCCEB gatherings.</p>
                            </>
                        )}
                        {activeSection === 'match' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">1-on-1 Match</h1>
                                <p className="max-w-full break-words lg:break-normal text-zinc-400 text-sm">Get matched with another RCCEB member for a 30-min call.</p>
                            </>
                        )}
                        {activeSection === 'referrals' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Refer a Friend</h1>
                                <p className="text-zinc-400 text-sm">Which RC alumni belong in the Bond?</p>
                            </>
                        )}
                        {activeSection === 'profile' && (
                            <>
                                <h1 className="text-xl font-bold text-white mb-1">Profile</h1>
                                <p className="text-zinc-400 text-sm">Manage your info and membership.</p>
                            </>
                        )}
                    </div>

                    {/* === DIRECTORY === */}
                    {activeSection === 'directory' && (
                        <div>
                            <div className="relative mb-6">
                                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search members by name, role, location, class year…"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm transition-colors"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 mb-6">
                                {[{ id: null as string | null, label: 'All members' }, ...MEMBER_CATEGORIES.map(c => ({ id: c.id as string | null, label: c.short }))].map(option => {
                                    const selected = categoryFilter === option.id;
                                    return (
                                        <button
                                            key={option.id ?? 'all'}
                                            type="button"
                                            onClick={() => setCategoryFilter(option.id)}
                                            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${
                                                selected
                                                    ? 'border-gold-400 bg-gold-400 text-zinc-950'
                                                    : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {loadingMembers ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5 animate-pulse h-36" />
                                    ))}
                                </div>
                            ) : filteredMembers.length === 0 ? (
                                <div className="text-center py-20 text-zinc-400">
                                    {search || categoryFilter ? 'No members match your search.' : 'No members yet.'}
                                </div>
                            ) : (
                                <>
                                    <div className="text-xs text-zinc-400 mb-6">{currentMembers.length} member{currentMembers.length !== 1 ? 's' : ''}</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {currentMembers.map(member => (
                                            <MemberCard key={member.id} member={member} onClick={() => setSelectedMember(member)} />
                                        ))}
                                    </div>
                                    {pastMembers.length > 0 && (
                                        <div className="mt-10">
                                            <div className="flex items-center gap-3 mb-4">
                                                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Past Members</h2>
                                                <span className="text-xs text-zinc-600">{pastMembers.length}</span>
                                                <div className="flex-1 h-px bg-zinc-800" />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                                                {pastMembers.map(member => (
                                                    <MemberCard key={member.id} member={member} onClick={() => setSelectedMember(member)} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* === JOB BOARD === */}
                    {activeSection === 'job-board' && <JobBoardSection />}

                    {/* === MARKETPLACE === */}
                    {activeSection === 'marketplace' && <MarketplaceSection />}

                    {/* === PERKS === */}
                    {activeSection === 'perks' && <PerksSection />}

                    {/* === LINKS === */}
                    {activeSection === 'links' && (
                        <div className="space-y-6">
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                    value={linkSearch}
                                    onChange={e => setLinkSearch(e.target.value)}
                                    placeholder="Search links by title or description…"
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm transition-colors"
                                />
                                {linkSearch && (
                                    <button onClick={() => setLinkSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        <div className="space-y-8">
                            {loadingLinks ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5 animate-pulse h-20" />
                                ))
                            ) : linkGroups.length === 0 ? (
                                <div className="text-center py-20 text-zinc-400">No links shared yet.</div>
                            ) : (() => {
                                const q = linkSearch.toLowerCase();
                                const filtered = linkGroups
                                    .map(g => ({
                                        ...g,
                                        links: q
                                            ? g.links.filter(l =>
                                                l.title.toLowerCase().includes(q) ||
                                                l.notes?.toLowerCase().includes(q) ||
                                                l.label.toLowerCase().includes(q)
                                              )
                                            : g.links,
                                    }))
                                    .filter(g => g.links.length > 0);
                                if (filtered.length === 0) return (
                                    <div className="text-center py-20 text-zinc-400">No links match your search.</div>
                                );
                                return filtered.map(group => (
                                <div key={group.id}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                                            {new Date(group.date_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            {' — '}
                                            {new Date(group.date_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                        <div className="flex-1 h-px bg-zinc-800" />
                                        <span className="text-[11px] text-zinc-600">{group.links.length} link{group.links.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {group.links.map((link, i) => (
                                            <a key={i} href={link.url} target="_blank" rel="noreferrer"
                                                className="group flex items-start gap-4 bg-zinc-900/60 border border-zinc-700 rounded-xl px-5 py-4 hover:border-zinc-600 transition-all">
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                                                    <LinkTypeIcon type={link.type} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-white text-sm group-hover:text-gold-300 transition-colors mb-0.5 leading-snug">
                                                        {link.title}
                                                    </div>
                                                    {link.notes && (
                                                        <div className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{link.notes}</div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[10px] font-semibold bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full">
                                                        {link.label}
                                                    </span>
                                                    <ArrowTopRightOnSquareIcon className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                                ));
                            })()}
                        </div>
                        </div>
                    )}

                    {/* === MATCH === */}
                    {activeSection === 'match' && (
                        <div className="flex w-full lg:w-auto max-w-[100vw] lg:max-w-full min-w-0 overflow-hidden lg:overflow-visible gap-8 items-start">
                        <div className="w-full lg:w-auto flex-1 min-w-0 max-w-full lg:max-w-2xl overflow-hidden lg:overflow-visible">
                            {loadingMatch ? (
                                <div className="max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-zinc-700 rounded-2xl p-8 animate-pulse h-48" />
                            ) : !matchEligible ? (
                                <IneligibleMatchCard />
                            ) : !matchData?.currentRound ? (
                                <div className="max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-zinc-700 rounded-2xl p-10 text-center">
                                    <ArrowsRightLeftIcon className="w-10 h-10 text-zinc-600 mx-auto mb-4" />
                                    <h3 className="text-white font-semibold mb-2">No round this week yet</h3>
                                    <p className="text-zinc-400 text-sm">We&apos;ll send you an email when the next round opens.</p>
                                </div>
                            ) : (
                                <div className="max-w-full space-y-4 overflow-hidden lg:overflow-visible">
                                    {/* Pending confirmation from last week */}
                                    {matchData.pendingConfirmation && !matchConfirmationDone && (
                                        <div className="max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-amber-500/30 rounded-2xl p-6">
                                            <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-3">Last Week&apos;s Match</div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <Avatar url={matchData.pendingConfirmation.member.avatar_url} name={matchData.pendingConfirmation.member.name} className="w-10 h-10 shrink-0" textClass="text-sm" />
                                                <div>
                                                    <div className="text-white text-sm font-medium">{matchData.pendingConfirmation.member.name}</div>
                                                    <div className="text-zinc-400 text-xs">Did you meet with them?</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={async () => { if (await submitMatch({ round_id: matchData.pendingConfirmation!.round_id, confirmed_met: true })) setMatchConfirmationDone(true); }}
                                                    disabled={submittingMatch}
                                                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-all"
                                                >
                                                    Yes, we met
                                                </button>
                                                <button
                                                    onClick={async () => { if (await submitMatch({ round_id: matchData.pendingConfirmation!.round_id, confirmed_met: false })) setMatchConfirmationDone(true); }}
                                                    disabled={submittingMatch}
                                                    className="flex-1 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-xl transition-all"
                                                >
                                                    No, we didn&apos;t
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {matchError && (
                                        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                                            <XMarkIcon className="w-5 h-5 text-red-400 shrink-0" />
                                            <div className="text-red-300 text-sm">{matchError}</div>
                                        </div>
                                    )}

                                    {/* Current round card */}
                                    <div className="max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">This Week</div>
                                            <span className="text-[10px] font-bold text-zinc-500">
                                                Week of {new Date(matchData.currentRound.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>

                                        {/* Open round — no response yet */}
                                        {matchData.currentRound.status === 'open' && !matchData.myResponse && (
                                            <div>
                                                <p className="max-w-full text-zinc-300 text-sm leading-relaxed mb-5">
                                                    Ready for a 30-minute 1-on-1 with another RCCEB member this week?
                                                </p>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => submitMatch({ round_id: matchData.currentRound!.id, opted_in: true })}
                                                        disabled={submittingMatch}
                                                        className="flex-1 py-3 text-sm font-semibold text-zinc-950 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 rounded-xl transition-all flex items-center justify-center"
                                                    >
                                                        {submittingMatch ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "I'm in"}
                                                    </button>
                                                    <button
                                                        onClick={() => submitMatch({ round_id: matchData.currentRound!.id, opted_in: false })}
                                                        disabled={submittingMatch}
                                                        className="flex-1 py-3 text-sm font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-xl transition-all"
                                                    >
                                                        Not this week
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Open round — opted in */}
                                        {matchData.currentRound.status === 'open' && matchData.myResponse?.opted_in === true && (
                                            <div>
                                                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                                    <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0" />
                                                    <div>
                                                        <div className="text-emerald-300 text-sm font-medium">You&apos;re in for this week</div>
                                                        <div className="text-emerald-500/70 text-xs mt-0.5">Everyone joins by default — we&apos;ll email you your match when the round runs.</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => submitMatch({ round_id: matchData.currentRound!.id, opted_in: false })}
                                                    disabled={submittingMatch}
                                                    className="mt-3 w-full py-2.5 text-sm font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-xl transition-all flex items-center justify-center"
                                                >
                                                    {submittingMatch ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Can't make it this week"}
                                                </button>
                                            </div>
                                        )}

                                        {/* Open round — opted out */}
                                        {matchData.currentRound.status === 'open' && matchData.myResponse?.opted_in === false && (
                                            <div>
                                                <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-800 border border-zinc-700">
                                                    <XMarkIcon className="w-5 h-5 text-zinc-400 shrink-0" />
                                                    <div>
                                                        <div className="text-zinc-300 text-sm font-medium">Sitting out this week</div>
                                                        <div className="text-zinc-500 text-xs mt-0.5">No worries — you can always join next round.</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => submitMatch({ round_id: matchData.currentRound!.id, opted_in: true })}
                                                    disabled={submittingMatch}
                                                    className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                                >
                                                    Change mind — opt in
                                                </button>
                                            </div>
                                        )}

                                        {/* Matched — have a partner */}
                                        {matchData.currentRound.status === 'matched' && matchData.myCurrentMatch && (
                                            <div>
                                                <p className="text-zinc-400 text-xs mb-3">You&apos;ve been matched! Schedule your 30-min call.</p>
                                                {matchData.isOpener !== null && (
                                                    <div className={`flex items-start lg:items-center gap-3 rounded-xl px-4 py-3.5 mb-4 border ${matchData.isOpener ? 'bg-blue-500/10 border-blue-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                                                        <span className="text-xl shrink-0">{matchData.isOpener ? '👋' : '📬'}</span>
                                                        <div className="min-w-0">
                                                            <div className={`text-sm font-bold break-words lg:break-normal ${matchData.isOpener ? 'text-blue-300' : 'text-amber-300'}`}>
                                                                {matchData.isOpener
                                                                    ? `You should reach out to ${matchData.myCurrentMatch.name.split(' ')[0]} first`
                                                                    : `${matchData.myCurrentMatch.name.split(' ')[0]} will reach out to you`}
                                                            </div>
                                                            <div className={`text-xs mt-0.5 break-words lg:break-normal ${matchData.isOpener ? 'text-gold-300/70' : 'text-amber-400/70'}`}>
                                                                {matchData.isOpener
                                                                    ? `It's your responsibility to reach out this week. (Who goes first is randomly chosen.)`
                                                                    : `It's ${matchData.myCurrentMatch.name.split(' ')[0]}'s responsibility to reach out this week. (Who goes first is randomly chosen.)`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="bg-zinc-800 rounded-xl p-5 space-y-4">
                                                    <button
                                                        onClick={() => setSelectedMember(matchData.myCurrentMatch as unknown as Member)}
                                                        className="flex items-center gap-4 w-full text-left group"
                                                    >
                                                        <Avatar url={matchData.myCurrentMatch.avatar_url} name={matchData.myCurrentMatch.name} className="w-14 h-14 shrink-0" textClass="text-lg" />
                                                        <div>
                                                            <div className="text-white font-semibold text-base group-hover:text-gold-300 transition-colors">{matchData.myCurrentMatch.name}</div>
                                                            {matchData.myCurrentMatch.location && (
                                                                <div className="flex items-center gap-1 text-zinc-400 text-xs mt-0.5">
                                                                    <MapPinIcon className="w-3 h-3" /> {matchData.myCurrentMatch.location}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                    {matchData.myCurrentMatch.bio && (
                                                        <div>
                                                            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Occupation</div>
                                                            <p className="text-zinc-200 text-sm">{matchData.myCurrentMatch.bio}</p>
                                                        </div>
                                                    )}
                                                    <div className="pt-2 border-t border-zinc-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                        <div className="w-full min-w-0 space-y-2 lg:w-auto">
                                                            <div className="flex items-center gap-2 text-sm">
                                                                <EnvelopeIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                                                <a href={`mailto:${matchData.myCurrentMatch.email}`} className="text-gold-300 hover:underline truncate">{matchData.myCurrentMatch.email}</a>
                                                            </div>
                                                            {matchData.myCurrentMatch.phone && (
                                                                <div className="flex items-center gap-2 text-sm">
                                                                    <PhoneIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                                                    <span className="text-zinc-200">{matchData.myCurrentMatch.phone}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {(matchData.myCurrentMatch.linkedin || matchData.myCurrentMatch.github) && (
                                                            <div className="flex flex-wrap gap-1.5 lg:flex-col lg:shrink-0">
                                                                {matchData.myCurrentMatch.linkedin && (
                                                                    <a
                                                                        href={matchData.myCurrentMatch.linkedin.startsWith('http') ? matchData.myCurrentMatch.linkedin : `https://${matchData.myCurrentMatch.linkedin}`}
                                                                        target="_blank" rel="noreferrer"
                                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg transition-all"
                                                                    >
                                                                        <LinkedinIcon className="w-3.5 h-3.5" /> LinkedIn
                                                                    </a>
                                                                )}
                                                                {matchData.myCurrentMatch.github && (
                                                                    <a
                                                                        href={matchData.myCurrentMatch.github.startsWith('http') ? matchData.myCurrentMatch.github : `https://${matchData.myCurrentMatch.github}`}
                                                                        target="_blank" rel="noreferrer"
                                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg transition-all"
                                                                    >
                                                                        <GithubIcon className="w-3.5 h-3.5" /> GitHub
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {matchData.currentMatchHistory && matchData.currentMatchHistory.length > 0 && (
                                                        <div className="pt-3 border-t border-zinc-700">
                                                            <div
                                                                onClick={() => setMatchHistoryExpanded(e => !e)}
                                                                className={`rounded-xl border bg-zinc-800 cursor-pointer transition-colors ${matchHistoryExpanded ? 'border-zinc-500' : 'border-zinc-600 hover:border-zinc-400'}`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2 lg:gap-0 px-3 pt-2.5 pb-1.5">
                                                                    <span className="min-w-0 truncate lg:overflow-visible lg:text-clip lg:whitespace-normal text-xs font-semibold text-white">
                                                                        {matchData.myCurrentMatch.name.split(' ')[0]} previously matched with
                                                                    </span>
                                                                    <ChevronRightIcon className={`w-4 h-4 shrink-0 text-zinc-400 transition-all duration-200 ${matchHistoryExpanded ? 'rotate-90' : ''}`} />
                                                                </div>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); setSelectedMember(matchData.currentMatchHistory[0].partner); }}
                                                                    className="w-full min-w-0 flex items-center gap-2 px-3 pb-2.5 hover:bg-zinc-700/50 transition-colors rounded-b-xl"
                                                                >
                                                                    <Avatar url={matchData.currentMatchHistory[0].partner.avatar_url} name={matchData.currentMatchHistory[0].partner.name} className="w-5 h-5 shrink-0" textClass="text-[8px]" />
                                                                    <span className="min-w-0 flex-1 lg:flex-none truncate text-[11px] text-zinc-300 hover:text-white transition-colors">{matchData.currentMatchHistory[0].partner.name}</span>
                                                                    <MetBadge met={matchData.currentMatchHistory[0].confirmed_met} compact />
                                                                    {matchData.currentMatchHistory.length > 1 && (
                                                                        <span className="text-[11px] text-zinc-500 shrink-0">+{matchData.currentMatchHistory.length - 1} more</span>
                                                                    )}
                                                                </button>
                                                                {matchHistoryExpanded && (
                                                                    <div className="border-t border-zinc-700 px-1 py-1">
                                                                        {matchData.currentMatchHistory.slice(1).map(entry => (
                                                                            <button
                                                                                key={entry.round_id}
                                                                                onClick={() => setSelectedMember(entry.partner)}
                                                                                className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-zinc-700/50 transition-colors text-left"
                                                                            >
                                                                                <Avatar url={entry.partner.avatar_url} name={entry.partner.name} className="w-6 h-6 shrink-0" textClass="text-[8px]" />
                                                                                <span className="text-zinc-300 text-xs flex-1 truncate hover:text-white transition-colors">{entry.partner.name}</span>
                                                                                <MetBadge met={entry.confirmed_met} compact />
                                                                                <span className="text-zinc-600 text-[10px] shrink-0">
                                                                                    {new Date(entry.week_of).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                                                </span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Matched — no partner (opted out, no response, or odd one out) */}
                                        {matchData.currentRound.status === 'matched' && !matchData.myCurrentMatch && (
                                            <div>
                                                {lateOptInDone ? (
                                                    <div className="flex items-center gap-3 p-4 rounded-xl bg-gold-400/10 border border-gold-400/30">
                                                        <CheckCircleIcon className="w-5 h-5 text-gold-300 shrink-0" />
                                                        <div>
                                                            <div className="text-blue-300 text-sm font-medium">You&apos;re in for a late match</div>
                                                            <div className="text-gold-300/60 text-xs mt-0.5">We&apos;ll try to pair you with someone who also missed the round.</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="max-w-full overflow-hidden lg:overflow-visible text-center py-6">
                                                        <p className="text-zinc-300 text-sm font-medium mb-1">Missed this round?</p>
                                                        <p className="max-w-full text-zinc-500 text-xs mb-5">Matches just went out — you can still raise your hand for a late pairing.</p>
                                                        <button
                                                            onClick={async () => { if (await submitMatch({ round_id: matchData.currentRound!.id, opted_in: true })) setLateOptInDone(true); }}
                                                            disabled={submittingMatch}
                                                            className="px-6 py-2.5 text-sm font-semibold text-zinc-950 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 rounded-xl transition-all inline-flex items-center justify-center gap-2"
                                                        >
                                                            {submittingMatch
                                                                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                : 'Late opt-in'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Closed */}
                                        {matchData.currentRound.status === 'closed' && (
                                            <div className="text-center py-6">
                                                <p className="text-zinc-400 text-sm">This round has closed. We&apos;ll email you when the next one opens.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Match history */}
                            {!loadingMatch && matchData?.matchHistory && matchData.matchHistory.length > 0 && (
                                <div className="mt-4 max-w-full overflow-hidden lg:overflow-visible bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5">
                                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Your Match History</div>
                                    <div className="space-y-2">
                                        {matchData.matchHistory.map(entry => (
                                            <button
                                                key={entry.round_id}
                                                onClick={() => setSelectedMember(entry.partner)}
                                                className="w-full min-w-0 flex items-center gap-2 sm:gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                                            >
                                                <Avatar url={entry.partner.avatar_url} name={entry.partner.name} className="w-8 h-8 shrink-0" textClass="text-[10px]" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-white text-sm font-medium truncate">{entry.partner.name}</div>
                                                    {entry.partner.bio && (
                                                        <div className="text-zinc-400 text-xs truncate">{entry.partner.bio}</div>
                                                    )}
                                                    <div className="text-zinc-600 text-xs">
                                                        {new Date(entry.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                </div>
                                                <MetBadge met={entry.confirmed_met} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    )}

                    {/* === REFERRALS === */}
                    {activeSection === 'referrals' && (
                        <div className="max-w-3xl">
                            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                                Suggest 2 Robert College alumni you think would be a great addition to RCCEB. We&apos;ll reach out to them directly.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {referrals.map((ref, i) => (
                                    <div key={i} className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-5">
                                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Friend {i + 1}</div>
                                        <div className="space-y-3">
                                            <input
                                                value={ref.name}
                                                onChange={e => setReferrals(prev => prev.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))}
                                                placeholder="Full name"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                            <input
                                                value={ref.email}
                                                onChange={e => setReferrals(prev => prev.map((r, idx) => idx === i ? { ...r, email: e.target.value } : r))}
                                                placeholder="Phone number"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                            <input
                                                value={ref.linkedin}
                                                onChange={e => setReferrals(prev => prev.map((r, idx) => idx === i ? { ...r, linkedin: e.target.value } : r))}
                                                placeholder="LinkedIn"
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400 text-sm transition-colors"
                                            />
                                            <textarea
                                                value={ref.notes}
                                                onChange={e => setReferrals(prev => prev.map((r, idx) => idx === i ? { ...r, notes: e.target.value } : r))}
                                                placeholder="Additional notes (optional)"
                                                rows={2}
                                                className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400 text-sm transition-colors resize-none"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={handleSaveReferrals}
                                disabled={savingReferrals}
                                className="mt-6 w-full sm:w-auto sm:px-10 flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-3.5 rounded-xl transition-all text-sm"
                            >
                                {savingReferrals ? (
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : referralsSaved ? (
                                    <><CheckCircleIcon className="w-4 h-4" /> Saved</>
                                ) : 'Save referrals'}
                            </button>
                        </div>
                    )}

                    {/* === EVENTS === */}
                    {activeSection === 'events' && (
                        <div className="space-y-4">
                            {loadingEvents ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6 animate-pulse h-32" />
                                ))
                            ) : events.length === 0 ? (
                                <div className="text-center py-20 text-zinc-400">No events yet.</div>
                            ) : events.map(event => (
                                <div key={event.id}
                                    className={`rounded-2xl border overflow-hidden flex flex-col sm:flex-row transition-all ${
                                        event.upcoming
                                            ? 'bg-gradient-to-br from-gold-400/10 via-zinc-900 to-zinc-900 border-gold-400/30'
                                            : 'bg-zinc-900/60 border-zinc-700'
                                    }`}>
                                    {event.images?.length > 0 ? (
                                        <EventImageGrid
                                            images={event.images ?? []}
                                            onOpen={index => setLightbox({ images: event.images, index })}
                                        />
                                    ) : (
                                        <div className="hidden sm:flex w-36 shrink-0 bg-zinc-900 items-center justify-center">
                                            <PhotoIcon className="w-6 h-6 text-zinc-600" />
                                        </div>
                                    )}
                                    <div className="flex-1 px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-6 min-w-0">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <div className="font-semibold text-zinc-950 text-sm">{event.title}</div>
                                                {event.upcoming && (
                                                    <span className="text-[10px] font-bold bg-gold-400 text-zinc-950 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                                        <SparklesIcon className="w-2.5 h-2.5" /> Upcoming
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${event.type === 'In-person' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-gold-300'}`}>
                                                    {event.type}
                                                </span>
                                                {event.images?.length > 1 && (
                                                    <span className="text-[10px] text-zinc-400">{event.images.length} photos</span>
                                                )}
                                            </div>
                                            {event.description && (
                                                <p className="text-xs text-zinc-400 mb-2 whitespace-pre-wrap">{event.description}</p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                                                <span className="flex items-center gap-1">
                                                    <CalendarIcon className="w-3 h-3" />
                                                    {formatEventDate(event.date)}
                                                </span>
                                                {event.location && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPinIcon className="w-3 h-3" />
                                                        {event.location}
                                                    </span>
                                                )}
                                                {event.attendees > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <UsersIcon className="w-3 h-3" />
                                                        {event.attendees} attendees
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* === PROFILE === */}
                    {activeSection === 'profile' && self && (
                        <div className="max-w-2xl space-y-6">
                            {/* Account card */}
                            <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
                                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Account</div>
                                <div className="flex items-center gap-4">
                                    <label className="relative group cursor-pointer shrink-0">
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                                        <Avatar url={self.avatar_url} name={self.name} className="w-14 h-14" textClass="text-lg" />
                                        <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {uploadingAvatar
                                                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                : <PhotoIcon className="w-4 h-4 text-white" />}
                                        </div>
                                    </label>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-white text-sm">{self.name}</div>
                                        <div className="text-zinc-400 text-xs mt-0.5">{self.email}</div>
                                        {avatarError && <div className="text-red-400 text-xs mt-1">{avatarError}</div>}
                                    </div>
                                    <div className="shrink-0 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                                        ● Member
                                    </div>
                                </div>
                            </div>

                            <EmailChangeCard member={self} onSave={updated => {
                                setSelf(u => u ? { ...u, ...updated } : u);
                                setMembers(prev => prev.map(m => m.id === self.id ? { ...m, ...updated } : m));
                            }} />

                            {/* Edit form */}
                            <ProfileSection member={self} onSave={updated => {
                                setSelf(u => u ? { ...u, ...updated } : u);
                                setMembers(prev => prev.map(m => m.id === self.id ? { ...m, ...updated } : m));
                            }} />

                            {/* Membership card */}
                            <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
                                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-5">Membership</div>
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <span className="text-zinc-400 text-sm">Pathway</span>
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            {(self.categories ?? []).length > 0
                                                ? (self.categories ?? []).map(id => <CategoryBadge key={id} id={id} size="md" />)
                                                : <span className="text-zinc-500 text-sm">Not set</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-zinc-400 text-sm">Robert College class</span>
                                        <span className="text-white text-sm font-medium">{self.graduation_year ?? '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-zinc-400 text-sm">Member since</span>
                                        <span className="text-white text-sm font-medium">
                                            {new Date(self.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <p className="pt-3 border-t border-zinc-800 text-xs text-zinc-500">
                                        To change your pathway, email the RCCEB team.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Image lightbox */}
            {lightbox && (
                <EventLightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
            )}

            {/* Member detail modal */}
            {selectedMember && (
                <MemberModal
                    member={selectedMember}
                    onClose={() => setSelectedMember(null)}
                    isSelf={selectedMember.id === self?.id}
                    onEdit={() => { setSelectedMember(null); setProfileOpen(true); }}
                />
            )}

            {/* Profile edit modal */}
            {profileOpen && self && (
                <ProfileModal member={self} onClose={() => setProfileOpen(false)} onSave={updated => {
                    setSelf(u => u ? { ...u, ...updated } : u);
                    setMembers(prev => prev.map(m => m.id === self.id ? { ...m, ...updated } : m));
                }} />
            )}
        </div>
    );
}

function EmailChangeCard({ member, onSave }: { member: SelfMember; onSave: (updated: Partial<SelfMember>) => void }) {
    const [editing, setEditing] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    function reset() {
        setEditing(false);
        setNewEmail('');
        setCodeSent(false);
        setCode('');
        setError('');
    }

    async function sendCode() {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/members/email-change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newEmail: newEmail.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not send code.');
            setCodeSent(true);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not send code.');
        } finally {
            setBusy(false);
        }
    }

    async function confirmCode() {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/members/email-change/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Invalid or expired code.');
            onSave({ email: data.email });
            reset();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Invalid or expired code.');
        } finally {
            setBusy(false);
        }
    }

    if (!editing) {
        return (
            <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
                <div>
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Sign-in email</div>
                    <div className="text-zinc-950 text-sm">{member.email}</div>
                </div>
                <button
                    onClick={() => setEditing(true)}
                    className="text-xs font-bold uppercase tracking-wider text-gold-400 hover:text-white transition-colors shrink-0"
                >
                    Change
                </button>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-4">Change sign-in email</div>
            {!codeSent ? (
                <div className="space-y-3">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={e => setNewEmail(e.target.value)}
                        placeholder="new-email@example.com"
                        className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3.5 py-2.5 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm"
                    />
                    {error && <p className="text-red-400 text-xs">{error}</p>}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={sendCode}
                            disabled={busy || !newEmail.trim()}
                            className="flex items-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 px-5 rounded-xl transition-all text-sm"
                        >
                            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Send code'}
                        </button>
                        <button onClick={reset} className="text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-zinc-400 text-xs">
                        We sent a code to <span className="text-white">{newEmail.trim()}</span>. Enter it below to confirm.
                    </p>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3.5 py-2.5 text-zinc-950 text-center tracking-[0.4em] font-bold placeholder:tracking-normal placeholder:font-normal placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm"
                    />
                    {error && <p className="text-red-400 text-xs">{error}</p>}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={confirmCode}
                            disabled={busy || code.trim().length < 6}
                            className="flex items-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 px-5 rounded-xl transition-all text-sm"
                        >
                            {busy ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirm'}
                        </button>
                        <button onClick={reset} className="text-xs font-medium text-zinc-400 hover:text-white transition-colors">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProfileSection({ member, onSave }: { member: SelfMember; onSave: (updated: Partial<SelfMember>) => void }) {
    const [form, setForm] = useState({
        name: member.name || '',
        location: member.location || '',
        phone: member.phone || '',
        linkedin: member.linkedin || '',
        github: member.github || '',
        member_types: member.member_types || '',
        bio: member.bio || '',
        occupation_link: member.occupation_link || '',
        twitter: member.twitter || '',
        instagram: member.instagram || '',
        favorite_resource: member.favorite_resource || '',
        graduation_year: member.graduation_year ? String(member.graduation_year) : '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

    async function handleSave() {
        setSaving(true);
        try {
            const res = await fetch('/api/members/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const { member: updated } = await res.json();
            onSave(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    }

    const fields: { key: string; label: string; placeholder: string; textarea?: boolean }[] = [
        { key: 'name', label: 'Full Name', placeholder: 'Your name' },
        { key: 'graduation_year', label: 'RC Graduation Year', placeholder: `e.g. ${FIRST_GRADUATION_YEAR + 55}` },
        { key: 'location', label: 'Location', placeholder: 'Istanbul, Turkey' },
        { key: 'phone', label: 'Phone', placeholder: '+90 555 000 00 00' },
        { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/...' },
        { key: 'github', label: 'GitHub', placeholder: 'github.com/...' },
        { key: 'bio', label: 'Current Role', placeholder: 'Founder & CEO at …, Partner at …', textarea: true },
        { key: 'occupation_link', label: 'Company / Fund Website (optional)', placeholder: 'yourcompany.com' },
        { key: 'twitter', label: 'Area of Interest', placeholder: 'Fintech, climate, B2B SaaS…' },
        { key: 'instagram', label: 'Education After RC', placeholder: 'BSc Economics, Boğaziçi; MBA, INSEAD…' },
        { key: 'favorite_resource', label: 'Favorite Read / Video / Person / Source', placeholder: 'Zero to One, Lex Fridman…', textarea: true },
    ];

    return (
        <div className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-6">
            <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-5">Edit Profile</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                    <BackgroundChipSelector value={form.member_types} onChange={value => update('member_types', value)} />
                </div>
                {fields.map(field => (
                    <div key={field.key} className={field.textarea ? 'sm:col-span-2' : ''}>
                        <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{field.label}</label>
                        {field.textarea ? (
                            <textarea
                                value={(form as Record<string, string>)[field.key]}
                                onChange={e => update(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                rows={3}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm resize-none transition-colors"
                            />
                        ) : (
                            <input
                                value={(form as Record<string, string>)[field.key]}
                                onChange={e => update(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm transition-colors"
                            />
                        )}
                    </div>
                ))}
            </div>
            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-5 flex items-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 px-6 rounded-xl transition-all text-sm"
            >
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><CheckCircleIcon className="w-4 h-4" /> Saved</> : 'Save changes'}
            </button>
        </div>
    );
}

function ProfileModal({ member, onClose, onSave }: { member: SelfMember; onClose: () => void; onSave: (updated: Partial<SelfMember>) => void }) {
    const [form, setForm] = useState({
        name: member.name || '',
        location: member.location || '',
        phone: member.phone || '',
        linkedin: member.linkedin || '',
        github: member.github || '',
        member_types: member.member_types || '',
        bio: member.bio || '',
        occupation_link: member.occupation_link || '',
        twitter: member.twitter || '',
        instagram: member.instagram || '',
        favorite_resource: member.favorite_resource || '',
        graduation_year: member.graduation_year ? String(member.graduation_year) : '',
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

    async function handleSave() {
        setSaving(true);
        try {
            const res = await fetch('/api/members/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const { member: updated } = await res.json();
            onSave(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    }

    const fields: { key: string; label: string; placeholder: string; textarea?: boolean }[] = [
        { key: 'name', label: 'Full Name', placeholder: 'Your name' },
        { key: 'graduation_year', label: 'RC Graduation Year', placeholder: `e.g. ${FIRST_GRADUATION_YEAR + 55}` },
        { key: 'location', label: 'Location', placeholder: 'Istanbul, Turkey' },
        { key: 'phone', label: 'Phone', placeholder: '+90 555 000 00 00' },
        { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/...' },
        { key: 'github', label: 'GitHub', placeholder: 'github.com/...' },
        { key: 'bio', label: 'Current Role', placeholder: 'Founder & CEO at …, Partner at …', textarea: true },
        { key: 'occupation_link', label: 'Company / Fund Website (optional)', placeholder: 'yourcompany.com' },
        { key: 'twitter', label: 'Area of Interest', placeholder: 'Fintech, climate, B2B SaaS…' },
        { key: 'instagram', label: 'Education After RC', placeholder: 'BSc Economics, Boğaziçi; MBA, INSEAD…' },
        { key: 'favorite_resource', label: 'Favorite Read / Video / Person / Source', placeholder: 'Zero to One, Lex Fridman…', textarea: true },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold text-white">Edit Profile</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                    <BackgroundChipSelector value={form.member_types} onChange={value => update('member_types', value)} />
                    {fields.map(field => (
                        <div key={field.key}>
                            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{field.label}</label>
                            {field.textarea ? (
                                <textarea
                                    value={(form as Record<string, string>)[field.key]}
                                    onChange={e => update(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    rows={3}
                                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3.5 py-2.5 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm resize-none"
                                />
                            ) : (
                                <input
                                    value={(form as Record<string, string>)[field.key]}
                                    onChange={e => update(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    className="w-full bg-zinc-800 border border-zinc-600 rounded-xl px-3.5 py-2.5 text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:border-gold-400/50 text-sm"
                                />
                            )}
                        </div>
                    ))}
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-5 w-full flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-400/90 disabled:opacity-50 text-zinc-950 font-semibold py-3 rounded-xl transition-all text-sm"
                >
                    {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : saved ? <><CheckCircleIcon className="w-4 h-4" /> Saved</> : 'Save changes'}
                </button>
                <div className="mt-4 pt-4 border-t border-zinc-700">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Account</div>
                    <div className="text-sm text-zinc-300">{member.email}</div>
                </div>
            </div>
        </div>
    );
}

export default function DashboardClient() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-gold-400/30 border-t-gold-400 animate-spin" />
            </div>
        }>
            <DashboardContent />
        </Suspense>
    );
}
