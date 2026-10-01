'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon, ArrowsRightLeftIcon, EnvelopeIcon, PlayIcon, CheckCircleIcon, UsersIcon, TrashIcon, PencilIcon, PlusIcon, XMarkIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { isMatchEligible } from '@/app/lib/categories';

type MemberStub = { name: string; email: string } | null;
type MemberOption = { id: string; name: string; email: string; onboarding_complete: boolean | null; is_past_member: boolean | null };

type MatchResponse = {
    member_id: string;
    opted_in: boolean | null;
    confirmed_met: boolean | null;
    not_met_reason: string | null;
    met_rating: number | null;
    feedback_note: string | null;
    member: MemberStub;
};

type Match = {
    id: string;
    member1_id: string;
    member2_id: string;
    opener_member_id: string | null;
    email_sent: boolean;
    admin_note: string | null;
    admin_note_updated_at: string | null;
    member1: MemberStub;
    member2: MemberStub;
    duplicate_previous_matches: { match_id: string; round_id: string; week_of: string | null }[];
};

type Round = {
    id: string;
    week_of: string;
    status: 'open' | 'matched' | 'closed';
    created_at: string;
    responses: MatchResponse[];
    matches: Match[];
};

function VoteBadge({ value }: { value: boolean | null }) {
    if (value === true)  return <span className="text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">met</span>;
    if (value === false) return <span className="text-[10px] font-bold text-red-400 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">no</span>;
    return <span className="text-[10px] font-bold text-slate-300 bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5">—</span>;
}

const NOT_MET_REASON_LABELS: Record<string, string> = {
    no_contact: 'Never connected',
    no_schedule: 'Messaged, never scheduled',
    fell_through: 'Scheduled, fell through',
    no_time: 'No time this week',
};

