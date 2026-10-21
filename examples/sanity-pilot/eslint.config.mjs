import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['.next/**', 'node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            globals: {
                process: 'readonly',
                fetch: 'readonly',
                URL: 'readonly',
                AbortSignal: 'readonly',
            },
        },
    },
);
