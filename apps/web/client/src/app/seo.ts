import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: `https://${APP_DOMAIN}/`,
    logo: `https://${APP_DOMAIN}/favicon.ico`,
    sameAs: ['https://github.com/Ludvig-Hedin/Weblab', 'https://www.linkedin.com/company/weblab/'],
};

// Q&A pulled from /faq to keep the JSON-LD aligned with what's actually on the
// page. Update both this list and apps/web/client/src/app/faq/page.tsx together.
export const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
        {
            '@type': 'Question',
            name: `What is ${APP_NAME}?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} is an AI-powered visual editor for design. It connects to your existing codebase and lets designers and developers create interfaces using real components. AI is constrained to your design system, and changes become pull requests engineers can merge directly.`,
            },
        },
        {
            '@type': 'Question',
            name: `Who is ${APP_NAME} for?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} is for product teams with designers and an existing component library — design engineers, product designers in code-forward teams, frontend developers who want visual tooling, and teams maintaining design systems.`,
            },
        },
        {
            '@type': 'Question',
            name: `What frontend frameworks does ${APP_NAME} support?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} focuses on React and Next.js projects. We're built on a Babel JSX/TSX parser optimized for the React ecosystem.`,
            },
        },
        {
            '@type': 'Question',
            name: `Where is ${APP_NAME} based?`,
            acceptedAnswer: {
                '@type': 'Answer',
                text: `${APP_NAME} is built in Sweden. Open-source contributors are scattered across the world.`,
            },
        },
    ],
};
