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
  setupFilesAfterEnv: ["<rootDir>/ui/test/setup.ts"],
};
