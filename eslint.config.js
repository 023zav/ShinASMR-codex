import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "qa/", "public/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }]
    }
  },
  {
    files: ["scripts/**", "tests/**", "eslint.config.js", "postcss.config.cjs"],
    languageOptions: {
      globals: { ...globals.node }
    },
    rules: {
      "no-console": "off"
    }
  }
);
