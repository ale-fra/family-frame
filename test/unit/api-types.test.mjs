import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { API_TYPES_PATH, generateApiTypes } from "../../tools/generate-api-types.mjs";

// The frame's TypeScript types for the API are generated from the OpenAPI document, which the API tests check
// against the real server. Together that ties the frame code to the server: if the API changes, this test fails
// until the types are regenerated, and then `tsc` fails wherever the frame uses a field that no longer exists.
describe("generated API types", () => {
  it("are up to date with the OpenAPI document (run `npm run generate:api-types` after API changes)", async () => {
    expect(fs.readFileSync(API_TYPES_PATH, "utf8")).toBe(await generateApiTypes());
  });

  it("describe the public schedule the frame reads", async () => {
    const source = await generateApiTypes();
    expect(source).toContain("PublicSchedule: {");
    expect(source).toMatch(/style: components\["schemas"\]\["Style"\]/);
  });
});
