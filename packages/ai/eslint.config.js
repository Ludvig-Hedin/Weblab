import baseConfig from "@weblab/eslint/base";

/** @type {import('typescript-eslint').Config} */
export default [
    {
        // Codegen-only script (not part of the published package surface) and
        // its output. The script is run via `bun run generate:skills`; the
        // emitted file is rewritten on every run, so linting either is noise.
        ignores: ["scripts/**", "src/skills/embedded.ts"],
    },
    ...baseConfig,
];
