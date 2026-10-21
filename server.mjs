import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { ChatError, CopilotChat } from "./copilot.mjs";

// Browsers normalize HTML line endings before checking inline script hashes.
const html = (await readFile(new URL("./index.html", import.meta.url), "utf8")).replace(/\r\n?/g, "\n");
const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`)
  .join(" ");

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 24_000) {
        reject(new ChatError(413, "Request body is too large."));
      } else {
        chunks.push(chunk);
      }
    });
    request.on("error", reject);
    request.on("end", () => {
      if (bytes > 24_000) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Expected an object.");
        }
        resolve(value);
      } catch {
        reject(new ChatError(400, "Send a valid JSON object."));
      }
    });
  });
}

export function createChatServer(chat, { logger = console } = {}) {
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Content-Security-Policy",
      `default-src 'none'; script-src ${scriptHashes}; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    const json = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      if (request.headers.host !== authority ||
          (request.headers.origin && request.headers.origin !== `http://${authority}`)) {
        throw new ChatError(403, "Only this app's localhost origin is allowed.");
      }
      const path = new URL(request.url, `http://${authority}`).pathname;
      if (request.method === "GET" && path === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
      } else if (request.method === "GET" && path === "/api/health") {
        json(200, { ok: true });
      } else if (request.method === "GET" && path === "/api/status") {
        json(200, await chat.status());
      } else if (request.method === "POST" && ["/api/chat", "/api/reset"].includes(path)) {
        if (request.headers.origin !== `http://${authority}`) {
          throw new ChatError(403, "A same-origin request is required.");
        }
        if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
          throw new ChatError(415, "Use Content-Type: application/json.");
        }
        const body = await readJson(request);
        if (path === "/api/chat") {
          json(200, await chat.chat(body.message, body.model));
        } else {
          await chat.reset();
          json(200, { ok: true });
        }
      } else {
        json(404, { error: "Not found." });
      }
    } catch (error) {
      if (!(error instanceof ChatError)) logger.error("Copilot request failed:", error);
      json(error instanceof ChatError ? error.status : 502, {
        error: error instanceof ChatError
          ? error.message
          : "Copilot request failed. Check the server terminal, then start a new chat. Your account may require sign-in, quota, or policy changes.",
      });
    }
  });
  server.requestTimeout = 150_000;
  server.headersTimeout = 10_000;
  return server;
}

export async function listen(server, port = 4317) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function main() {
  const port = Number(process.env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const chat = new CopilotChat();
  try {
    await chat.client.start();
    const server = createChatServer(chat);
    const url = await listen(server, port);
    console.log(`Copilot chat: ${url}`);
    console.log("Single-user localhost demo. GitHub credentials remain in the Copilot runtime.");
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      server.close();
      try {
        await chat.stop();
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
      server.closeAllConnections();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    await chat.stop();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
