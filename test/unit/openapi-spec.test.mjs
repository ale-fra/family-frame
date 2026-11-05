import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { openApiSpec } from "../../server/lib/openapi.mjs";
import { createPublicScheduleRouter, createRoutinesRouter, createTimersRouter } from "../../server/lib/schedule-routes.mjs";
import { createContractValidator } from "../helpers/openapi-contract.mjs";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
// The only operations readable without the PIN. Anything else must require it.
const PUBLIC_OPERATIONS = ["GET /api/schedule"];

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    await expect(SwaggerParser.validate(structuredClone(openApiSpec))).resolves.toBeTruthy();
    expect(openApiSpec.openapi).toMatch(/^3\.1\./);
  });

  it("documents exactly the routes the server implements", () => {
    const implemented = [
      ...routesOf(createTimersRouter({}, () => {}), "/api/admin/timers"),
      ...routesOf(createRoutinesRouter({}, () => {}), "/api/admin/routines"),
      ...routesOf(createPublicScheduleRouter({}), "/api/schedule")
    ].sort();
    const documented = Object.entries(openApiSpec.paths)
      .flatMap(([template, item]) => HTTP_METHODS.filter((method) => item[method]).map((method) => `${method.toUpperCase()} ${template}`))
      .sort();
    expect(documented).toEqual(implemented);
  });

  it("requires the admin PIN or an API token on every operation except the public read-only ones", () => {
    expect(openApiSpec.components.securitySchemes.AdminPin).toEqual({
      type: "apiKey",
      in: "header",
      name: "X-Frame-Admin-Pin",
      description: expect.any(String)
    });
    expect(openApiSpec.components.securitySchemes.BearerToken).toEqual({
      type: "http",
      scheme: "bearer",
      description: expect.any(String)
    });
    for (const [template, item] of Object.entries(openApiSpec.paths)) {
      for (const method of HTTP_METHODS.filter((name) => item[name])) {
        const operation = item[method];
        if (PUBLIC_OPERATIONS.includes(`${method.toUpperCase()} ${template}`)) {
          expect(operation.security, `${method} ${template}`).toEqual([]);
          expect(method, "public operations are read-only").toBe("get");
          continue;
        }
        expect(operation.security ?? openApiSpec.security, `${method} ${template}`).toEqual([{ AdminPin: [] }, { BearerToken: [] }]);
        expect(operation.responses["401"], `${method} ${template} documents 401`).toBeDefined();
        expect(operation.responses["429"], `${method} ${template} documents 429`).toBeDefined();
        expect(operation.operationId, `${method} ${template} has an operationId`).toMatch(/^[a-z][A-Za-z]+$/);
      }
    }
  });

  it("documents the outgoing schedule webhook", () => {
    expect(openApiSpec.webhooks.scheduleEvent.post.requestBody.content["application/json"].schema)
      .toEqual({ $ref: "#/components/schemas/ScheduleEvent" });
  });

  it("maps every discriminator value explicitly (otherwise OpenAPI means the schema name)", () => {
    const schemas = openApiSpec.components.schemas;
    const withDiscriminator = Object.entries(schemas).filter(([, schema]) => schema.discriminator);
    expect(withDiscriminator.length).toBeGreaterThan(0);
    for (const [name, schema] of withDiscriminator) {
      const { propertyName, mapping } = schema.discriminator;
      const branches = schema.oneOf.map(({ $ref }) => $ref);
      const values = branches.map((ref) => schemas[ref.split("/").at(-1)].properties[propertyName].const);
      expect(mapping, name).toEqual(Object.fromEntries(values.map((value, index) => [value, branches[index]])));
    }
  });

  it("has examples that match their own schemas", () => {
    const contract = createContractValidator(openApiSpec);
    const operations = [
      ...Object.entries(openApiSpec.paths).flatMap(([template, item]) =>
        HTTP_METHODS.filter((method) => item[method]).map((method) => [`${method} ${template}`, item[method]])),
      ...Object.entries(openApiSpec.webhooks).map(([name, item]) => [`webhook ${name}`, item.post])
    ];
    let checked = 0;
    for (const [label, operation] of operations) {
      const media = operation.requestBody?.content?.["application/json"];
      for (const [name, example] of Object.entries(media?.examples ?? {})) {
        contract.validate(media.schema, example.value, `${label} example ${name}`);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("offers ready-to-run examples for every request body", () => {
    for (const [template, item] of Object.entries(openApiSpec.paths)) {
      for (const method of HTTP_METHODS.filter((name) => item[name] && item[name].requestBody)) {
        const media = item[method].requestBody.content["application/json"];
        expect(Object.keys(media.examples ?? {}).length, `${method} ${template}`).toBeGreaterThan(0);
      }
    }
  });
});

function routesOf(router, prefix) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods)
      .filter((method) => HTTP_METHODS.includes(method))
      .map((method) => {
        const path = `${prefix}${layer.route.path === "/" ? "" : layer.route.path}`.replace(/:(\w+)/g, "{$1}");
        return `${method.toUpperCase()} ${path}`;
      }));
}
