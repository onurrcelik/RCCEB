'use client';

import { useState, useEffect, useRef } from 'react';
import { PlusIcon, TrashIcon, ArrowPathIcon, CalendarIcon, MapPinIcon, UsersIcon, PhotoIcon, XMarkIcon, CheckIcon, PencilIcon, LinkIcon } from '@heroicons/react/24/outline';
import { GripVerticalIcon } from '@/app/components/ui/BrandIcons';
import { EventRecord, formatEventDate, toDateInputValue } from '@/app/lib/events';

const EMPTY: Omit<EventRecord, 'id' | 'created_at'> = {
    title: '', description: '', date: '', location: '',
    type: 'In-person', attendees: 0, images: [], upcoming: false, link: '',
};

export default function EventsPage() {
    const [events, setEvents] = useState<EventRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<EventRecord | null>(null);
    const [form, setForm] = useState({ ...EMPTY });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const dragIndex = useRef<number | null>(null);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/events?t=${Date.now()}`, { cache: 'no-store' });
            const data = await res.json();
            if (Array.isArray(data)) setEvents(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchEvents(); }, []);

    function openNew() {
        setEditing(null);
        setForm({ ...EMPTY });
        setSaveError('');
        setModalOpen(true);
    }

    function openEdit(event: EventRecord) {
        setSaveError('');
        setEditing(event);
        setForm({
            title: event.title,
            description: event.description,
            date: toDateInputValue(event.date),
            location: event.location,
            type: event.type,
            attendees: event.attendees,
            images: event.images ?? [],
            upcoming: event.upcoming,
            link: event.link ?? '',
        });
        setModalOpen(true);
    }

    async function handleImageUpload(files: FileList) {
        setUploadingImage(true);
        setUploadError('');
        try {
            const uploaded: string[] = [];
            for (const file of Array.from(files)) {
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch('/api/admin/events/upload', { method: 'POST', body: fd });
                const json = await res.json();
                if (json.url) {
                    uploaded.push(json.url);
                } else {
                    setUploadError(json.error || 'Upload failed');
                }
            }
            if (uploaded.length > 0) setForm(f => ({ ...f, images: [...uploaded, ...f.images] }));
        } finally {
            setUploadingImage(false);
        }
    }

    function removeImage(index: number) {
        setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }));
    }

    function makeCover(index: number) {
        if (index === 0) return;
        setForm(f => {
            const imgs = [...f.images];
            const [selected] = imgs.splice(index, 1);
            imgs.unshift(selected);
            return { ...f, images: imgs };
        });
    }

    async function handleSave() {
        setSaving(true);
        setSaveError('');
        try {
            if (editing) {
                const res = await fetch('/api/admin/events', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editing.id, ...form }),
                });
                const json = await res.json();
                if (!res.ok) { setSaveError(json.error || 'Save failed'); return; }
            } else {
                const res = await fetch('/api/admin/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                });
                const json = await res.json();
                if (!res.ok) { setSaveError(json.error || 'Save failed'); return; }
            }
            await fetchEvents();
            setSaved(true);
            setTimeout(() => { setSaved(false); setModalOpen(false); }, 800);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Delete this event?')) return;
        setDeletingId(id);
        try {
            await fetch(`/api/admin/events?id=${id}`, { method: 'DELETE' });
            setEvents(prev => prev.filter(e => e.id !== id));
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="p-4 md:p-12 text-slate-700">
            <header className="flex items-center justify-between gap-3 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Events</h1>
                    <p className="text-sm text-slate-400">Past and upcoming RCCEB gatherings.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchEvents} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all">
                        <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin text-brand-blue-500' : 'text-slate-500'}`} />
                    </button>
                    <button
                        onClick={openNew}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-blue-500 hover:bg-brand-blue-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                    >
                        <PlusIcon className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Add Event</span>
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <ArrowPathIcon className="w-5 h-5 animate-spin text-slate-300" />
                </div>
            ) : events.length === 0 ? (
                <div className="text-center py-24 text-slate-400 text-sm">No events yet. Add one above.</div>
            ) : (
                <div className="space-y-3">
                    {events.map(event => (
                        <div key={event.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row">
                            {event.images?.length > 0 ? (
                                <img src={event.images[0]} alt={event.title} className="w-full h-44 md:h-auto md:w-36 shrink-0 object-cover" />
                            ) : (
                                <div className="hidden md:flex w-36 shrink-0 bg-slate-100 items-center justify-center">
                                    <PhotoIcon className="w-6 h-6 text-slate-300" />
                                </div>
                            )}
                            <div className="flex-1 px-4 py-4 md:px-6 md:py-5 flex items-start md:items-center gap-3 md:gap-6 min-w-0">
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <div className="font-semibold text-slate-900 text-sm">{event.title}</div>
                                        {event.upcoming && (
                                            <span className="text-[10px] font-bold bg-brand-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Upcoming</span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${event.type === 'In-person' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {event.type}
                                        </span>
                                        {event.images?.length > 1 && (
                                            <span className="text-[10px] text-slate-400">{event.images.length} photos</span>
                                        )}
                                    </div>
                                    {event.description && (
                                        <p className="text-xs text-slate-400 line-clamp-1 mb-2">{event.description}</p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                                        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{formatEventDate(event.date)}</span>
                                        {event.location && <span className="flex items-center gap-1"><MapPinIcon className="w-3 h-3" />{event.location}</span>}
                                        {event.attendees > 0 && <span className="flex items-center gap-1"><UsersIcon className="w-3 h-3" />{event.attendees} attendees</span>}
                                        {event.link && (
                                            <a href={event.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-blue-500 hover:underline min-w-0">
                                                <LinkIcon className="w-3 h-3 shrink-0" /><span className="truncate">{event.link.replace(/^https?:\/\//, '')}</span>
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 md:gap-2 shrink-0">
                                    <button onClick={() => openEdit(event)} className="p-2 text-slate-400 hover:text-brand-blue-500 hover:bg-brand-blue-500/5 rounded-lg transition-all">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(event.id)} disabled={deletingId === event.id} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                        {deletingId === event.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Event' : 'New Event'}</h2>
                            <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Images */}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                    Photos {form.images.length > 0 && <span className="normal-case font-normal">({form.images.length})</span>}
                                </label>
                                <p className="text-[11px] text-slate-400 mb-2">The first photo is the cover shown in the member portal. New uploads are added as the cover by default.</p>

                                {form.images.length > 0 && (
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        {form.images.map((url, i) => (
                                            <div
                                                key={url}
                                                draggable
                                                onDragStart={() => { dragIndex.current = i; }}
                                                onDragOver={e => e.preventDefault()}
                                                onDrop={() => {
                                                    if (dragIndex.current === null || dragIndex.current === i) return;
                                                    setForm(f => {
                                                        const imgs = [...f.images];
                                                        const [moved] = imgs.splice(dragIndex.current!, 1);
                                                        imgs.splice(i, 0, moved);
                                                        dragIndex.current = null;
                                                        return { ...f, images: imgs };
                                                    });
                                                }}
                                                className="relative group aspect-video rounded-xl overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing"
                                            >
                                                <img src={url} alt="" className="w-full h-full object-cover pointer-events-none" />
                                                {i === 0 && (
                                                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Cover</div>
                                                )}
                                                {i !== 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => makeCover(i)}
                                                        className="absolute bottom-1 left-1 bg-white/90 hover:bg-white text-[9px] font-bold text-slate-700 px-1.5 py-0.5 rounded uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        Make cover
                                                    </button>
                                                )}
                                                <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <GripVerticalIcon className="w-4 h-4 text-white drop-shadow" />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(i)}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <XMarkIcon className="w-3 h-3 text-white" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="cursor-pointer block">
                                    <div className="h-16 rounded-xl border-2 border-dashed border-slate-200 hover:border-brand-blue-500 transition-colors flex items-center justify-center gap-2 text-slate-400 hover:text-brand-blue-500">
                                        {uploadingImage ? (
                                            <><ArrowPathIcon className="w-4 h-4 animate-spin" /><span className="text-xs">Uploading…</span></>
                                        ) : (
                                            <><PhotoIcon className="w-4 h-4" /><span className="text-xs font-medium">Add photos</span></>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={e => { if (e.target.files?.length) handleImageUpload(e.target.files); }}
                                    />
                                </label>
                                {uploadError && <p className="mt-1.5 text-xs text-red-500">{uploadError}</p>}
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Title *</label>
                                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="RCCEB Founders Dinner" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</label>
                                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="What happened at this event…" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-brand-blue-500 transition-all resize-none" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date *</label>
                                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Attendees</label>
                                    <input type="number" min={0} value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: parseInt(e.target.value) || 0 }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Location</label>
                                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Istanbul" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Event link</label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="url" inputMode="url" value={form.link ?? ''} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://lu.ma/your-event" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all" />
                                </div>
                                <p className="mt-1.5 text-[11px] text-slate-400">The event&apos;s own page (Luma, Eventbrite…). Members get a Register button for upcoming events, Event page for past ones.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Type</label>
                                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'In-person' | 'Online' }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all">
                                        <option value="In-person">In-person</option>
                                        <option value="Online">Online</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</label>
                                    <select value={form.upcoming ? 'upcoming' : 'past'} onChange={e => setForm(f => ({ ...f, upcoming: e.target.value === 'upcoming' }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-brand-blue-500 transition-all">
                                        <option value="past">Past</option>
                                        <option value="upcoming">Upcoming</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 pb-6">
                            {saveError && <p className="mb-3 text-xs text-red-500 font-medium">{saveError}</p>}
                            <button
                                onClick={handleSave}
                                disabled={!form.title || !form.date || saving}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                                    saved ? 'bg-green-500 text-white' : 'bg-brand-blue-500 hover:bg-brand-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                                }`}
                            >
                                {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : saved ? <><CheckIcon className="w-4 h-4" /> Saved</> : editing ? 'Save Changes' : 'Create Event'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
