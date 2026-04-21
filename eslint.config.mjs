import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/pdf.worker.min.mjs",
  ]),
  {
    rules: {
      // Catch missing useEffect/useCallback deps before they cause bugs
      "react-hooks/exhaustive-deps": "error",
      // Flag explicit `as any` — use unknown or a proper type instead
      "@typescript-eslint/no-explicit-any": "error",
      // Unused variables are noise — prefix with _ to opt out
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Prefer const where reassignment never happens
      "prefer-const": "error",
    },
  },
]);

export default eslintConfig;
