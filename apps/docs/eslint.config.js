import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['.next/**', 'tsconfig.tsbuildinfo', '.source/**'],
    },
    ...tseslint.configs.recommended,
];
