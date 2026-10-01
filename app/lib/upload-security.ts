export type ImageKind = 'jpeg' | 'png' | 'webp';

export function detectImageKind(buffer: Buffer): ImageKind | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'jpeg';
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return 'png';
    }

    if (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'webp';
    }

    return null;
}

export function imageContentType(kind: ImageKind): string {
    if (kind === 'jpeg') return 'image/jpeg';
    if (kind === 'png') return 'image/png';
    return 'image/webp';
}

export function imageExtension(kind: ImageKind): string {
    if (kind === 'jpeg') return 'jpg';
    if (kind === 'png') return 'png';
    return 'webp';
}

export type DocKind = 'pdf' | 'doc' | 'docx';

// docx/doc share a zip/OLE container with other office formats; this can't
// prove "it's a real resume", only that the bytes match the claimed container.
export function detectDocKind(buffer: Buffer): DocKind | null {
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
        return 'pdf';
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
        buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1
    ) {
        return 'doc';
    }

    if (
        buffer.length >= 4 &&
        buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
    ) {
        return 'docx';
    }

    return null;
}

export function docContentType(kind: DocKind): string {
    if (kind === 'pdf') return 'application/pdf';
    if (kind === 'doc') return 'application/msword';
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}
