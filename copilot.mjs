import { homedir } from "node:os";
import { join } from "node:path";
import { CopilotClient } from "@github/copilot-sdk";

export class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createCopilotClient() {
  return new CopilotClient({
    mode: "copilot-cli",
    baseDirectory: process.env.COPILOT_HOME || join(homedir(), ".copilot"),
    useLoggedInUser: true,
  });
}

export function chatSessionOptions(model) {
  return {
    model,
    availableTools: [],
    excludedTools: ["builtin:*", "mcp:*", "custom:*"],
    tools: [],
    mcpServers: {},
    enableConfigDiscovery: false,
    skipCustomInstructions: true,
    enableSkills: false,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableOnDemandInstructionDiscovery: false,
    enableSessionStore: false,
    enableSessionTelemetry: false,
    skipEmbeddingRetrieval: true,
    embeddingCacheStorage: "in-memory",
    memory: { enabled: false },
    remoteSession: "off",
    infiniteSessions: { enabled: false },
    onPermissionRequest: () => ({
      kind: "reject",
      feedback: "This chat demo does not allow tool execution.",
    }),
    systemMessage: {
      mode: "replace",
      content: "You are a helpful chat assistant. Answer conversationally. You have no tools, filesystem access, or shell access.",
    },
  };
}

export class CopilotChat {
  constructor(client = createCopilotClient()) {
    this.client = client;
    this.history = [];
    this.busy = false;
  }

  async status() {
    const auth = await this.client.getAuthStatus();
    if (!auth.isAuthenticated) {
      throw new ChatError(401, "Copilot is not signed in. Run .\\login.ps1, complete GitHub sign-in, then restart this app.");
    }
    const models = (await this.client.listModels())
      .filter((model) => model.policy?.state !== "disabled")
      .map(({ id, name, billing }) => ({ id, name, multiplier: billing?.multiplier }));
    if (models.length === 0) {
      throw new ChatError(503, "No Copilot models are available. Check your Copilot subscription and organization policy.");
    }
    const preferred = models.find((model) => model.id.startsWith("gpt-")) || models[0];
    return {
      authenticated: true,
      login: auth.login,
      authType: auth.authType,
      models,
      model: this.model || preferred.id,
      history: this.history,
    };
  }

  async chat(message, model) {
    if (typeof message !== "string" || !message.trim() || message.length > 8000) {
      throw new ChatError(400, "Enter a message between 1 and 8,000 characters.");
    }
    if (this.busy) {
      throw new ChatError(409, "A reply is already in progress.");
    }
    this.busy = true;
    try {
      const status = await this.status();
      if (!status.models.some((candidate) => candidate.id === model)) {
        throw new ChatError(400, "Select a model available to your Copilot account.");
      }
      if (!this.session) {
        this.session = await this.client.createSession(chatSessionOptions(model));
        this.model = model;
      } else if (this.model !== model) {
        await this.session.setModel(model);
        this.model = model;
      }
      const response = await this.session.sendAndWait({ prompt: message.trim() }, 120_000);
      const reply = response?.data.content;
      if (typeof reply !== "string" || !reply.trim()) {
        throw new ChatError(502, "Copilot returned no text. Start a new chat and retry.");
      }
      this.history.push({ role: "user", content: message.trim() }, { role: "assistant", content: reply });
      return { reply, model };
    } finally {
      this.busy = false;
    }
  }

  async reset() {
    if (this.busy) {
      throw new ChatError(409, "Wait for the current reply before starting a new chat.");
    }
    this.busy = true;
    try {
      if (this.session) {
        await this.session.abort();
        await this.session.disconnect();
      }
      this.session = undefined;
      this.model = undefined;
      this.history = [];
    } finally {
      this.busy = false;
    }
  }

  async stop() {
    const errors = await this.client.stop();
    if (errors.length) {
      throw new AggregateError(errors, "Copilot runtime did not stop cleanly.");
    }
  }
}
