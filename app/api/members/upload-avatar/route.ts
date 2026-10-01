import { NextRequest, NextResponse } from 'next/server';
import { getMemberFromRequest } from '@/app/lib/member-session';
import { query } from '@/app/lib/db';
import { BUCKETS, uploadObject, publicUrl } from '@/app/lib/storage';
import { detectImageKind, imageContentType, imageExtension } from '@/app/lib/upload-security';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BUCKET = BUCKETS.avatars;

export async function POST(request: NextRequest) {
    const member = await getMemberFromRequest(request);
    if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Only JPG, PNG, and WEBP images are allowed' }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
        return NextResponse.json({ error: 'Avatar file is too large' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectImageKind(buffer);
    if (!kind || imageContentType(kind) !== file.type) {
        return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
    }

    const path = `${member.id}/${Date.now()}.${imageExtension(kind)}`;

    try {
        await uploadObject(BUCKET, path, buffer, imageContentType(kind));
    } catch (e) {
        console.error('upload-avatar storage put failed:', { bucket: BUCKET }, e);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const url = publicUrl(BUCKET, path);
    await query('UPDATE members SET avatar_url = $1 WHERE id = $2', [url, member.id]);

    return NextResponse.json({ url });
}
