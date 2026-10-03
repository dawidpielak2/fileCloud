import pluginJs from "@eslint/js";
import globals from "globals";

export default [
  pluginJs.configs.recommended,
  {
    ignores: ["eslint.config.mjs"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      "no-unused-vars": "warn"
    }
  }
];
