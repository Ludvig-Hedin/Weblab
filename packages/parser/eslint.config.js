import baseConfig from "@weblab/eslint/base";

/** @type {import('typescript-eslint').Config} */
export default [
  {
    ignores: ["test/data/**"],
  },
  ...baseConfig,
];