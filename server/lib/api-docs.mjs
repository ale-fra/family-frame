import { createRequire } from "node:module";
import { openApiSpec } from "./openapi.mjs";

// Only the helper, not the package entry point, which would load the 1.7 MB browser bundle into the server.
const swaggerUiDir = createRequire(import.meta.url)("swagger-ui-dist/absolute-path.js")();

// Explicit allowlist: the package also ships a demo index.html and initializer pointing at a remote Petstore spec.
const ASSETS = new Map([
  ["swagger-ui.css", "text/css; charset=utf-8"],
  ["swagger-ui-bundle.js", "text/javascript; charset=utf-8"],
  ["favicon-16x16.png", "image/png"],
  ["favicon-32x32.png", "image/png"]
]);

// Swagger UI needs inline style attributes; scripts are same-origin files only.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join("; ");

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Family Frame API</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css">
    <link rel="icon" type="image/png" sizes="32x32" href="/api/docs/favicon-32x32.png">
  </head>
  <body>
    <form id="docs-unlock" hidden>
      <label for="docs-pin">Family Frame admin PIN</label>
      <input id="docs-pin" type="password" autocomplete="current-password" required>
      <button type="submit">Unlock API docs</button>
    </form>
    <p id="docs-status" role="status">Loading API documentation…</p>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>
`;

// persistAuthorization: false keeps the PIN in memory (not localStorage); reloading forgets it.
// queryConfigEnabled: false ignores ?url= / ?configUrl= so a crafted link cannot load another spec.
// validatorUrl: null avoids sending the spec URL to validator.swagger.io.
const INIT_SCRIPT = `window.addEventListener("load", function () {
  const form = document.getElementById("docs-unlock");
  const input = document.getElementById("docs-pin");
  const status = document.getElementById("docs-status");
  const button = form.querySelector("button");

  async function unlock(pin) {
    button.disabled = true;
    try {
      const response = await fetch("/api/openapi.json", {
        headers: pin ? { "X-Frame-Admin-Pin": pin } : {},
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 429) {
        form.hidden = false;
        status.textContent = response.status === 429 ? (await response.json()).error :
          pin ? "Incorrect PIN. Try again." : "Enter the admin PIN to view the API documentation.";
        input.focus();
        return;
      }
      if (!response.ok) throw new Error("API documentation is unavailable.");
      const spec = await response.json();
      const ui = SwaggerUIBundle({
        spec,
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: false,
        queryConfigEnabled: false,
        validatorUrl: null,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 0,
        filter: true,
        onComplete: function () {
          if (pin) ui.preauthorizeApiKey("AdminPin", pin);
        }
      });
      input.value = "";
      form.hidden = true;
      status.hidden = true;
    } catch {
      status.textContent = "Could not load the API documentation. Reload the page to try again.";
    } finally {
      button.disabled = false;
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    void unlock(input.value);
  });
  void unlock();
});`;

/** Serves the login shell and local assets. The OpenAPI spec needs schedule access, like the API it describes. */
export function registerApiDocs(app, requireSchedule) {
  app.get("/api/openapi.json", requireSchedule, (_request, response) => {
    response.json(openApiSpec);
  });

  app.get("/api/docs", (_request, response) => {
    setPageSecurityHeaders(response);
    response.type("html").send(PAGE);
  });

  app.get("/api/docs/init.js", (_request, response) => {
    setPageSecurityHeaders(response);
    response.type("text/javascript; charset=utf-8").send(INIT_SCRIPT);
  });

  app.get("/api/docs/:asset", (request, response) => {
    const contentType = ASSETS.get(request.params.asset);
    if (!contentType) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    response.setHeader("Cache-Control", "public, max-age=86400");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.type(contentType).sendFile(request.params.asset, { root: swaggerUiDir });
  });
}

function setPageSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
}
