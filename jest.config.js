/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/ui", "<rootDir>/scripts"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  transform: {
    "^.+\\.(t|j)sx?$|^.+\\.mjs$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "classic" } },
        },
        module: { type: "commonjs" },
      },
    ],
  },
  // Strato charts pull in ESM-only d3 packages.
  transformIgnorePatterns: ["/node_modules/(?!(d3-[^/]+|internmap|delaunator|robust-predicates)/)"],
  moduleNameMapper: {
    "\\.(png|svg|jpg|css)$": "<rootDir>/ui/test/fileMock.js",
    // optional peer of the Strato AiResponse component, not used by this app
    "^streamdown$": "<rootDir>/ui/test/emptyModule.js",
  },
  setupFiles: ["<rootDir>/ui/test/polyfills.ts"],
  setupFilesAfterEnv: ["<rootDir>/ui/test/setup.ts"],
  collectCoverageFrom: ["ui/app/**/*.{ts,tsx}", "!ui/app/**/*.test.{ts,tsx}", "!ui/app/**/__fixtures__/**"],
  // `npm run test:coverage` fails if coverage drops below these levels.
  coverageThreshold: {
    global: { statements: 95, branches: 85, functions: 90, lines: 95 },
  },
};
