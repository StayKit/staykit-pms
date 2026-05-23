import { afterEach, vi } from "vitest";

// jest-dom matchers are only relevant in the jsdom environment; import guarded.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}

afterEach(() => {
  vi.restoreAllMocks();
});
