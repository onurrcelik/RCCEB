import { NextRequest } from 'next/server';

function stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

export function getBaseUrl(request?: NextRequest): string {
    const configuredUrl =
        process.env.APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.SITE_URL;

    if (configuredUrl) {
        return stripTrailingSlash(configuredUrl);
    }

    if (process.env.NODE_ENV !== 'development') {
        throw new Error('APP_URL, NEXT_PUBLIC_BASE_URL, or SITE_URL must be configured in production');
    }

    if (request) {
        const proto = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host');

        if (host) {
            return `${proto}://${host}`;
        }
    }

    return 'http://localhost:3000';
}
