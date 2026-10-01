'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    CloudArrowUpIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';

interface UploadResult {
    matchedCount: number;
    memberCount: number;
    meeting: { meeting_date: string };
}

function latestThursdayInput(): string {
    const date = new Date();
    const diff = (date.getDay() + 3) % 7;
    date.setDate(date.getDate() - diff);
    return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export default function AttendanceUploadPage() {
    const [meetingDate, setMeetingDate] = useState(latestThursdayInput());
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [error, setError] = useState('');
    const [result, setResult] = useState<UploadResult | null>(null);
    const [dragging, setDragging] = useState(false);

    const addFiles = (incoming: FileList | File[] | null) => {
        if (!incoming) return;
        const next = Array.from(incoming).filter(f => /^image\/(png|jpeg|webp)$/.test(f.type));
        setFiles(prev => {
            const existingNames = new Set(prev.map(f => f.name));
            return [...prev, ...next.filter(f => !existingNames.has(f.name))];
        });
    };

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); };
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const upload = async () => {
        if (files.length === 0) { setError('Add at least one screenshot'); return; }
        setUploading(true);
        setError('');
        setResult(null);
        setUploadProgress('');

        let lastResult: UploadResult | null = null;
        try {
            for (let i = 0; i < files.length; i++) {
                setUploadProgress(`Processing ${i + 1} of ${files.length}…`);
                const form = new FormData();
                form.append('file', files[i]);
                form.append('date', meetingDate);
                const res = await fetch('/api/admin/attendance/upload', { method: 'POST', body: form });
                const data = await res.json();
                if (!res.ok) throw new Error(`File ${i + 1}: ${data.error || 'Upload failed'}`);
                lastResult = data;
            }
            setResult(lastResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    return (
        <div className="min-h-screen bg-cream">
            <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center gap-3">
                <Link href="/admin/attendance" className="text-slate-400 hover:text-slate-700 transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" />
                </Link>
                <div className="h-4 w-px bg-slate-200" />
                <h1 className="text-sm font-bold text-slate-900">Record attendance</h1>
            </div>

            <main className="px-6 py-8 max-w-sm">
                {result ? (
                    <div className="space-y-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                            <div className="flex items-start gap-3">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-sm font-bold text-emerald-800">Attendance recorded</div>
                                    <div className="mt-1 text-xs text-emerald-700 space-y-0.5">
                                        <div>Matched {result.matchedCount} of {result.memberCount} members</div>
                                        <div>{formatDate(result.meeting.meeting_date)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Link
                                href="/admin/attendance/history"
                                className="flex-1 rounded-lg bg-slate-950 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                            >
                                View history
                            </Link>
                            <button
                                onClick={() => { setResult(null); setFiles([]); setError(''); }}
                                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                                Upload another
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="border-b border-slate-100 px-5 py-3.5">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">New entry</div>
                        </div>
                        <div className="p-5 space-y-4">

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Meeting date</label>
                                <input
                                    type="date"
                                    value={meetingDate}
                                    onChange={e => setMeetingDate(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            {/* File list */}
                            {files.length > 0 && (
                                <div className="space-y-1.5">
                                    {files.map((f, i) => (
                                        <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                            <CloudArrowUpIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold text-slate-800 truncate">{f.name}</div>
                                                <div className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</div>
                                            </div>
                                            <button
                                                onClick={() => removeFile(i)}
                                                disabled={uploading}
                                                className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors disabled:opacity-40"
                                            >
                                                <XCircleIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Drop zone — always visible so more files can be added */}
                            <label
                                onDragOver={onDragOver}
                                onDragEnter={onDragOver}
                                onDragLeave={onDragLeave}
                                onDrop={onDrop}
                                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors ${
                                    dragging
                                        ? 'border-amber-500 bg-amber-50/40'
                                        : 'border-slate-200 bg-slate-50 hover:border-amber-500 hover:bg-amber-50/20'
                                }`}
                            >
                                <CloudArrowUpIcon className={`w-6 h-6 transition-colors ${dragging ? 'text-amber-400' : 'text-slate-300'}`} />
                                <span className="mt-1.5 text-xs font-semibold text-slate-500">
                                    {dragging ? 'Drop to add' : files.length > 0 ? 'Add more screenshots' : 'Choose or drop screenshots'}
                                </span>
                                <span className="mt-0.5 text-[10px] text-slate-400">PNG, JPG, or WEBP</span>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    className="sr-only"
                                    onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                                />
                            </label>

                            {/* Pre-upload summary */}
                            {files.length > 0 && (
                                <div className="rounded-lg bg-slate-900 px-4 py-3 space-y-1.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-medium">Date</span>
                                        <span className="text-white font-bold">{meetingDate ? formatDate(meetingDate) : '—'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-medium">Files</span>
                                        <span className="text-white font-bold">{files.length} screenshot{files.length > 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={upload}
                                disabled={uploading || files.length === 0}
                                className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {uploading ? (
                                    <>
                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                        {uploadProgress || 'Uploading…'}
                                    </>
                                ) : `Mark attendance${files.length > 1 ? ` (${files.length} files)` : ''}`}
                            </button>

                            {error && (
                                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 flex items-start gap-2">
                                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
