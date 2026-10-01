import Link from 'next/link';
import { CloudArrowUpIcon, ClipboardDocumentListIcon, TableCellsIcon } from '@heroicons/react/24/outline';

export default function AttendancePage() {
    return (
        <div className="min-h-screen bg-cream">
            <div className="border-b border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center gap-2.5">
                    <ClipboardDocumentListIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <h1 className="text-sm font-bold text-slate-900">Attendance</h1>
                </div>
            </div>

            <main className="px-6 py-8">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-5">Select an option</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                    <Link
                        href="/admin/attendance/upload"
                        className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                            <CloudArrowUpIcon className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-slate-900">Record attendance</div>
                            <div className="mt-1 text-xs text-slate-400 leading-relaxed">Upload a meeting screenshot to mark who joined</div>
                        </div>
                    </Link>

                    <Link
                        href="/admin/attendance/history"
                        className="group flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                        <div className="w-9 h-9 rounded-lg bg-gold-100 flex items-center justify-center">
                            <TableCellsIcon className="w-5 h-5 text-gold-700" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-slate-900">Attendance history</div>
                            <div className="mt-1 text-xs text-slate-400 leading-relaxed">Every meeting, every member, plus group-chat participation</div>
                        </div>
                    </Link>
                </div>
            </main>
        </div>
    );
}
