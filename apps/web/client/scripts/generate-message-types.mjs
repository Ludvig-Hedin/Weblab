import { fileURLToPath } from 'node:url';

// Generate declarations through next-intl without starting development watchers.
process.env.NODE_ENV = 'production';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { default: createNextIntlPlugin } = await import('next-intl/plugin');
createNextIntlPlugin({
    experimental: { createMessagesDeclaration: './messages/en.json' },
})({});
