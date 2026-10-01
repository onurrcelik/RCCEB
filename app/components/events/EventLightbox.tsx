'use client';

import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

export function EventLightbox({ images, startIndex, onClose }: { images: string[]; startIndex: number; onClose: () => void }) {
    const [current, setCurrent] = useState(startIndex);

    const prev = () => setCurrent(i => (i - 1 + images.length) % images.length);
    const next = () => setCurrent(i => (i + 1) % images.length);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') setCurrent(i => (i - 1 + images.length) % images.length);
            if (e.key === 'ArrowRight') setCurrent(i => (i + 1) % images.length);
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [images.length, onClose]);

    return (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10">
                <XMarkIcon className="w-6 h-6" />
            </button>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">{current + 1} / {images.length}</div>
            {images.length > 1 && (
                <>
                    <button onClick={e => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10">
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10">
                        <ChevronRightIcon className="w-5 h-5" />
                    </button>
                </>
            )}
            <img
                src={images[current]}
                alt=""
                className="max-w-[90vw] max-h-[85vh] object-contain"
                onClick={e => e.stopPropagation()}
            />
            {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                        <button key={i} onClick={e => { e.stopPropagation(); setCurrent(i); }} className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                </div>
            )}
        </div>
    );
}
