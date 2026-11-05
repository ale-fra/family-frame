import Ajv2020 from "ajv/dist/2020.js";

/**
 * Validates real HTTP traffic against the OpenAPI document, so the spec cannot drift from the code:
 * - every response status must be documented for the operation, and its JSON body must match the schema;
 * - every request body that the server accepted (2xx) must match the documented request schema.
 */
export function createContractValidator(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, discriminator: true });
  ajv.addKeyword("components"); // container for $ref targets in the wrapper schema below
  ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
  ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  ajv.addSchema({ $id: "openapi", components: { schemas: withoutDiscriminatorMappings(spec.components.schemas) } });

  const compiled = new Map();
  const validatorFor = (schema) => {
    const key = JSON.stringify(schema);
    if (!compiled.has(key)) compiled.set(key, ajv.compile(rebase(withoutDiscriminatorMappings(schema))));
    return compiled.get(key);
  };

  // Literal segments win over templated ones (/routines/occurrences before /routines/{id}).
  const templates = Object.keys(spec.paths)
    .map((template) => ({
      template,
      params: (template.match(/\{/g) || []).length,
      regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`)
    }))
    .sort((left, right) => left.params - right.params);

  function findOperation(method, url) {
    const pathname = new URL(url, "http://localhost").pathname;
    for (const { template, regex } of templates) {
      const operation = regex.test(pathname) && spec.paths[template][method.toLowerCase()];
      if (operation) return { template, operation };
    }
    return null;
  }

  function check({ method, url, requestBody, status, responseBody }) {
    const found = findOperation(method, url);
    if (!found) throw new Error(`Undocumented operation: ${method} ${url}`);
    const { template, operation } = found;
    const label = `${method} ${template} → ${status}`;

    const response = resolve(spec, operation.responses[String(status)]);
    if (!response) throw new Error(`Undocumented status: ${label}`);
    const schema = response.content?.["application/json"]?.schema;
    if (!schema) {
      if (responseBody !== null) throw new Error(`Undocumented response body for ${label}`);
    } else {
      assertValid(validatorFor(schema), responseBody, `response of ${label}`);
    }

    if (status >= 200 && status < 300 && requestBody !== undefined) {
      const requestSchema = resolve(spec, operation.requestBody)?.content?.["application/json"]?.schema;
      if (!requestSchema) throw new Error(`Undocumented request body for ${label}`);
      assertValid(validatorFor(requestSchema), requestBody, `request of ${label}`);
    }
  }

  /** Validates an outgoing webhook payload against spec.webhooks[name].post.requestBody. */
  function checkWebhook(name, body) {
    const schema = spec.webhooks?.[name]?.post?.requestBody?.content?.["application/json"]?.schema;
    if (!schema) throw new Error(`Undocumented webhook: ${name}`);
    assertValid(validatorFor(schema), body, `webhook ${name}`);
  }

  /** Validates any value against a schema from the document (e.g. an example). */
  function validate(schema, data, label = "value") {
    assertValid(validatorFor(schema), data, label);
  }

  return { check, checkWebhook, findOperation, validate };
}

function assertValid(validate, data, label) {
  if (validate(data)) return;
  throw new Error(`OpenAPI contract violation in ${label}:\n${JSON.stringify(validate.errors, null, 2)}\n` +
    `data: ${JSON.stringify(data)}`);
}

function resolve(spec, value) {
  if (!value?.$ref) return value;
  return value.$ref.replace(/^#\//, "").split("/").reduce((node, key) => node?.[key], spec);
}

// Component $refs ("#/components/schemas/X") point into the registered "openapi" wrapper schema.
function rebase(schema) {
  return JSON.parse(JSON.stringify(schema).replaceAll('"$ref":"#/', '"$ref":"openapi#/'));
}

// Ajv's discriminator uses each branch's `const` and rejects OpenAPI's `mapping` keyword, which only repeats it.
function withoutDiscriminatorMappings(schemas) {
  return JSON.parse(JSON.stringify(schemas, (key, value) => (
    key === "discriminator" && value && typeof value === "object" ? { propertyName: value.propertyName } : value
  )));
}
