import { redirect } from 'next/navigation';

export default function MembersRoot() {
    redirect('/members/dashboard');
}
