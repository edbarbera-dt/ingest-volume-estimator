import "@testing-library/jest-dom";

// The AppEngine web runtime isn't available in jsdom.
jest.mock("@dynatrace-sdk/app-environment", () => ({
  getEnvironmentId: () => "test-env",
  getEnvironmentUrl: () => "https://test-env.example.invalid",
  getAppName: () => "Ingest Volume Estimator",
  getAppId: () => "my.ingest.volume.estimator",
  getAppVersion: () => "0.0.0",
  getCurrentUserDetails: () => ({ id: "test-user", email: "test@example.invalid", name: "Test" }),
}));

// jsdom lacks these browser APIs used by Strato.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof globalThis.structuredClone !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v8 = require("node:v8") as typeof import("node:v8");
  globalThis.structuredClone = <T,>(value: T): T => v8.deserialize(v8.serialize(value)) as T;
}
