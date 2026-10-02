'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3Icon, UsersIcon, ChartBarIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon, CheckBadgeIcon, CalendarDaysIcon, ArrowsRightLeftIcon, ClipboardDocumentListIcon, PencilSquareIcon, CheckIcon, XMarkIcon, PlusIcon, LinkIcon, ChevronRightIcon, GiftIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { RccebLogo } from '@/app/components/ui/RccebLogo';

type NavItem = { href: string; label: string; icon: typeof UsersIcon };

const MAIN_NAV: NavItem[] = [
    { href: '/admin/applications', label: 'Applications', icon: UsersIcon },
    { href: '/admin/members', label: 'Members', icon: CheckBadgeIcon },
    { href: '/admin/attendance', label: 'Attendance', icon: ClipboardDocumentListIcon },
    { href: '/admin/matches', label: 'Matches', icon: ArrowsRightLeftIcon },
    { href: '/admin/events', label: 'Events', icon: CalendarDaysIcon },
    { href: '/admin/links', label: 'Links', icon: LinkIcon },
    { href: '/admin/perks', label: 'Perks', icon: GiftIcon },
    { href: '/admin/settings', label: 'Settings', icon: Cog6ToothIcon },
];

// Everything that isn't part of the day-to-day loop, tucked behind a collapsed
// "Other" heading so the sidebar stays short.
const OTHER_NAV: NavItem[] = [
    { href: '/admin/companies', label: 'Companies', icon: BuildingOffice2Icon },
    { href: '/admin/analytics', label: 'Analytics', icon: ChartBarIcon },
];

