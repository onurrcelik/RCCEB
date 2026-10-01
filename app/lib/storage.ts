import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Uploaded images (member avatars, event photos) live in one S3 bucket under two
// prefixes. The bucket policy makes only those prefixes publicly readable; writes go
// through these server helpers with the IAM user in AWS_ACCESS_KEY_ID.
export const BUCKETS = {
    avatars: 'avatars',
    events: 'events',
};

const region = process.env.AWS_REGION || 'eu-central-1';
const s3 = new S3Client({ region });

function bucketName(): string {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET is not set');
    return bucket;
}

// `prefix` is one of BUCKETS — kept as the first argument so call sites read the same
// as they did with per-purpose buckets.
export async function uploadObject(prefix: string, key: string, body: Buffer, contentType: string): Promise<void> {
    await s3.send(new PutObjectCommand({
        Bucket: bucketName(),
        Key: `${prefix}/${key}`,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));
}

export function publicUrl(prefix: string, key: string): string {
    return `https://${bucketName()}.s3.${region}.amazonaws.com/${prefix}/${key}`;
}
