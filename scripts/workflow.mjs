import { pathToFileURL } from "node:url";
import { ChatError, CopilotChat } from "../copilot.mjs";

export async function runWorkflow(goal, chat = new CopilotChat()) {
  if (typeof goal !== "string" || !goal.trim() || goal.length > 2000) {
    throw new ChatError(400, "Provide a workflow goal between 1 and 2,000 characters.");
  }
  try {
    await chat.client.start();
    const status = await chat.status();
    const model = process.env.COPILOT_MODEL || status.model;
    const plan = await chat.chat(
      `Create a practical three-step plan for this goal. Keep it under 150 words.\nGoal: ${goal.trim()}`,
      model,
    );
    const review = await chat.chat(
      "Review your previous plan. Identify one risk and one concrete improvement. Keep the review under 100 words.",
      model,
    );
    return { model, plan: plan.reply, review: review.reply };
  } finally {
    await chat.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const goal = process.argv.slice(2).join(" ") || "Plan a 30-minute study session on JavaScript promises.";
  console.error("Running two sequential Copilot model calls with your own account. This uses your Copilot allowance.");
  runWorkflow(goal)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error("Workflow failed:", error);
      process.exitCode = 1;
    });
}
