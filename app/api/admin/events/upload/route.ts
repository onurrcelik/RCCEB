import { NextRequest, NextResponse } from 'next/server';
import { BUCKETS, uploadObject, publicUrl } from '@/app/lib/storage';
import { detectImageKind, imageContentType, imageExtension } from '@/app/lib/upload-security';
import { verifyAdminSession } from '@/app/lib/admin-auth';

const MAX_EVENT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EVENT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BUCKET = BUCKETS.events;

export async function POST(request: NextRequest) {
    if (!(await verifyAdminSession(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_EVENT_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Only JPG, PNG, and WEBP images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_EVENT_IMAGE_SIZE_BYTES) {
        return NextResponse.json({ error: 'Image file is too large' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectImageKind(buffer);
    if (!kind || imageContentType(kind) !== file.type) {
        return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
    }

    const path = `${Date.now()}.${imageExtension(kind)}`;

    try {
        await uploadObject(BUCKET, path, buffer, imageContentType(kind));
    } catch (e) {
        console.error('events upload storage put failed:', { bucket: BUCKET }, e);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl(BUCKET, path) });
}
