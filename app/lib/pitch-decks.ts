export const PITCH_STAGES = [
    { id: 'idea', label: 'Idea' },
    { id: 'pre-seed', label: 'Pre-seed' },
    { id: 'seed', label: 'Seed' },
    { id: 'growth', label: 'Growth' },
] as const;

export type PitchStage = (typeof PITCH_STAGES)[number]['id'];

export const MAX_DECK_BYTES = 4 * 1024 * 1024;

export type PitchDeckAuthor = {
    id: string;
    name: string;
    avatar_url: string | null;
};

export type PitchDeck = {
    id: string;
    title: string;
    company_name: string;
    description: string;
    stage: PitchStage;
    file_name: string;
    file_size: number;
    view_count: number;
    created_at: string;
    updated_at: string;
    author: PitchDeckAuthor;
    is_own: boolean;
};

export type PitchDeckFields = {
    title: string;
    company_name: string;
    description: string;
    stage: PitchStage;
};

export function isPitchStage(value: string): value is PitchStage {
    return PITCH_STAGES.some(stage => stage.id === value);
}

export function pitchStageLabel(stage: string): string {
    return PITCH_STAGES.find(item => item.id === stage)?.label ?? stage;
}

export function companyInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'PD';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function normalizePitchDeckFields(input: {
    title: unknown;
    company_name: unknown;
    description: unknown;
    stage: unknown;
}): { value?: PitchDeckFields; error?: string } {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const company_name = typeof input.company_name === 'string' ? input.company_name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const stage = typeof input.stage === 'string' ? input.stage.trim() : '';

    if (!title) return { error: 'Title is required' };
    if (!company_name) return { error: 'Company is required' };
    if (!description) return { error: 'Description is required' };
    if (!isPitchStage(stage)) return { error: 'Choose a stage' };
    if (title.length > 140) return { error: 'Title is too long' };
    if (company_name.length > 120) return { error: 'Company name is too long' };
    if (description.length > 1500) return { error: 'Description is too long' };

    return { value: { title, company_name, description, stage } };
}
