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
  const switchModel = process.env.COPILOT_SWITCH_MODEL;
  if (switchModel && (switchModel === model || !status.models.some(({ id }) => id === switchModel))) {
    throw new Error("COPILOT_SWITCH_MODEL must name a different model available to your account.");
  }
  console.log(`Authenticated as ${status.login || "the current account"}; credential source: ${status.authType || "not reported"}.`);
  console.log(`Testing HTTP chat with ${model}. This uses your Copilot allowance.`);
  const prompts = [
    "Reply with exactly COPILOT_CHAT_OK and nothing else.",
    "What exact marker did you just reply with? Reply with only that marker.",
  ];
  for (const [index, message] of prompts.entries()) {
    const selectedModel = index === 1 && switchModel ? switchModel : model;
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: url },
      body: JSON.stringify({ message, model: selectedModel }),
      signal: AbortSignal.timeout(150_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    assert.equal(result.reply.trim(), "COPILOT_CHAT_OK");
    assert.equal(result.model, selectedModel);
    if (switchModel) {
      const current = await chat.session.rpc.model.getCurrent();
      assert.equal(current.modelId, selectedModel);
    }
    console.log(`PASS: ${result.reply.trim()} from ${result.model}`);
  }
  const finalStatus = await (await fetch(`${url}/api/status`)).json();
  assert.equal(finalStatus.model, switchModel || model);
  assert.equal(finalStatus.history.length, 4);
  if (switchModel) console.log("PASS: SDK model switch preserved conversation memory.");
  console.log("PASS: live Copilot authentication, model access, HTTP chat, and conversation memory.");
} catch (error) {
  console.error("Live smoke test failed:", error);
  process.exitCode = 1;
} finally {
  server.close();
  server.closeAllConnections();
  await chat.stop();
}
