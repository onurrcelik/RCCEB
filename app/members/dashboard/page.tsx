import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';
import { getMemberFromServerCookies } from '@/app/lib/member-server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const member = await getMemberFromServerCookies();

    if (!member) {
        redirect('/members/login');
    }

    if (!member.onboarding_complete) {
        redirect('/members/onboarding');
    }

    return <DashboardClient />;
}
