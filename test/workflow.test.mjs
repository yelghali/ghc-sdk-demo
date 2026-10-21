import assert from "node:assert/strict";
import test from "node:test";
import { runWorkflow } from "../scripts/workflow.mjs";

function fakeWorkflow() {
  const calls = [];
  return {
    calls,
    client: { start: async () => calls.push("start") },
    status: async () => ({ model: "gpt-test" }),
    chat: async (message, model) => {
      calls.push({ message, model });
      return { reply: calls.length === 2 ? "Three-step plan" : "Risk and improvement" };
    },
    stop: async () => calls.push("stop"),
  };
}

test("workflow runs plan then review with the same authenticated client", async () => {
  const chat = fakeWorkflow();
  const result = await runWorkflow(" Teach testing ", chat);
  assert.equal(result.model, process.env.COPILOT_MODEL || "gpt-test");
  assert.equal(result.plan, "Three-step plan");
  assert.equal(result.review, "Risk and improvement");
  assert.equal(chat.calls[0], "start");
  assert.match(chat.calls[1].message, /Goal: Teach testing$/);
  assert.match(chat.calls[2].message, /Review your previous plan/);
  assert.equal(chat.calls[1].model, chat.calls[2].model);
  assert.equal(chat.calls[3], "stop");
});

test("workflow rejects invalid goals before starting a runtime", async () => {
  for (const goal of [undefined, "", " ", 123, "x".repeat(2001)]) {
    const chat = fakeWorkflow();
    await assert.rejects(runWorkflow(goal, chat), { status: 400 });
    assert.deepEqual(chat.calls, []);
  }
});

test("workflow fails explicitly and stops when a model step fails", async () => {
  const chat = fakeWorkflow();
  chat.chat = async () => { throw new Error("Model access denied"); };
  await assert.rejects(runWorkflow("Teach testing", chat), /Model access denied/);
  assert.deepEqual(chat.calls, ["start", "stop"]);
});

test("workflow stops if authentication or runtime startup fails", async () => {
  for (const failingStep of ["start", "status"]) {
    const chat = fakeWorkflow();
    const fail = async () => { throw new Error(`${failingStep} failed`); };
    if (failingStep === "start") chat.client.start = fail;
    else chat.status = fail;
    await assert.rejects(runWorkflow("Teach testing", chat), new RegExp(`${failingStep} failed`));
    assert.equal(chat.calls.at(-1), "stop");
  }
});
