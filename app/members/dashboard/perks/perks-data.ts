export type Perk = {
    id: string;
    name: string;
    logoSrc: string;
    tag: string;
    offer: string;
    tagline: string;
    comparison: string;
    details: string;
    website: string;
    countryFlagSrc: string;
    countryLabel: string;
};

// Partner offers shown on the Perks tab. Add an entry here (and its logo under
// public/perks/) to publish a perk; `id` is what perk_interests rows point at, so never
// reuse or rename one once members have tapped it.
export const PERKS: Perk[] = [];
