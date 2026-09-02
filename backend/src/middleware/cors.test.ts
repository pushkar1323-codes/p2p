import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../app.ts";

async function startTestServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("GET responses include Access-Control-Allow-Origin for the configured frontend origin", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(res.headers.get("vary"), "Origin");
  } finally {
    await close();
  }
});

test("an OPTIONS preflight request gets a 204 with CORS method/header allowances", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/health`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /GET/);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /Content-Type/);
  } finally {
    await close();
  }
});
