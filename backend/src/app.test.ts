import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.ts";

/** Starts the app on an ephemeral port and returns its base URL + a closer. */
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

test("GET /health returns 200 with a status/environment/uptime/timestamp payload", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      environment: string;
      uptimeSeconds: number;
      timestamp: string;
    };
    assert.equal(body.status, "ok");
    assert.ok(typeof body.environment === "string");
    assert.ok(typeof body.uptimeSeconds === "number");
    assert.ok(typeof body.timestamp === "string");
    // Timestamp should be a valid, parseable ISO date.
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  } finally {
    await close();
  }
});

test("an unmatched route returns a safe 404 JSON error, not an HTML default page", async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/no-such-route`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "NOT_FOUND");
    assert.match(body.error.message, /GET \/no-such-route/);
  } finally {
    await close();
  }
});
