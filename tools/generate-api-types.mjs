// Generates src/lib/api-schema.ts (API types and limits for the frontend) from the OpenAPI document in
// server/lib/openapi.mjs. Run after changing the API:  npm run generate:api-types
// test/unit/api-types.test.mjs fails while the generated file is out of date.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { openApiSpec } from "../server/lib/openapi.mjs";

export const API_TYPES_PATH = fileURLToPath(new URL("../src/lib/api-schema.ts", import.meta.url));

const HEADER = `// GENERATED from server/lib/openapi.mjs by tools/generate-api-types.mjs. Do not edit by hand:
// run \`npm run generate:api-types\` after changing the API.
/* eslint-disable */
`;

export async function generateApiTypes() {
  const ast = await openapiTS(structuredClone(openApiSpec), { alphabetize: true, exportType: true });
  const { DailyRecurrence, WeeklyRecurrence, MonthlyRecurrence } = openApiSpec.components.schemas;
  const maxIntervals = {
    daily: DailyRecurrence.properties.interval.maximum,
    weekly: WeeklyRecurrence.properties.interval.maximum,
    monthly: MonthlyRecurrence.properties.interval.maximum
  };
  return HEADER + `export const ROUTINE_MAX_INTERVAL = ${JSON.stringify(maxIntervals, null, 2)} as const;\n\n` + astToString(ast);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(API_TYPES_PATH, await generateApiTypes());
  console.log(`wrote ${API_TYPES_PATH}`);
}
