// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import baseConfig from "@weblab/eslint/base";
import nextjsConfig, { restrictEnvAccess } from "@weblab/eslint/nextjs";
import reactConfig from "@weblab/eslint/react";

/** @type {import('typescript-eslint').Config} */
export default [{
  // Auto-generated / out-of-project / has own tsconfig — including any of
  // these trips the eslint project-service parser because the root tsconfig
  // doesn't list them, producing only parsing errors with no useful signal.
  ignores: [
    ".next/**",
    ".storybook/**",
    "convex/**",
    "public/**",
    "test/**",
    // `middleware.ts` sits at the client app root and is not included in the
    // src-only tsconfig the ESLint project service uses, so linting it
    // produces a "not found by the project service" parsing error rather
    // than real signal. Keep ignored until middleware is moved under src/
    // or a dedicated tsconfig is added. (Re-enable once that's done — this
    // file is hot and should be linted.)
    "middleware.ts",
    "next-env.d.ts",
    "next.config.ts",
    "vitest.config.ts",
    "vitest.shims.d.ts",
  ],
}, ...baseConfig, ...reactConfig, ...nextjsConfig, ...restrictEnvAccess, ...storybook.configs["flat/recommended"]];
