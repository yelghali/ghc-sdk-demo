# GitHub Copilot SDK Chat Demo

A small, single-user browser chat backed by the official GitHub Copilot SDK.
Use your GitHub Copilot account to chat with the models available to you,
without a separate OpenAI or Anthropic API key.

## Features

- Browser chat UI with light/dark themes and a model picker.
- Multi-turn conversations and a **New chat** reset.
- PowerShell setup that installs missing dependencies and signs in to GitHub.
- Chat-only runtime with file, shell, and MCP tools disabled.
- Automated tests plus a live, authenticated two-turn smoke test.

## How it works

```text
Browser (localhost)
       |
Local Node.js HTTP server
       |
Official GitHub Copilot SDK
       |
Copilot runtime -> GitHub Copilot models
```

The backend uses Copilot CLI's normal stored login. Credentials are never sent
to the browser. This is a local SDK integration, not an OpenAI-compatible API
endpoint or a public hosted chat service.

## Windows quick start

Requires Node.js 22.12 or newer and a GitHub account with Copilot access.

```powershell
git clone https://github.com/yelghali/ghc-sdk-demo.git
Set-Location .\ghc-sdk-demo
.\setup.ps1 -SmokeTest
npm start
```

Open <http://127.0.0.1:4317>. Choose an available model and send a message.
Use **New chat** before changing models. Tabs share one conversation.
Stop the server with Ctrl+C.

If local PowerShell policy blocks the script, review it first, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1 -SmokeTest
```

The process-scoped policy option does not change your machine's execution policy.

## Authentication

The setup script installs the pinned SDK and Copilot CLI locally with `npm ci`
when missing, checks existing Copilot authentication, and runs `copilot login`
only when necessary. Complete GitHub authorization in the browser it opens.
It never asks you to paste a token or copies credentials into the app.
VS Code's active Copilot connection is not automatically a CLI login.

**Azure CLI (`az login`) is not used:** its Azure/Entra credentials do not grant
this demo access to GitHub Copilot. No Azure CLI installation or Azure resource
is required. For a managed GitHub Enterprise account, follow your organization's
Copilot CLI sign-in requirements; do not substitute an Azure access token.

To force device-code login, run the locally installed CLI:

```powershell
.\node_modules\.bin\copilot.cmd login --device-code
```

If signing in after the server has started, restart the server.
`.\setup.ps1 -CheckOnly` checks authentication without starting interactive login.

## Verification

```powershell
npm test
npm run check-auth
npm run smoke
```

Unit/HTTP tests use a fake SDK client and do not consume your allowance.
The smoke test uses **real credentials and two real model requests** through an
ephemeral localhost HTTP server. It verifies an exact reply and follow-up memory;
it fails explicitly if authentication, model access, or inference is unavailable.
Choose a specific available model with `$env:COPILOT_MODEL = "<model-id>"`.

## Project layout

```text
index.html              Browser UI, styles, and client-side chat code
server.mjs              Local HTTP server and request validation
copilot.mjs             SDK authentication, model discovery, and chat sessions
setup.ps1               Dependency installation and GitHub sign-in
scripts/check-auth.mjs  Authentication check without exposing credentials
scripts/smoke.mjs       Real two-turn HTTP/model test
test/chat.test.mjs      Unit and HTTP tests using a fake SDK client
```

## Scope and safety

- Browser -> local Node backend -> Copilot SDK/runtime -> GitHub Copilot models.
- Models are discovered from your account; subscription, quota, billing, and
  organization policies apply. Listing a model does not guarantee inference access.
- No provider API key, token extraction, or undocumented Copilot HTTP endpoint.
- Credentials stay server-side and are handled by Copilot's normal login storage.
- SDK `copilot-cli` mode reads your existing OS credential-store login. This SDK
  version disables that store in `empty` mode, so the demo explicitly disables
  ambient features instead: an empty tool allowlist, exclusions for every tool
  source, denied permissions, disabled discovery/skills/hooks/host git, and no MCP
  configuration keep this chat-only.
- The server binds only to `127.0.0.1`, validates Host/Origin, and rejects
  cross-origin writes. It is not a public/multi-user service or an OpenAI API proxy.
- Messages are rendered as plain text, not executable HTML or Markdown.
- The app keeps its visible transcript in memory; Copilot may persist its own
  session data in your user profile. **New chat** disconnects the active session,
  but is not a secure erasure of Copilot logs. Avoid sensitive prompts.
- A failed/timed-out request may leave a partial SDK turn; use **New chat** to
  reset before retrying. A timeout alone does not cancel runtime inference.
- Optional port override: `$env:PORT = "4318"; npm start`.

See the [Copilot SDK](https://github.com/github/copilot-sdk) documentation for
supported authentication and subscription requirements.
