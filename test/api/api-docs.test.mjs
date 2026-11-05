import { afterEach, describe, expect, it } from "vitest";
import { createFrameServerApp } from "../../server/lib/app.mjs";
import { createRuntimeConfig } from "../../server/lib/env.mjs";
import { openApiSpec } from "../../server/lib/openapi.mjs";

const PIN = "1234";

describe("Swagger UI", () => {
  let server;

  async function start(runtime = {}) {
    const app = createFrameServerApp({
      runtime: { adminPin: PIN, distDir: "/nonexistent", indexPath: "/nonexistent/index.html", photoDir: "/nonexistent", ...runtime },
      calendarService: {},
      clientLog: {},
      photoStore: {},
      settingsStore: {},
      systemActions: {},
      scheduleStore: {}
    });
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    return `http://127.0.0.1:${server.address().port}`;
  }

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  it("serves the login shell but requires the PIN before sharing the spec", async () => {
    const baseUrl = await start();
    const page = await fetch(`${baseUrl}/api/docs`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/text\/html/);
    const html = await page.text();
    expect(html).toContain('src="/api/docs/swagger-ui-bundle.js"');
    expect(html).toContain('src="/api/docs/init.js"');
    expect(html).toContain('href="/api/docs/swagger-ui.css"');
    expect(html).not.toMatch(/https?:\/\//); // no CDN: nothing third-party runs where the PIN is typed
    expect(html).not.toMatch(/<script>/); // no inline script, so the CSP can forbid it

    expect(html).toContain('type="password"');
    const specUrl = `${baseUrl}/api/openapi.json`;
    expect((await fetch(specUrl)).status).toBe(401);
    expect((await fetch(specUrl, { headers: { "X-Frame-Admin-Pin": "wrong" } })).status).toBe(401);
    const spec = await fetch(specUrl, { headers: { "X-Frame-Admin-Pin": PIN } });
    expect(spec.status).toBe(200);
    expect(await spec.json()).toEqual(JSON.parse(JSON.stringify(openApiSpec)));
  });

  it("locks the page down with security headers", async () => {
    const baseUrl = await start();
    const page = await fetch(`${baseUrl}/api/docs`);
    const csp = page.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("cache-control")).toBe("no-store");
  });

  it("configures Swagger UI to keep the PIN in memory only and never load remote configs", async () => {
    const baseUrl = await start();
    const init = await fetch(`${baseUrl}/api/docs/init.js`);
    expect(init.headers.get("content-type")).toMatch(/javascript/);
    const script = await init.text();
    expect(script).toContain('fetch("/api/openapi.json"');
    expect(script).toContain("persistAuthorization: false");
    expect(script).toContain("queryConfigEnabled: false");
    expect(script).toContain("validatorUrl: null");
  });

  it("serves only the Swagger UI assets it needs, from the local package", async () => {
    const baseUrl = await start();
    const bundle = await fetch(`${baseUrl}/api/docs/swagger-ui-bundle.js`);
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get("content-type")).toMatch(/javascript/);
    expect(bundle.headers.get("cache-control")).toMatch(/max-age=\d+/);
    expect((await fetch(`${baseUrl}/api/docs/swagger-ui.css`)).headers.get("content-type")).toMatch(/text\/css/);
    expect((await fetch(`${baseUrl}/api/docs/favicon-32x32.png`)).status).toBe(200);

    for (const file of ["index.html", "swagger-initializer.js", "package.json", "..%2Fpackage.json", "%2e%2e%2f%2e%2e%2fpackage.json", "swagger-ui.js.map"]) {
      expect((await fetch(`${baseUrl}/api/docs/${file}`)).status, file).toBe(404);
    }
  });

  it("does not require a PIN for the spec when the admin API is open", async () => {
    const baseUrl = await start({ adminPin: "" });
    expect((await fetch(`${baseUrl}/api/openapi.json`)).status).toBe(200);
  });

  it("still protects the API itself", async () => {
    const baseUrl = await start();
    expect((await fetch(`${baseUrl}/api/admin/timers`)).status).toBe(401);
  });

  it("never lets other websites send the PIN header (no CORS grant)", async () => {
    const baseUrl = await start();
    const preflight = await fetch(`${baseUrl}/api/admin/timers`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-frame-admin-pin, content-type"
      }
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    expect(preflight.headers.get("access-control-allow-headers")).toBeNull();
  });

  it.each([
    [undefined, true], ["", true], ["true", true], ["1", true],
    ["false", false], ["0", false], ["off", false], ["no", false], ["FALSE", false]
  ])("reads FRAME_API_DOCS=%j as enabled=%s", (value, expected) => {
    const previous = process.env.FRAME_API_DOCS;
    if (value === undefined) delete process.env.FRAME_API_DOCS;
    else process.env.FRAME_API_DOCS = value;
    try {
      expect(createRuntimeConfig().apiDocs).toBe(expected);
    } finally {
      if (previous === undefined) delete process.env.FRAME_API_DOCS;
      else process.env.FRAME_API_DOCS = previous;
    }
  });

  it("can be disabled with FRAME_API_DOCS=false", async () => {
    const baseUrl = await start({ apiDocs: false });
    expect((await fetch(`${baseUrl}/api/docs`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/openapi.json`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/docs/swagger-ui-bundle.js`)).status).toBe(404);
  });
});
