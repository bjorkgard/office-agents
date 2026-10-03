import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import { configDefaults } from "vite-plus/test/config";
import { officeEnv } from "./e2e/support.ts";
import { officeFeed } from "./server/feed-plugin.ts";

const { root: feedRoot, cacheDir } = officeEnv(process.env);

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  ...(cacheDir === undefined ? {} : { cacheDir }),
  test: { exclude: [...configDefaults.exclude, "e2e/**/*.spec.ts"] },
  plugins: lazyPlugins(() => [
    react(),
    officeFeed(feedRoot === undefined ? {} : { root: feedRoot }),
  ]),
});
