import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests (Vitest runs without globals, so Testing Library cannot do it itself).
afterEach(() => {
  cleanup();
});
