import { createCopilotClient } from "../copilot.mjs";

const client = createCopilotClient();
try {
  await client.start();
  const auth = await client.getAuthStatus();
  if (auth.isAuthenticated) {
    console.log(`Copilot is signed in${auth.login ? ` as ${auth.login}` : ""}.`);
    console.log(`Credential source: ${auth.authType || "not reported by runtime"}${auth.authType === "user" ? " (stored Copilot CLI login)" : ""}.`);
  } else {
    console.error("Copilot is not signed in. Run .\\login.ps1 to authenticate with GitHub.");
    process.exitCode = 2;
  }
} catch (error) {
  console.error("Could not check Copilot authentication:", error);
  process.exitCode = 1;
} finally {
  const errors = await client.stop();
  if (errors.length) {
    console.error("Copilot shutdown failed:", errors);
    process.exitCode = 1;
  }
}
