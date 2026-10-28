import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app";

test("publishes the public catalog and lead intake in OpenAPI", async () => {
  const app = await buildApp();
  try {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(response.statusCode, 200);
    const specification = response.json<{ paths: Record<string, unknown> }>();
    assert.ok(specification.paths["/api/v1/public/motorcycles"]);
    assert.ok(specification.paths["/api/v1/public/leads"]);
    assert.ok(specification.paths["/api/v1/crm/reports"]);
  } finally {
    await app.close();
  }
});
