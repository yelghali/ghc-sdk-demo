import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { CopilotChat, chatSessionOptions } from "../copilot.mjs";
import { createChatServer, listen } from "../server.mjs";

function fakeClient(overrides = {}) {
  const calls = [];
  const session = {
    sendAndWait: async ({ prompt }) => ({ data: { content: `Reply to ${prompt}` } }),
    abort: async () => calls.push("abort"),
    disconnect: async () => calls.push("disconnect"),
  };
  return {
    calls,
    session,
    getAuthStatus: async () => ({ isAuthenticated: true, login: "test-user" }),
    listModels: async () => [
      { id: "gpt-test", name: "Test GPT" },
      { id: "blocked", name: "Blocked", policy: { state: "disabled" } },
    ],
    createSession: async (options) => { calls.push(options); return session; },
    stop: async () => [],
    ...overrides,
  };
}

async function withServer(t, chat) {
  const logs = [];
  const server = createChatServer(chat, { logger: { error: (...args) => logs.push(args) } });
  const url = await listen(server, 0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const post = (path, body, headers = {}) => fetch(url + path, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { url, post, logs };
}

test("session configuration disables every tool source and ambient features", () => {
  const config = chatSessionOptions("gpt-test");
  assert.deepEqual(config.availableTools, []);
  assert.deepEqual(config.excludedTools, ["builtin:*", "mcp:*", "custom:*"]);
  assert.deepEqual(config.mcpServers, {});
  assert.deepEqual(config.tools, []);
  for (const key of [
    "enableConfigDiscovery", "enableSkills", "enableFileHooks",
    "enableHostGitOperations", "enableOnDemandInstructionDiscovery",
    "enableSessionStore", "enableSessionTelemetry",
  ]) assert.equal(config[key], false, key);
  assert.equal(config.skipCustomInstructions, true);
  assert.equal(config.memory.enabled, false);
  assert.equal(config.remoteSession, "off");
  assert.equal(config.onPermissionRequest().kind, "reject");
});

test("unauthenticated and empty model catalogs fail explicitly", async () => {
  const signedOut = new CopilotChat(fakeClient({
    getAuthStatus: async () => ({ isAuthenticated: false }),
  }));
  await assert.rejects(signedOut.status(), { status: 401 });
  const noModels = new CopilotChat(fakeClient({ listModels: async () => [] }));
  await assert.rejects(noModels.status(), { status: 503 });
});

test("chat reuses a session for follow-ups and reset aborts/disconnects it", async () => {
  const client = fakeClient();
  const chat = new CopilotChat(client);
  assert.equal((await chat.status()).models.length, 1);
  assert.deepEqual(await chat.chat(" Hello ", "gpt-test"), {
    reply: "Reply to Hello", model: "gpt-test",
  });
  await chat.chat("Remember?", "gpt-test");
  assert.equal(client.calls.length, 1);
  assert.equal(chat.history.length, 4);
  assert.equal((await chat.status()).history[0].content, "Hello");
  await chat.reset();
  assert.deepEqual(client.calls.slice(1), ["abort", "disconnect"]);
  assert.deepEqual(chat.history, []);
  await chat.chat("Fresh", "gpt-test");
  assert.equal(client.calls.length, 4);
});

test("invalid input and unavailable models never create a session", async () => {
  const client = fakeClient();
  const chat = new CopilotChat(client);
  for (const message of [undefined, "", " ", 123, "a".repeat(8001)]) {
    await assert.rejects(chat.chat(message, "gpt-test"), { status: 400 });
  }
  await assert.rejects(chat.chat("Hello", "blocked"), { status: 400 });
  assert.equal(client.calls.length, 0);
  assert.equal(chat.busy, false);
});

test("concurrent chat and reset are rejected while a reply is running", async () => {
  const client = fakeClient();
  let finish;
  client.session.sendAndWait = () => new Promise((resolve) => { finish = resolve; });
  const chat = new CopilotChat(client);
  const pending = chat.chat("Hello", "gpt-test");
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(chat.chat("Again", "gpt-test"), { status: 409 });
  await assert.rejects(chat.reset(), { status: 409 });
  finish({ data: { content: "Done" } });
  await pending;
  assert.equal(chat.busy, false);
});

test("empty replies and SDK failures are not success-shaped fallbacks", async () => {
  const client = fakeClient();
  const chat = new CopilotChat(client);
  client.session.sendAndWait = async () => undefined;
  await assert.rejects(chat.chat("Hello", "gpt-test"), { status: 502 });
  client.session.sendAndWait = async () => { throw new Error("Provider unavailable"); };
  await assert.rejects(chat.chat("Again", "gpt-test"), /Provider unavailable/);
  assert.deepEqual(chat.history, []);
  assert.equal(chat.busy, false);
});

test("HTTP serves themed UI, status, chat, reset, and restrictive headers", async (t) => {
  const { url, post } = await withServer(t, new CopilotChat(fakeClient()));
  const page = await fetch(url + "/?clawpilotTheme=dark");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'sha256-/);
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  const html = await page.text();
  assert.doesNotMatch(html, /\r/);
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const hash = createHash("sha256").update(script).digest("base64");
    assert.ok(page.headers.get("content-security-policy").includes(`'sha256-${hash}'`));
  }
  assert.match(html, /--cp-accent:/);
  assert.match(html, /aria-label="Conversation"/);
  const status = await (await fetch(url + "/api/status")).json();
  assert.equal(status.login, "test-user");
  const reply = await post("/api/chat", { message: "Hello", model: "gpt-test" });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).reply, "Reply to Hello");
  assert.equal((await post("/api/reset", {})).status, 200);
  assert.equal((await fetch(url + "/missing")).status, 404);
});

