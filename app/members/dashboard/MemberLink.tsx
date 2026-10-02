'use client';

import { createContext, useContext, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

// Any member's name or photo anywhere in the portal opens their member card. The
// dashboard provides the opener (it owns the card modal and the directory list), so
// sections only need the member's id.
export const OpenMemberContext = createContext<((memberId: string) => void) | null>(null);

export function useOpenMember() {
    return useContext(OpenMemberContext);
}

// A span with button behaviour rather than a <button>: names often sit inside a row or
// card that is itself a button, and buttons can't be nested. It stops the click from
// also toggling that row.
export function MemberLink({ memberId, children, className = '' }: { memberId: string | null | undefined; children: ReactNode; className?: string }) {
    const openMember = useOpenMember();
    if (!openMember || !memberId) return <span className={className}>{children}</span>;

    const open = (event: MouseEvent | KeyboardEvent) => {
        event.preventDefault();
        event.stopPropagation();
        openMember(memberId);
    };

    return (
        <span
            role="button"
            tabIndex={0}
            onClick={open}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') open(event); }}
            className={`cursor-pointer transition-colors hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 rounded ${className}`}
        >
            {children}
        </span>
    );
}
