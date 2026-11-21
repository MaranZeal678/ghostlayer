import type { NextConfig } from "next";

const AGENT_RUNTIME_FILES = [
  "./node_modules/playwright-core/**/*",
  "./node_modules/.pnpm/playwright-core@*/node_modules/**/*",
  "./node_modules/.pnpm/patchright-core@*/node_modules/**/*",
  "./node_modules/@solarisdk/**/*",
  "./node_modules/.pnpm/@solarisdk+*/node_modules/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "patchright-core", "@solarisdk/browser", "@solarisdk/sandbox", "pg"],
  // Agents run inside the worker route; make sure runtime data files (e.g. playwright-core/browsers.json) ship with it.
  outputFileTracingIncludes: {
    "/api/worker": AGENT_RUNTIME_FILES,
    "/api/evidence/[evidenceId]": AGENT_RUNTIME_FILES,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