const OTHER_OPEN_KEY = 'admin-nav-other-open';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [hidden, setHidden] = useState<string[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [otherOpen, setOtherOpen] = useState(false);
    // Phones get a top bar and a slide-in menu instead of the fixed sidebar (md and up
    // is unchanged). The menu closes whenever you land on a new page.
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => { setMenuOpen(false); }, [pathname]);
    useEffect(() => {
        if (!menuOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [menuOpen]);

    // Remember the Other section per browser, but always open it when the page you're
    // on lives inside it — otherwise the sidebar wouldn't show where you are.
    useEffect(() => {
        const inOther = OTHER_NAV.some(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
        let stored: string | null = null;
        try { stored = localStorage.getItem(OTHER_OPEN_KEY); } catch { /* private mode */ }
        setOtherOpen(inOther || stored === 'open');
    }, [pathname]);

    const toggleOther = () => {
        setOtherOpen(open => {
            const next = !open;
            try { localStorage.setItem(OTHER_OPEN_KEY, next ? 'open' : 'closed'); } catch { /* private mode */ }
            return next;
        });
    };

    // Load saved hidden-nav preferences from the server (follows you across devices).
    useEffect(() => {
        fetch('/api/admin/nav-prefs')
            .then(res => res.ok ? res.json() : { hidden: [] })
            .then(data => { if (Array.isArray(data.hidden)) setHidden(data.hidden); })
            .catch(() => { /* fall back to showing everything */ })
            .finally(() => setLoaded(true));
    }, []);

    // Persist to the server. Optimistically update the UI, then save.
    const persist = (next: string[]) => {
        setHidden(next);
        fetch('/api/admin/nav-prefs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hidden: next }),
        }).catch(() => { /* change stays for this session even if save fails */ });
    };

    const hideItem = (href: string) => persist([...hidden, href]);
    const restoreItem = (href: string) => persist(hidden.filter(h => h !== href));

    const handleLogout = async () => {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'admin' }),
        }).catch(() => {});
        window.location.href = '/admin/login';
    };

    const visibleOtherCount = OTHER_NAV.filter(item => !hidden.includes(item.href)).length;

    const renderItem = ({ href, label, icon: Icon }: NavItem) => {
        const isHidden = hidden.includes(href);

        // Outside edit mode, hidden items are not rendered.
        if (isHidden && !editing) return null;

        const active = pathname === href;

        // In edit mode, render a non-navigating row with a hide/restore control.
        if (editing) {
            return (
                <div
                    key={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium ${
                        isHidden ? 'text-slate-300' : 'text-slate-500'
                    }`}
                >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className={`flex-1 truncate ${isHidden ? 'line-through' : ''}`}>{label}</span>
                    {isHidden ? (
                        <button
                            onClick={() => restoreItem(href)}
                            title="Restore"
                            className="p-1 rounded-md text-slate-400 hover:text-brand-blue-500 hover:bg-brand-blue-500/10 transition-all"
                        >
                            <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                    ) : (
                        <button
                            onClick={() => hideItem(href)}
                            title="Remove from menu"
                            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                            <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            );
        }

        return (
            <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    active
                        ? 'bg-brand-blue-500/10 text-brand-blue-500'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
            >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
            </Link>
        );
    };

    const sidebarContent = (inDrawer = false) => (
        <>
                <div className={`px-6 py-6 border-b border-slate-100 flex items-start justify-between ${inDrawer ? 'pr-16' : ''}`}>
                    <div>
                        <RccebLogo tone="light" size={30} />
                        <div className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em] mt-2">Admin</div>
                    </div>
                    <button
                        onClick={() => setEditing(e => !e)}
                        title={editing ? 'Done editing menu' : 'Edit menu'}
                        className={`p-1.5 rounded-lg transition-all ${
                            editing
                                ? 'bg-brand-blue-500 text-white'
                                : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                    >
                        {editing ? <CheckIcon className="w-4 h-4" /> : <PencilSquareIcon className="w-4 h-4" />}
                    </button>
                </div>

                <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
                    {/* Wait for server prefs so a hidden tab never flashes on load. */}
                    {loaded && MAIN_NAV.map(renderItem)}

                    {loaded && (visibleOtherCount > 0 || editing) && (
                        <div className="pt-3">
                            <button
                                onClick={toggleOther}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <ChevronRightIcon className={`w-3 h-3 shrink-0 transition-transform ${otherOpen || editing ? 'rotate-90' : ''}`} />
                                <span className="flex-1 text-left">Other</span>
                                {!otherOpen && !editing && <span className="text-slate-300">{visibleOtherCount}</span>}
                            </button>
                            {(otherOpen || editing) && (
                                <div className="mt-0.5 space-y-0.5">
                                    {OTHER_NAV.map(renderItem)}
                                </div>
                            )}
                        </div>
                    )}
                </nav>

                <div className="px-3 py-3 border-t border-slate-100">
                    {editing && (
                        <div className="px-3 pb-2 text-[10px] text-slate-400 leading-relaxed">
                            Removed items are hidden from the menu. Tap <span className="font-semibold text-slate-500">+</span> to bring one back.
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 transition-all w-full"
                    >
                        <ArrowRightOnRectangleIcon className="w-4 h-4 shrink-0" />
                        Logout
                    </button>
                </div>
        </>
    );

    return (
        <div className="min-h-screen bg-cream flex">
            {/* Sidebar (md and up) */}
            <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-slate-200 flex-col fixed h-screen z-20">
                {sidebarContent()}
            </aside>

            {/* Phone: top bar + slide-in menu */}
            <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between bg-white/95 backdrop-blur border-b border-slate-200 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
                <div className="flex items-center gap-2">
                    <RccebLogo tone="light" size={26} />
                    <span className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em]">Admin</span>
                </div>
                <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100">
                    <Bars3Icon className="w-6 h-6" />
                </button>
            </div>
            {menuOpen && (
                <div className="md:hidden fixed inset-0 z-50" onClick={() => setMenuOpen(false)}>
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
                    <aside
                        className="absolute inset-y-0 left-0 w-[78vw] max-w-xs bg-white shadow-xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                        {sidebarContent(true)}
                    </aside>
                </div>
            )}

            {/* Main content */}
            <main className="flex-1 min-w-0 md:ml-56 min-h-screen pt-[calc(4.25rem+env(safe-area-inset-top))] md:pt-0">
                {children}
            </main>
        </div>
    );
}
