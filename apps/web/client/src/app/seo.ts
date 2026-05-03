import { APP_DOMAIN, APP_NAME } from '@weblab/constants';

export const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: `https://${APP_DOMAIN}/`,
    logo: `https://${APP_DOMAIN}/favicon.ico`,
    sameAs: [
        "https://github.com/Ludvig-Hedin/Weblab",
        "https://twitter.com/weblab", // update when social handles change
        "https://www.linkedin.com/company/weblab/",
    ],
};

export const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
        {
            "@type": "Question",
            name: `What kinds of things can I design with ${APP_NAME}?`,
            acceptedAnswer: {
                "@type": "Answer",
                text: `You can prototype, ideate, and create websites from scratch with ${APP_NAME}`,
            },
        },
        {
            "@type": "Question",
            name: `Why would I use ${APP_NAME}?`,
            acceptedAnswer: {
                "@type": "Answer",
                text: `When you design in ${APP_NAME} you design in the real product – in other words, the source of truth. Other products are great for ideating, but ${APP_NAME} is the only one that lets you design with the existing product and the only one that translates your designs to code instantly.`,
            },
        },
        {
            "@type": "Question",
            name: `Who owns the code that I write with ${APP_NAME}?`,
            acceptedAnswer: {
                "@type": "Answer",
                text: `The code you make with ${APP_NAME} is all yours. You can export it on your local machine or publish it to a custom domain.`,
            },
        },
    ],
};
