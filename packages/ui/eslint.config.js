import baseConfig from "@weblab/eslint/base";
import reactConfig from "@weblab/eslint/react";

/** @type {import('typescript-eslint').Config} */
export default [
  ...baseConfig,
  ...reactConfig,
];