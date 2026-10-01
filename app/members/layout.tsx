import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'RCCEB Members',
    description: 'The RCCEB member portal.',
    robots: 'noindex',
};

export default function MembersLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
