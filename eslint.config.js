import globals from "globals";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    // "env": {
    //   "browser": true,
    //   // This is only needed for the "import" statements.  Those are eliminated by
    //   // rollup.  The code should only be ES3 to support IE10.
    //   "es6": true
    // },
		files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // 'no-console': 'off',
      'no-unused-vars': 'off'
    }
  },
  {
    files: ["tests/lib/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // 'no-console': 'off',
      'no-unused-vars': 'off'
    }
  }
];