// What each side said on the "did you meet?" follow-up: stars + "how was it?" after a yes,
// reason + note after a no. Renders nothing for members who skipped it.
function MemberFeedback({ response }: { response: MatchResponse | undefined }) {
    if (!response) return null;
    const { confirmed_met, met_rating, not_met_reason, feedback_note } = response;
    const reason = confirmed_met === false && not_met_reason ? NOT_MET_REASON_LABELS[not_met_reason] ?? not_met_reason : null;
    const rating = confirmed_met === true ? met_rating : null;
    if (!rating && !reason && !feedback_note) return null;
    return (
        <div className="mt-1.5 text-xs text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2">
            <span className="font-semibold text-slate-700">{response.member?.name?.split(' ')[0] || 'Member'}:</span>{' '}
            {rating != null && (
                <span className="text-amber-500 tracking-tight" title={`${rating} / 5`}>
                    {'★'.repeat(rating)}<span className="text-slate-200">{'★'.repeat(5 - rating)}</span>
                </span>
            )}
            {reason && <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-full px-1.5 py-0.5">{reason}</span>}
            {feedback_note && <span className="block mt-1 whitespace-pre-wrap">{feedback_note}</span>}
        </div>
    );
}

function OpenerBadge() {
    return (
        <span
            className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 whitespace-nowrap"
            title="Randomly chosen to reach out first"
        >
            reaches out
        </span>
    );
}

function StatusBadge({ status }: { status: Round['status'] }) {
    const map = {
        open: 'text-amber-600 bg-amber-50 border-amber-100',
        matched: 'text-green-600 bg-green-50 border-green-100',
        closed: 'text-slate-400 bg-slate-50 border-slate-200',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${map[status]}`}>
            {status}
        </span>
    );
}

function formatDuplicateWeeks(match: Match) {
    return match.duplicate_previous_matches
        .map(previous => previous.week_of
            ? new Date(previous.week_of + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'an earlier round')
        .join(', ');
}

function getUnmatchedOptIns(round: Round) {
    if (round.status === 'open') return [];
    const pairedMemberIds = new Set(round.matches.flatMap(match => [match.member1_id, match.member2_id]));
    const pairedMemberNames = new Set(
        round.matches.flatMap(match => [match.member1?.name, match.member2?.name]).filter(Boolean)
    );
    return round.responses.filter(response =>
        response.opted_in &&
        !pairedMemberIds.has(response.member_id) &&
        !pairedMemberNames.has(response.member?.name ?? '')
    );
}

function MatchModal({
    mode, roundId, existingMatch, prefillMember1Id, members, onClose, onSave,
}: {
    mode: 'create' | 'edit';
    roundId: string;
    existingMatch?: { id: string; member1_id: string; member2_id: string; email_sent: boolean };
    prefillMember1Id?: string;
    members: MemberOption[];
    onClose: () => void;
    onSave: () => void;
}) {
    const [member1Id, setMember1Id] = useState(existingMatch?.member1_id || prefillMember1Id || '');
    const [member2Id, setMember2Id] = useState(existingMatch?.member2_id || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!member1Id || !member2Id || member1Id === member2Id) {
            setError('Select two different members.');
            return;
        }
        const changed = existingMatch && (existingMatch.member1_id !== member1Id || existingMatch.member2_id !== member2Id);
        if (changed && existingMatch.email_sent &&
            !window.confirm('The intro email for this pair was already sent. Saving won\'t email anyone again, and if the person reaching out first is no longer in the pair, a new one is picked at random. Save anyway?')) {
            return;
        }
        setSaving(true);
        setError('');
        try {
            let res: Response;
            if (mode === 'create') {
                res = await fetch('/api/admin/matches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create_match', round_id: roundId, member1_id: member1Id, member2_id: member2Id }),
                });
            } else {
                res = await fetch('/api/admin/matches', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ match_id: existingMatch!.id, member1_id: member1Id, member2_id: member2Id }),
                });
            }
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); return; }
            onSave();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">
                        {mode === 'create' ? 'Create Match Manually' : 'Edit Match'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {(['member1', 'member2'] as const).map((side, idx) => {
                        const val = idx === 0 ? member1Id : member2Id;
                        const other = idx === 0 ? member2Id : member1Id;
                        const setVal = idx === 0 ? setMember1Id : setMember2Id;
                        return (
                            <div key={side}>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                    Member {idx + 1}
                                </label>
                                <select
                                    value={val}
                                    onChange={e => setVal(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-brand-blue-500 bg-white"
                                >
                                    <option value="">Select member…</option>
                                    {members.filter(m => m.id !== other).map(m => (
                                        <option key={m.id} value={m.id}>{m.name} — {m.email}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving || !member1Id || !member2Id || member1Id === member2Id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-blue-500 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl hover:bg-brand-blue-600 disabled:opacity-40 transition-all"
                    >
                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : mode === 'create' ? 'Create' : 'Save'}
                    </button>
                    <button onClick={onClose} className="px-4 text-[11px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-widest transition-all">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function MatchesPage() {
    const [rounds, setRounds] = useState<Round[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [running, setRunning] = useState(false);
    const [sendingEmails, setSendingEmails] = useState(false);
    const [notifying, setNotifying] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
    const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
    const [matchModal, setMatchModal] = useState<{
        mode: 'create' | 'edit';
        roundId: string;
        existingMatch?: { id: string; member1_id: string; member2_id: string; email_sent: boolean };
        prefillMember1Id?: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);
    const [dragSource, setDragSource] = useState<{ matchId: string; memberId: string; position: 'member1' | 'member2' } | null>(null);
    const [dragOver, setDragOver] = useState<{ matchId: string; position: 'member1' | 'member2' } | null>(null);
    const [markingMet, setMarkingMet] = useState<string | null>(null);
    const [noteEditor, setNoteEditor] = useState<{ matchId: string; text: string } | null>(null);
    const [savingNote, setSavingNote] = useState(false);
    const [showAddOptIn, setShowAddOptIn] = useState(false);
    const [lateOptInMemberId, setLateOptInMemberId] = useState('');
    const [addingOptIn, setAddingOptIn] = useState(false);

    const copyWhatsApp = () => {
        const link = `${window.location.origin}/members/dashboard?section=match`;
        navigator.clipboard.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    };

    const flash = (text: string, ok: boolean) => {
        setMessage({ text, ok });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchRounds = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/matches');
            setRounds(await res.json());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRounds();
        fetch('/api/admin/members')
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setAllMembers(d.map((m: MemberOption) => ({ id: m.id, name: m.name, email: m.email, onboarding_complete: m.onboarding_complete, is_past_member: m.is_past_member }))); });
    }, []);

    const currentRound = rounds[0] ?? null;
    const hasOpenRound = currentRound?.status === 'open';
    const hasPendingEmails = currentRound?.matches.some(m => !m.email_sent) && (currentRound?.matches.length ?? 0) > 0;

    const createRound = async () => {
        setCreating(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_round' }),
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error || 'Failed', false); return; }
            flash('Round created — everyone in the pool is opted in. Notify them so anyone who can\'t make it can opt out.', true);
            await fetchRounds();
        } finally {
            setCreating(false);
        }
    };

    const runMatch = async () => {
        if (!window.confirm('Run the match now? This will create pairs but will NOT send emails yet. You can review and edit pairs before sending.')) return;
        setRunning(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'run_match' }),
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error || 'Failed', false); return; }
            const skipped = data.unmatched?.length ? ` (${data.unmatched.length} unmatched)` : '';
            flash(`${data.pairs} pairs created.${skipped} Review and edit pairs, then click "Send Intro Emails" when ready.`, true);
            await fetchRounds();
        } finally {
            setRunning(false);
        }
    };

    const sendIntroEmails = async (roundId: string) => {
        if (!window.confirm('Send intro emails to all matched pairs that haven\'t received one yet?')) return;
        setSendingEmails(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'send_intro_emails', round_id: roundId }),
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error || 'Failed to send emails', false); return; }
            if (data.message) { flash(data.message, true); return; }
            const failNote = data.failed ? ` — ${data.failed} failed! Re-click Send to retry.` : '';
            flash(`${data.sent} intro emails sent.${failNote}`, !data.failed);
            await fetchRounds();
        } finally {
            setSendingEmails(false);
        }
    };

    const swapMembers = async (
        targetMatchId: string,
        targetPosition: 'member1' | 'member2',
        targetMemberId: string,
    ) => {
        if (!dragSource || !currentRound) return;
        if (dragSource.matchId === targetMatchId && dragSource.position === targetPosition) {
            setDragSource(null); setDragOver(null); return;
        }
        const srcMatch = currentRound.matches.find(m => m.id === dragSource.matchId)!;
        const tgtMatch = currentRound.matches.find(m => m.id === targetMatchId)!;
        // These people were already emailed their match and who reaches out first — moving
        // them silently leaves that email wrong.
        if ((srcMatch.email_sent || tgtMatch.email_sent) &&
            !window.confirm('The intro email for this pair was already sent. Swapping won\'t email anyone again, and a new person is picked at random to reach out first. Swap anyway?')) {
            setDragSource(null); setDragOver(null); return;
        }

        const newSrc = { member1_id: srcMatch.member1_id, member2_id: srcMatch.member2_id };
        const newTgt = { member1_id: tgtMatch.member1_id, member2_id: tgtMatch.member2_id };

        if (dragSource.position === 'member1') newSrc.member1_id = targetMemberId;
        else newSrc.member2_id = targetMemberId;
        if (targetPosition === 'member1') newTgt.member1_id = dragSource.memberId;
        else newTgt.member2_id = dragSource.memberId;

        const isSame = dragSource.matchId === targetMatchId;
        const patches = isSame
            ? [fetch('/api/admin/matches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: dragSource.matchId, ...newSrc }) })]
            : [
                fetch('/api/admin/matches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: dragSource.matchId, ...newSrc }) }),
                fetch('/api/admin/matches', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_id: targetMatchId, ...newTgt }) }),
            ];

        const results = await Promise.all(patches);
        if (results.some(r => !r.ok)) flash('Failed to swap members.', false);
        else await fetchRounds();
        setDragSource(null); setDragOver(null);
    };

    const deleteMatch = async (matchId: string) => {
        if (!window.confirm('Delete this match pair?')) return;
        const res = await fetch(`/api/admin/matches?match_id=${matchId}`, { method: 'DELETE' });
        if (!res.ok) { flash('Failed to delete match.', false); return; }
        flash('Match deleted.', true);
        await fetchRounds();
    };

    const markMet = async (matchId: string, met: boolean | null) => {
        setMarkingMet(matchId);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_match_met', match_id: matchId, met }),
            });
            if (!res.ok) { flash('Failed to update.', false); return; }
            await fetchRounds();
        } finally {
            setMarkingMet(null);
        }
    };

    const saveNote = async () => {
        if (!noteEditor) return;
        setSavingNote(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_match_note', match_id: noteEditor.matchId, note: noteEditor.text }),
            });
            if (!res.ok) { flash('Failed to save note.', false); return; }
            setNoteEditor(null);
            await fetchRounds();
        } finally {
            setSavingNote(false);
        }
    };

    const handleAddOptIn = async () => {
        if (!currentRound || !lateOptInMemberId) return;
        setAddingOptIn(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_opt_in', round_id: currentRound.id, member_id: lateOptInMemberId }),
            });
            if (!res.ok) { flash('Failed to add opt-in.', false); return; }
            flash('Member added to opt-ins.', true);
            setLateOptInMemberId('');
            setShowAddOptIn(false);
            await fetchRounds();
        } finally {
            setAddingOptIn(false);
        }
    };

    const removeOptIn = async (memberId: string, name: string) => {
        if (!currentRound) return;
        if (!window.confirm(`Remove ${name} from this round's opt-ins? They'll move to Skipping and won't be matched.`)) return;
        const res = await fetch('/api/admin/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove_opt_in', round_id: currentRound.id, member_id: memberId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { flash(data.error || 'Failed to remove opt-in.', false); return; }
        flash(`${name} removed from opt-ins.`, true);
        await fetchRounds();
    };

    const notifyAllMembers = async (roundId: string) => {
        if (!window.confirm('Email everyone in the 1-on-1 pool that the round is open and they are in, with a link to opt out? Past members and anyone still onboarding are skipped.')) return;
        setNotifying(true);
        try {
            const res = await fetch('/api/admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'notify_round', round_id: roundId }),
            });
            const data = await res.json();
            if (!res.ok) { flash(data.error || 'Failed to send notifications', false); return; }
            const failNote = data.failed ? ` (${data.failed} failed)` : '';
            flash(`Notified ${data.sent} members.${failNote}`, !data.failed);
        } finally {
            setNotifying(false);
        }
    };

    const deleteRound = async (roundId: string) => {
        if (!window.confirm('Delete this entire round and all its matches and responses? This cannot be undone.')) return;
        const res = await fetch(`/api/admin/matches?round_id=${roundId}`, { method: 'DELETE' });
        if (!res.ok) { flash('Failed to delete round.', false); return; }
        flash('Round deleted.', true);
        await fetchRounds();
    };

    // Past members may still carry a response from before they were retired — keep them
    // out of the current round's lists (pairs already made stay as history).
    const pastMemberIds = useMemo(
        () => new Set(allMembers.filter(m => m.is_past_member).map(m => m.id)),
        [allMembers],
    );
    const isCurrent = (r: MatchResponse) => !pastMemberIds.has(r.member_id);
    const optIns = currentRound?.responses.filter(r => r.opted_in && isCurrent(r)) || [];
    const optOuts = currentRound?.responses.filter(r => r.opted_in === false && isCurrent(r)) || [];
    const duplicateMatches = currentRound?.matches.filter(m => m.duplicate_previous_matches.length > 0) || [];
    const unmatchedOptIns = currentRound ? getUnmatchedOptIns(currentRound).filter(isCurrent) : [];

    // Members still in the weekly 1-on-1 pool (see app/lib/categories.ts) — past members
    // and unfinished onboarding don't show up in the opt-in picker or the manual match modal.
    const poolMembers = useMemo(() => allMembers.filter(isMatchEligible), [allMembers]);

    // Deduplicated member list for match modal — prefers the UUID already in opt-in responses
    // so manually created matches use the same UUID as the opt-in, keeping ID comparisons consistent.
    const matchableMembers = useMemo(() => {
        const responseIds = new Set(rounds.flatMap(r => r.responses.map(resp => resp.member_id)));
        const byEmail = new Map<string, MemberOption>();
        for (const m of poolMembers) {
            if (!byEmail.has(m.email)) {
                byEmail.set(m.email, m);
            } else if (responseIds.has(m.id)) {
                byEmail.set(m.email, m);
            }
        }
        return Array.from(byEmail.values());
    }, [poolMembers, rounds]);

    return (
        <div className="p-4 md:p-6 text-slate-700">
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none opacity-40">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-blue-500/10 blur-[120px] rounded-full" />
            </div>

            <header className="flex items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Matches</h1>
                    <span className="px-2.5 py-1 bg-white text-slate-500 text-[10px] font-bold uppercase rounded-full border border-slate-200 shadow-sm">
                        Weekly 1-on-1
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={copyWhatsApp}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-xl transition-all text-[11px] font-bold uppercase tracking-widest shadow-sm ${copied ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                        <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                        {copied ? 'Copied!' : 'Copy for WhatsApp'}
                    </button>
                    <button onClick={fetchRounds} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm group">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-blue-500' : 'text-slate-500 group-hover:text-slate-900'}`} />
                    </button>
                </div>
            </header>

            {message && (
                <div className={`mb-6 px-4 py-3 rounded-xl text-sm border ${message.ok ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-600'}`}>
                    {message.text}
                </div>
            )}

            {/* Current round */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                    <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">This Week</div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-slate-900">
                                {currentRound
                                    ? `Week of ${new Date(currentRound.week_of + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
                                    : 'No round yet'}
                            </h2>
                            {currentRound && <StatusBadge status={currentRound.status} />}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={createRound}
                            disabled={creating}
                            className="flex items-center gap-2 px-3 py-2 bg-brand-blue-500 text-white rounded-xl hover:bg-brand-blue-600 transition-all text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 shadow-sm"
                        >
                            {creating ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EnvelopeIcon className="w-3.5 h-3.5" />}
                            Create Round
                        </button>
                        {currentRound?.status === 'open' && (
                            <button
                                onClick={() => notifyAllMembers(currentRound.id)}
                                disabled={notifying}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 shadow-sm"
                            >
                                {notifying ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EnvelopeIcon className="w-3.5 h-3.5" />}
                                Notify All Members
                            </button>
                        )}
                        {hasOpenRound && optIns.length >= 2 && (
                            <button
                                onClick={runMatch}
                                disabled={running}
                                className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 shadow-sm"
                            >
                                {running ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
                                Run Match
                            </button>
                        )}
                        {hasPendingEmails && currentRound && (
                            <button
                                onClick={() => sendIntroEmails(currentRound.id)}
                                disabled={sendingEmails}
                                className="flex items-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 shadow-sm"
                            >
                                {sendingEmails ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EnvelopeIcon className="w-3.5 h-3.5" />}
                                Send Intro Emails
                            </button>
                        )}
                        {currentRound && (
                            <button
                                onClick={() => setMatchModal({ mode: 'create', roundId: currentRound.id })}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all text-[11px] font-bold uppercase tracking-widest shadow-sm"
                            >
                                <PlusIcon className="w-3.5 h-3.5" />
                                Add Match
                            </button>
                        )}
                        {currentRound && (
                            <button
                                onClick={() => deleteRound(currentRound.id)}
                                className="flex items-center gap-2 px-3 py-2 bg-white border border-red-100 text-red-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all text-[11px] font-bold uppercase tracking-widest shadow-sm"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                                Delete Round
                            </button>
                        )}
                    </div>
                </div>

                {hasOpenRound && optIns.length < 2 && (
                    <p className="text-xs text-slate-400 italic mb-5">Fewer than 2 members are in — the match can&apos;t run yet.</p>
                )}

                {duplicateMatches.length > 0 && (
                    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <div className="font-bold">Repeated pair detected</div>
                            <div className="text-xs text-amber-700">
                                {duplicateMatches.length} current pair{duplicateMatches.length === 1 ? ' has' : 's have'} already been matched before.
                            </div>
                        </div>
                    </div>
                )}

                {currentRound ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Opt-ins */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <UsersIcon className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Opted In ({optIns.length})
                                </span>
                            </div>
                            {optIns.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">Nobody is in this round.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {optIns.map(r => {
                                        const isPaired = currentRound.matches.some(m => m.member1_id === r.member_id || m.member2_id === r.member_id);
                                        return (
                                            <div key={r.member_id} className="flex items-center gap-2 text-sm text-slate-700 group">
                                                <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                                <span className="font-medium">{r.member?.name || '—'}</span>
                                                <span className="text-slate-400 text-xs">{r.member?.email}</span>
                                                {!isPaired && (
                                                    <button
                                                        onClick={() => removeOptIn(r.member_id, r.member?.name || 'this member')}
                                                        className="ml-auto p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                                                        title="Remove from opt-ins"
                                                    >
                                                        <XMarkIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Add late opt-in — available for open and matched rounds */}
                            {showAddOptIn ? (
                                <div className="mt-3 flex items-center gap-2">
                                    <select
                                        value={lateOptInMemberId}
                                        onChange={e => setLateOptInMemberId(e.target.value)}
                                        className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-blue-500 bg-white"
                                    >
                                        <option value="">Select member…</option>
                                        {poolMembers
                                            .filter(m => !optIns.some(r => r.member_id === m.id))
                                            .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <button
                                        onClick={handleAddOptIn}
                                        disabled={!lateOptInMemberId || addingOptIn}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-brand-blue-500 text-white rounded-lg disabled:opacity-40 transition-all"
                                    >
                                        {addingOptIn ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : 'Add'}
                                    </button>
                                    <button
                                        onClick={() => { setShowAddOptIn(false); setLateOptInMemberId(''); }}
                                        className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowAddOptIn(true)}
                                    className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-brand-blue-500 uppercase tracking-widest transition-all"
                                >
                                    <PlusIcon className="w-3 h-3" />
                                    Add Late Opt-In
                                </button>
                            )}
                            {optOuts.length > 0 && (
                                <div className="mt-4">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Skipping ({optOuts.length})</div>
                                    <div className="space-y-1">
                                        {optOuts.map(r => (
                                            <div key={r.member_id} className="text-sm text-slate-400">{r.member?.name || '—'}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Matches */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <ArrowsRightLeftIcon className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Pairs ({currentRound.matches.length}{unmatchedOptIns.length > 0 ? ` + ${unmatchedOptIns.length} unmatched` : ''})
                                </span>
                            </div>
                            {currentRound.matches.length === 0 && unmatchedOptIns.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">No pairs yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {currentRound.matches.map(m => {
                                        const isDuplicate = m.duplicate_previous_matches.length > 0;
                                        return (
                                            <div key={m.id} className={`flex items-center gap-1.5 text-sm group rounded-xl px-2 py-1 ${isDuplicate ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}>
                                                {(['member1', 'member2'] as const).map((pos, idx) => {
                                                    const memberId = pos === 'member1' ? m.member1_id : m.member2_id;
                                                    const member = pos === 'member1' ? m.member1 : m.member2;
                                                    const isSource = dragSource?.matchId === m.id && dragSource?.position === pos;
                                                    const isOver = dragOver?.matchId === m.id && dragOver?.position === pos && !isSource;
                                                    return (
                                                        <span key={pos} className="contents">
                                                            {idx === 1 && <span className="text-slate-300 px-0.5">×</span>}
                                                            <span
                                                                draggable
                                                                onDragStart={() => setDragSource({ matchId: m.id, memberId, position: pos })}
                                                                onDragEnd={() => { setDragSource(null); setDragOver(null); }}
                                                                onDragOver={e => { e.preventDefault(); setDragOver({ matchId: m.id, position: pos }); }}
                                                                onDrop={() => swapMembers(m.id, pos, memberId)}
                                                                className={`font-medium px-2 py-0.5 rounded-lg transition-all select-none cursor-grab active:cursor-grabbing
                                                                    ${isSource ? 'opacity-40 bg-slate-100 text-slate-500' : ''}
                                                                    ${isOver ? 'ring-2 ring-indigo-400 bg-indigo-50 text-indigo-700' : !isSource ? 'text-slate-800' : ''}
                                                                `}
                                                            >
                                                                {member?.name || '—'}
                                                            </span>
                                                            {m.opener_member_id === memberId && <OpenerBadge />}
                                                        </span>
                                                    );
                                                })}
                                                {isDuplicate && (
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700"
                                                        title={`Already matched: ${formatDuplicateWeeks(m)}`}
                                                    >
                                                        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                                        Repeat
                                                    </span>
                                                )}
                                                {m.email_sent && <CheckCircleIcon className="w-3.5 h-3.5 text-green-400 shrink-0 ml-0.5" />}
                                                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => setMatchModal({ mode: 'edit', roundId: currentRound.id, existingMatch: { id: m.id, member1_id: m.member1_id, member2_id: m.member2_id, email_sent: m.email_sent } })}
                                                        className="p-1.5 text-slate-400 hover:text-brand-blue-500 hover:bg-brand-blue-50 rounded-lg transition-all"
                                                        title="Edit match"
                                                    >
                                                        <PencilIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMatch(m.id)}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Delete match"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {unmatchedOptIns.map(response => (
                                        <div key={`unmatched-${response.member_id}`} className="flex items-center gap-1.5 text-sm group rounded-xl px-2 py-1 bg-slate-50 ring-1 ring-slate-200">
                                            <span className="font-medium px-2 py-0.5 rounded-lg text-slate-800">
                                                {response.member?.name || '—'}
                                            </span>
                                            <span className="text-slate-300 px-0.5">×</span>
                                            <span className="font-medium px-2 py-0.5 rounded-lg border border-dashed border-slate-300 text-slate-400">
                                                Blank
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                Unmatched
                                            </span>
                                            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => setMatchModal({ mode: 'create', roundId: currentRound.id, prefillMember1Id: response.member_id })}
                                                    className="p-1.5 text-slate-400 hover:text-brand-blue-500 hover:bg-brand-blue-50 rounded-lg transition-all"
                                                    title="Assign to a partner"
                                                >
                                                    <PencilIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-slate-400 italic">Click &quot;Create Round&quot; to kick off this week.</p>
                )}
            </div>

            {/* History */}
            {rounds.length > 1 && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-700">Past Rounds</h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {rounds.slice(1).map(round => {
                            const roundUnmatchedOptIns = getUnmatchedOptIns(round);
                            const confirmed = round.matches.filter(m => {
                                const r1 = round.responses.find(r => r.member_id === m.member1_id);
                                const r2 = round.responses.find(r => r.member_id === m.member2_id);
                                return r1?.confirmed_met === true || r2?.confirmed_met === true;
                            }).length;
                            const isExpanded = expandedRoundId === round.id;
                            return (
                                <div key={round.id}>
                                    <div
                                        className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/50 cursor-pointer group transition-colors"
                                        onClick={() => setExpandedRoundId(isExpanded ? null : round.id)}
                                    >
                                        <span className="text-sm font-medium text-slate-700 w-28 shrink-0">
                                            {new Date(round.week_of + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        <StatusBadge status={round.status} />
                                        <span className="text-xs text-slate-400">{round.responses.filter(r => r.opted_in).length} opt-ins</span>
                                        <span className="text-xs text-slate-400">{round.matches.length} pairs</span>
                                        {roundUnmatchedOptIns.length > 0 && (
                                            <span className="text-xs text-slate-400">{roundUnmatchedOptIns.length} unmatched</span>
                                        )}
                                        {round.matches.some(m => m.duplicate_previous_matches.length > 0) && (
                                            <span className="flex items-center gap-1 text-xs text-amber-600">
                                                <ExclamationTriangleIcon className="w-3.5 h-3.5" />repeat pair
                                            </span>
                                        )}
                                        {confirmed > 0 ? (
                                            <span className="flex items-center gap-1 text-xs text-green-600">
                                                <CheckCircleIcon className="w-3.5 h-3.5" />{confirmed} confirmed
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-300">no confirmations yet</span>
                                        )}
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-[10px] text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); deleteRound(round.id); }}
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                title="Delete round"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-5 pb-4 bg-slate-50/30">
                                            {round.matches.length === 0 && roundUnmatchedOptIns.length === 0 ? (
                                                <p className="text-sm text-slate-400 italic py-2">No pairs for this round.</p>
                                            ) : (
                                                <div className="space-y-1 pt-1">
                                                    {round.matches.map(m => {
                                                        const r1 = round.responses.find(r => r.member_id === m.member1_id);
                                                        const r2 = round.responses.find(r => r.member_id === m.member2_id);
                                                        const pairMet = r1?.confirmed_met ?? r2?.confirmed_met ?? null;
                                                        const isDuplicate = m.duplicate_previous_matches.length > 0;
                                                        const isEditingNote = noteEditor?.matchId === m.id;
                                                        return (
                                                            <div key={m.id} className={`py-2 border-b border-slate-100 last:border-0 ${isDuplicate ? 'bg-amber-50/70 px-2 rounded-lg' : ''}`}>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <span className="text-sm font-medium text-slate-800">{m.member1?.name || '—'}</span>
                                                                <VoteBadge value={r1?.confirmed_met ?? null} />
                                                                {m.opener_member_id === m.member1_id && <OpenerBadge />}
                                                                <span className="text-slate-300">×</span>
                                                                <span className="text-sm font-medium text-slate-800">{m.member2?.name || '—'}</span>
                                                                <VoteBadge value={r2?.confirmed_met ?? null} />
                                                                {m.opener_member_id === m.member2_id && <OpenerBadge />}
                                                                {isDuplicate && (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700"
                                                                        title={`Already matched: ${formatDuplicateWeeks(m)}`}
                                                                    >
                                                                        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                                                        Repeat
                                                                    </span>
                                                                )}
                                                                <div className="ml-auto flex items-center gap-1.5">
                                                                    <button
                                                                        onClick={() => markMet(m.id, pairMet === true ? null : true)}
                                                                        disabled={markingMet === m.id}
                                                                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-all disabled:opacity-50
                                                                            ${pairMet === true
                                                                                ? 'bg-green-500 border-green-500 text-white'
                                                                                : 'bg-white border-slate-200 text-slate-400 hover:border-green-300 hover:text-green-600'}`}
                                                                    >
                                                                        Met ✓
                                                                    </button>
                                                                    <button
                                                                        onClick={() => markMet(m.id, pairMet === false ? null : false)}
                                                                        disabled={markingMet === m.id}
                                                                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-all disabled:opacity-50
                                                                            ${pairMet === false
                                                                                ? 'bg-red-400 border-red-400 text-white'
                                                                                : 'bg-white border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-400'}`}
                                                                    >
                                                                        Didn&apos;t Meet
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setNoteEditor(isEditingNote ? null : { matchId: m.id, text: m.admin_note ?? '' })}
                                                                        className={`p-1 rounded-full border transition-all
                                                                            ${m.admin_note
                                                                                ? 'bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100'
                                                                                : isEditingNote
                                                                                    ? 'bg-slate-100 border-slate-300 text-slate-600'
                                                                                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'}`}
                                                                        title={m.admin_note ? 'Edit note' : 'Add note'}
                                                                    >
                                                                        <ChatBubbleBottomCenterTextIcon className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    {markingMet === m.id && <ArrowPathIcon className="w-3 h-3 animate-spin text-slate-400" />}
                                                                </div>
                                                            </div>
                                                            <MemberFeedback response={r1} />
                                                            <MemberFeedback response={r2} />
                                                            {isEditingNote ? (
                                                                <div className="mt-2">
                                                                    <textarea
                                                                        autoFocus
                                                                        value={noteEditor.text}
                                                                        onChange={e => setNoteEditor({ matchId: m.id, text: e.target.value })}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote();
                                                                            if (e.key === 'Escape') setNoteEditor(null);
                                                                        }}
                                                                        rows={3}
                                                                        placeholder="Notes about this match…"
                                                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-brand-blue-500 bg-white resize-y"
                                                                    />
                                                                    <div className="mt-1.5 flex items-center gap-2">
                                                                        <button
                                                                            onClick={saveNote}
                                                                            disabled={savingNote}
                                                                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-brand-blue-500 text-white rounded-lg hover:bg-brand-blue-600 disabled:opacity-40 transition-all"
                                                                        >
                                                                            {savingNote ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : 'Save'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setNoteEditor(null)}
                                                                            className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-all"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <span className="ml-auto text-[10px] text-slate-300">⌘↵ to save · clear and save to delete</span>
                                                                    </div>
                                                                </div>
                                                            ) : m.admin_note && (
                                                                <button
                                                                    onClick={() => setNoteEditor({ matchId: m.id, text: m.admin_note ?? '' })}
                                                                    className="mt-2 w-full text-left text-xs text-slate-600 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 whitespace-pre-wrap hover:bg-amber-50 transition-colors"
                                                                    title="Edit note"
                                                                >
                                                                    {m.admin_note}
                                                                    {m.admin_note_updated_at && (
                                                                        <span className="block mt-1 text-[10px] text-slate-400">
                                                                            {new Date(m.admin_note_updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            )}
                                                            </div>
                                                        );
                                                    })}
                                                    {roundUnmatchedOptIns.map(response => (
                                                        <div key={`unmatched-${response.member_id}`} className="flex flex-wrap items-center gap-3 py-2 border-b border-slate-100 last:border-0 bg-slate-50 px-2 rounded-lg">
                                                            <span className="text-sm font-medium text-slate-800">{response.member?.name || '—'}</span>
                                                            <VoteBadge value={response.confirmed_met ?? null} />
                                                            <span className="text-slate-300">×</span>
                                                            <span className="text-sm font-medium text-slate-400 border border-dashed border-slate-300 rounded-lg px-2 py-0.5">Blank</span>
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                                Unmatched
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {matchModal && (
                <MatchModal
                    mode={matchModal.mode}
                    roundId={matchModal.roundId}
                    existingMatch={matchModal.existingMatch}
                    prefillMember1Id={matchModal.prefillMember1Id}
                    members={matchableMembers}
                    onClose={() => setMatchModal(null)}
                    onSave={fetchRounds}
                />
            )}
        </div>
    );
}