test("HTTP rejects cross-origin writes, unsupported types, malformed and oversized JSON", async (t) => {
  const { url, post } = await withServer(t, new CopilotChat(fakeClient()));
  assert.equal((await post("/api/chat", {}, { Origin: "https://example.com" })).status, 403);
  assert.equal((await post("/api/chat", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post("/api/chat", { message: "x".repeat(24_001) })).status, 413);
  assert.equal((await post("/api/chat", [])).status, 400);
  const malformed = await fetch(url + "/api/chat", {
    method: "POST", headers: { Origin: url, "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformed.status, 400);
  const missingOrigin = await fetch(url + "/api/reset", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(missingOrigin.status, 403);
});

test("HTTP rejects a rebound Host header", async (t) => {
  const { url } = await withServer(t, new CopilotChat(fakeClient()));
  const request = httpRequest(url + "/api/status", { headers: { Host: "evil.example" } });
  request.end();
  const [response] = await once(request, "response");
  response.resume();
  assert.equal(response.statusCode, 403);
});

test("HTTP exposes actionable auth errors but not raw SDK internals", async (t) => {
  const chat = new CopilotChat(fakeClient({
    getAuthStatus: async () => ({ isAuthenticated: false }),
  }));
  const { url, logs } = await withServer(t, chat);
  const signedOut = await fetch(url + "/api/status");
  assert.equal(signedOut.status, 401);
  assert.match((await signedOut.json()).error, /setup\.ps1/);
  chat.client.getAuthStatus = async () => { throw new Error("internal provider details"); };
  const failed = await fetch(url + "/api/status");
  assert.equal(failed.status, 502);
  assert.doesNotMatch((await failed.json()).error, /internal provider details/);
  assert.equal(logs.length, 1);
});

test("changing models requires reset and stop errors propagate", async () => {
  const client = fakeClient({
    listModels: async () => [{ id: "gpt-test" }, { id: "gpt-other" }],
  });
  const chat = new CopilotChat(client);
  await chat.chat("Hello", "gpt-test");
  await assert.rejects(chat.chat("Hello", "gpt-other"), { status: 409 });
  client.stop = async () => [new Error("shutdown failed")];
  await assert.rejects(chat.stop(), AggregateError);
});
