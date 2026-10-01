import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const OCR_NOISE = [
    'me',
    'host',
    'co-host',
    'guest',
    'iphone',
    'ipad',
    'android',
    'phone',
    'mobile',
    'zoom',
    'muted',
    'unmuted',
    'recording',
    'connecting',
];

export interface AttendanceMember {
    id: string;
    name: string | null;
    email?: string | null;
}

export interface AttendanceMatch {
    memberId: string;
    memberName: string;
    matchedText: string;
    score: number;
    strategy: 'exact' | 'concatenated' | 'fuzzy' | 'unique_first_name' | 'prefix_match';
}

export function normalizeName(value: string): string {
    return value
        .replace(/[ıİ]/g, match => match === 'ı' ? 'i' : 'I')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanOcrLine(line: string): string {
    let cleaned = line;
    for (const word of OCR_NOISE) {
        cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    }
    return normalizeName(cleaned);
}

export function ocrLines(ocrText: string): string[] {
    return ocrText
        .split(/\r?\n/)
        .map(cleanOcrLine)
        .filter(line => line.length >= 2);
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    const current = Array.from({ length: b.length + 1 }, () => 0);

    for (let i = 1; i <= a.length; i++) {
        current[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + cost
            );
        }
        previous.splice(0, previous.length, ...current);
    }

    return previous[b.length];
}

function ratio(a: string, b: string): number {
    const longest = Math.max(a.length, b.length);
    if (longest === 0) return 100;
    return Math.round((1 - levenshtein(a, b) / longest) * 100);
}

function tokenSetRatio(a: string, b: string): number {
    const aTokens = new Set(a.split(' ').filter(Boolean));
    const bTokens = new Set(b.split(' ').filter(Boolean));
    const intersection = [...aTokens].filter(token => bTokens.has(token)).sort();
    const aDiff = [...aTokens].filter(token => !bTokens.has(token)).sort();
    const bDiff = [...bTokens].filter(token => !aTokens.has(token)).sort();

    const base = intersection.join(' ');
    const left = [...intersection, ...aDiff].join(' ');
    const right = [...intersection, ...bDiff].join(' ');

    return Math.max(ratio(base, left), ratio(base, right), ratio(left, right));
}

export function matchAttendance(ocrText: string, members: AttendanceMember[]): AttendanceMatch[] {
    const lines = ocrLines(ocrText);
    const fullText = lines.join(' ');
    const compactText = fullText.replace(/\s/g, '');
    const firstNameCounts = new Map<string, number>();

    for (const member of members) {
        const normalized = normalizeName(member.name ?? '');
        const firstName = normalized.split(' ')[0];
        if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1);
    }

    const matches: AttendanceMatch[] = [];

    for (const member of members) {
        const memberName = member.name?.trim();
        if (!memberName) continue;

        const normalized = normalizeName(memberName);
        const compact = normalized.replace(/\s/g, '');
        const firstName = normalized.split(' ')[0];

        if (normalized && fullText.includes(normalized)) {
            matches.push({ memberId: member.id, memberName, matchedText: normalized, score: 100, strategy: 'exact' });
            continue;
        }

        if (compact.length >= 5 && compactText.includes(compact)) {
            matches.push({ memberId: member.id, memberName, matchedText: compact, score: 100, strategy: 'concatenated' });
            continue;
        }

        let bestLine = '';
        let bestScore = 0;
        for (const line of lines) {
            const score = tokenSetRatio(normalized, line);
            if (score > bestScore) {
                bestScore = score;
                bestLine = line;
            }
        }

        if (bestScore >= 85) {
            matches.push({ memberId: member.id, memberName, matchedText: bestLine, score: bestScore, strategy: 'fuzzy' });
            continue;
        }

        let uniqueFirstNameMatched = false;
        if (firstName && firstNameCounts.get(firstName) === 1) {
            for (const line of lines) {
                const firstScore = tokenSetRatio(firstName, line);
                if (firstScore >= 90 || line.split(' ').includes(firstName)) {
                    matches.push({
                        memberId: member.id,
                        memberName,
                        matchedText: line,
                        score: Math.max(firstScore, 90),
                        strategy: 'unique_first_name',
                    });
                    uniqueFirstNameMatched = true;
                    break;
                }
            }
        }

        if (!uniqueFirstNameMatched) {
            const nameParts = normalized.split(' ').filter(Boolean);
            if (nameParts.length >= 2) {
                const memberFirst = nameParts[0];
                const memberLast = nameParts[nameParts.length - 1];
                for (const line of lines) {
                    const lineTokens = line.split(' ').filter(Boolean);
                    if (!lineTokens.includes(memberLast)) continue;
                    const hasFirstPrefix = lineTokens.some(t => t.length >= 4 && memberFirst.startsWith(t));
                    if (hasFirstPrefix) {
                        matches.push({ memberId: member.id, memberName, matchedText: line, score: 82, strategy: 'prefix_match' });
                        break;
                    }
                }
            }
        }
    }

    return matches;
}

export async function runTesseractOcr(buffer: Buffer, extension: string): Promise<string> {
    const dir = path.join(tmpdir(), 'rcceb-attendance');
    await mkdir(dir, { recursive: true });
    const inputPath = path.join(dir, `${randomUUID()}.${extension}`);
    const tesseractPath = process.env.TESSERACT_PATH || '/opt/homebrew/bin/tesseract';

    await writeFile(inputPath, buffer);
    try {
        const { stdout } = await execFileAsync(tesseractPath, [inputPath, 'stdout', '-l', process.env.TESSERACT_LANGS || 'eng+tur'], {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 5,
        });
        return stdout;
    } finally {
        await unlink(inputPath).catch(() => {});
    }
}

export function parseMeetingDateFromFilename(filename: string): string | null {
    const iso = filename.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) {
        const [, year, month, day] = iso;
        return toIsoDate(Number(year), Number(month), Number(day));
    }

    const dotted = filename.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
    if (dotted) {
        const [, day, month, year] = dotted;
        return toIsoDate(Number(year), Number(month), Number(day));
    }

    return null;
}

export function latestThursday(from = new Date()): string {
    const date = new Date(from);
    const day = date.getDay();
    const diff = (day + 3) % 7;
    date.setDate(date.getDate() - diff);
    return date.toISOString().slice(0, 10);
}

function toIsoDate(year: number, month: number, day: number): string | null {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(
        Number(value.slice(0, 4)),
        Number(value.slice(5, 7)),
        Number(value.slice(8, 10))
    ) === value;
}
