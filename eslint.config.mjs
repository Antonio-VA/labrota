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

      // ── Disabled react-hooks rules (v7+) ──
      // `set-state-in-effect` flags the SSR-safe hydration pattern
      // (`useEffect(() => setState(readFromLocalStorage()))`) which we use
      // intensively; also flags every debounced data-fetch effect. Replacing
      // them wholesale is a major refactor, not a cleanup.
      "react-hooks/set-state-in-effect": "off",
      // `refs` flags init-once guards (`if (!seededRef.current) { ... }`) and
      // fallback display reads that are semantically safe. Would require the
      // same large refactor to avoid.
      "react-hooks/refs": "off",
      // `immutability` flags self-referential useCallback schedulers and
      // imperative `window.location` navigations. Useful signal but our
      // polling code relies on the former and a few callers on the latter.
      "react-hooks/immutability": "off",
    },
  },
  // The vitest config and node scripts import `vitest/config` / read
  // `process.env`, which eslint-plugin-react-hooks still tries to parse and
  // trips over without useful output. Nothing in these files is a React
  // component, so the whole plugin is pointless here.
  {
    files: ["vitest.config.ts", "scripts/**", "e2e/**"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);

export default eslintConfig;
