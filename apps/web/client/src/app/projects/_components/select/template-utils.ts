import type { Project } from '@weblab/models';

import type { StaticTemplate, StaticTemplateId } from '../templates/static-templates';

export const STATIC_TEMPLATE_ALIASES: Record<StaticTemplateId, string[]> = {
    portfolio: ['portfolio', 'portfolio website', 'personal site'],
    saas: ['saas', 'landing', 'marketing'],
    blog: ['blog', 'writing', 'content'],
    dashboard: ['dashboard', 'analytics', 'admin'],
    ecommerce: ['ecommerce', 'e commerce', 'store', 'storefront', 'shop'],
    agency: ['agency', 'studio', 'creative'],
    docs: ['docs', 'documentation', 'knowledge base'],
    app: ['web app', 'application', 'react app'],
};

function normalizeTemplateText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function resolveStaticTemplateProject(
    template: StaticTemplate,
    templateProjects: Project[],
): Project | null {
    const searchTerms = [template.name, ...(STATIC_TEMPLATE_ALIASES[template.id] ?? [])]
        .map(normalizeTemplateText)
        .filter(Boolean);

    let bestMatch: Project | null = null;
    let bestScore = 0;

    for (const project of templateProjects) {
        const normalizedName = normalizeTemplateText(project.name);
        const normalizedDescription = normalizeTemplateText(project.metadata.description ?? '');
        const haystack = `${normalizedName} ${normalizedDescription}`.trim();

        for (const term of searchTerms) {
            let score = 0;
            if (normalizedName === term) {
                score = 100;
            } else if (normalizedName.includes(term)) {
                score = 80;
            } else if (haystack.includes(term)) {
                score = 60;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = project;
            }
        }
    }

    return bestScore > 0 ? bestMatch : null;
}

export function getStaticTemplateMatches(
    templateProjects: Project[],
): Map<StaticTemplateId, Project> {
    const templateNames: Record<StaticTemplateId, string> = {
        portfolio: 'Portfolio',
        saas: 'SaaS',
        blog: 'Blog',
        dashboard: 'Dashboard',
        ecommerce: 'E-commerce',
        agency: 'Agency',
        docs: 'Docs',
        app: 'Web App',
    };
    const matches = new Map<StaticTemplateId, Project>();

    const entries = Object.entries(templateNames) as Array<[StaticTemplateId, string]>;
    for (const [templateId, templateName] of entries) {
        if (!templateName) continue;
        const match = resolveStaticTemplateProject(
            {
                id: templateId,
                name: templateName,
                description: '',
                bg: '',
                accent: '',
            },
            templateProjects,
        );
        if (match) {
            matches.set(templateId, match);
        }
    }

    return matches;
}
