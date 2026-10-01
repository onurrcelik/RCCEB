'use client';

import { PhotoIcon } from '@heroicons/react/24/outline';

export function EventImageGrid({ images, onOpen }: { images: string[]; onOpen: (index: number) => void }) {
    if (images.length === 0) return null;

    return (
        <div className="relative w-full h-44 sm:h-auto sm:w-36 sm:shrink-0 cursor-pointer overflow-hidden group bg-zinc-950/80" onClick={() => onOpen(0)}>
            <img
                src={images[0]}
                alt=""
                className="w-full h-full object-cover group-hover:brightness-90 transition-all duration-200"
            />
            {images.length > 1 && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-1 rounded-full">
                    <PhotoIcon className="w-3 h-3" />
                    {images.length}
                </div>
            )}
        </div>
    );
}
