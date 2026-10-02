import { EXPERTISE_OPTIONS, categoryLabel } from '@/app/lib/categories';

// The ChatGPT prompt offered on the onboarding page. Pasted into a ChatGPT that already
// knows the member, it drafts every free-text answer the profile step asks for, under fixed
// numbered headings; the member pastes the whole reply back and app/lib/onboarding-paste.ts
// sorts it into the fields. What we
// already know from their application goes in up front so ChatGPT starts from the facts.
//
// Keep the numbered headings in step with the onboarding form and with the parser.

export type OnboardingPromptFacts = {
    name?: string | null;
    graduation_year?: number | string | null;
    location?: string | null;
    categories?: string[] | null;
};

export function buildOnboardingPrompt(facts: OnboardingPromptFacts): string {
    const known = [
        facts.name?.trim() && `- Name: ${facts.name.trim()}`,
        facts.graduation_year && `- Robert College class of ${facts.graduation_year}`,
        facts.location?.trim() && `- Based in: ${facts.location.trim()}`,
        facts.categories?.length && `- In the community as: ${facts.categories.map(id => categoryLabel(id, 'label')).join(', ')}`,
    ].filter(Boolean);

    return `I'm joining RCCEB (the Bond), a private network of Robert College alumni who build, invest in and support startups. The members' portal asks me to fill in a profile, and I'd like your help writing it.
${known.length ? `\nWhat RCCEB already has on me:\n${known.join('\n')}\n` : ''}
How to work with me:
- If you already know things about me from our past chats, draft from that first and only ask me about what's missing.
- Otherwise interview me: ask one question at a time, short and friendly, no more than 7 questions in total. Then write everything in one go.
- Don't invent facts, numbers, companies or titles. If you're unsure, ask.

Write in English, first person, warm and natural, not corporate. No em dashes, no emojis, no hashtags. I'll paste your whole reply into the portal, which reads it by these headings, so keep each numbered heading exactly as written:

1. Bio
   2 to 4 sentences (about 60 to 100 words) on who I am and what I've built.

2. What I can help with
   1 or 2 sentences on what I can offer other members (for example introductions, fundraising advice, hiring, go-to-market, a specific industry).

3. What I'm working on
   1 or 2 sentences on the company, fund or project that has my attention now.

4. Expertise
   Pick 1 to 4 that fit me best, written exactly as below, from this list only:
   ${EXPERTISE_OPTIONS.join(', ')}

5. Companies I'm affiliated with
   One line per company: Company name | My role | Website | Company LinkedIn
   The website is required for every company; ask me if you don't know it. Leave the LinkedIn blank if you don't know it.

6. Education after RC
   Degrees and schools after Robert College, e.g. "BSc Economics, Boğaziçi; MBA, INSEAD". Write "None" if there aren't any.

7. Favorite read / video / person / source
   Only the name, at most 8 words, e.g. "Paul Graham's essays". Do not say why. No second sentence.

8. WhatsApp intro
   My intro for the RCCEB WhatsApp group, in Turkish, 80 to 120 words, warm and natural, in exactly this format:

[Name] - [Company] — [Role], RC'[year]
Ne yapıyorum: [1-3 sentences]
Katkım & beklentim: [what I offer the group + what I'm looking for]
Lokasyon: [city]`;
}
