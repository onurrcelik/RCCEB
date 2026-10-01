import Image from 'next/image';

// The RCCEB seal plus wordmark. `tone` picks the wordmark colour for the surface it
// sits on: the member portal is dark navy, the admin dashboard is light cream.
export function RccebLogo({
    className = '',
    tone = 'dark',
    showWordmark = true,
    size = 32,
}: {
    className?: string;
    tone?: 'dark' | 'light';
    showWordmark?: boolean;
    size?: number;
}) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <Image
                src="/rcceb-seal.png"
                alt="RCCEB seal"
                width={size}
                height={size}
                className="rounded-full bg-white shrink-0"
                priority
            />
            {showWordmark && (
                <span className={`font-display text-lg font-semibold tracking-tight leading-none ${tone === 'dark' ? 'text-cream' : 'text-navy-900'}`}>
                    RCCEB
                </span>
            )}
        </span>
    );
}
