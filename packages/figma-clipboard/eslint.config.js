import baseConfig from "@weblab/eslint/base";

export default [
    ...baseConfig,
    // Generated artifact — a single multi-KB base64 literal; not human-edited.
    { ignores: ["src/schema-data.ts"] },
];
