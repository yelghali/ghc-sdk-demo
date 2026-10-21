import assert from "node:assert/strict";
import { CopilotChat } from "../copilot.mjs";
import { createChatServer, listen } from "../server.mjs";

const chat = new CopilotChat();
const server = createChatServer(chat);
try {
  await chat.client.start();
  const url = await listen(server, 0);
  const statusResponse = await fetch(`${url}/api/status`);
  const status = await statusResponse.json();
  if (!statusResponse.ok) throw new Error(status.error);
  const model = process.env.COPILOT_MODEL || status.model;
  console.log(`Authenticated as ${status.login || "the current account"}; credential source: ${status.authType || "not reported"}.`);
  console.log(`Testing HTTP chat with ${model}. This uses your Copilot allowance.`);
  for (const message of [
    "Reply with exactly COPILOT_CHAT_OK and nothing else.",
    "What exact marker did you just reply with? Reply with only that marker.",
  ]) {
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: url },
      body: JSON.stringify({ message, model }),
      signal: AbortSignal.timeout(150_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    assert.equal(result.reply.trim(), "COPILOT_CHAT_OK");
    console.log(`PASS: ${result.reply.trim()}`);
  }
  console.log("PASS: live Copilot authentication, model access, HTTP chat, and conversation memory.");
} catch (error) {
  console.error("Live smoke test failed:", error);
  process.exitCode = 1;
} finally {
  server.close();
  server.closeAllConnections();
  await chat.stop();
}
