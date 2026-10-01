import { getSupabase } from '@/app/lib/supabase';

// File storage lives in Supabase Storage, in the same project as auth and the database.
// Both buckets are public-read (created by supabase/schema.sql); writes only ever go
// through these server helpers with the service-role key.
export const BUCKETS = {
    avatars: process.env.STORAGE_BUCKET_AVATARS || 'avatars',
    events: process.env.STORAGE_BUCKET_EVENTS || 'events',
};

export async function uploadObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await getSupabase().storage.from(bucket).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export function publicUrl(bucket: string, key: string): string {
    return getSupabase().storage.from(bucket).getPublicUrl(key).data.publicUrl;
}
