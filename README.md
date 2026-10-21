# GitHub Copilot SDK POC Starter

A student-friendly base for **chat apps and non-chat workflows** using the
official GitHub Copilot (GHC) SDK and **each student's own GitHub Copilot login**.

**No OpenAI API key, Anthropic API key, Azure subscription, or cloud model
deployment is required.** Model requests go through GitHub Copilot, not directly
to a provider's API.

## What students need

- Windows, PowerShell, Git, and Node.js **22.12 or newer**.
- Their **own GitHub account with Copilot CLI/model access**. A GitHub account
  or a working VS Code Copilot extension alone does not guarantee that access.
- Internet access and any GitHub/organization authorization their account needs.

Eligible students can check the [GitHub Education offers](https://education.github.com/pack).
Plan eligibility, available models, quotas, and organization policies still
apply. This is not unlimited free inference or a way around access restrictions.
Instructors should distribute source code, **never their credentials**.

## Quick start

```powershell
git clone https://github.com/yelghali/ghc-sdk-demo.git
Set-Location .\ghc-sdk-demo
.\setup.ps1
npm start
```

If not already signed in, setup displays a **GitHub URL and one-time device
code**. Open the URL, enter the code yourself, and authorize **your own
Copilot-enabled GitHub account**. Do not send the code or a token to anyone.

Open <http://127.0.0.1:4317>, select an available model, and send a message.
Use **New chat** before changing models. Stop the server with Ctrl+C.
Tabs share one conversation; this is a single-user local demo.

If PowerShell blocks the script, review it first, then use this process-only
execution-policy override:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

## Does it really use CLI login?

**Yes.** The sequence is:

```text
Student -> login.ps1 -> local Copilot CLI -> GitHub device-code authorization
                                            |
                                  Copilot stores that student's login
                                            |
Chat app or workflow -> official Copilot SDK -> Copilot runtime -> models
```

The SDK client sets `useLoggedInUser: true` and uses the normal Copilot user
profile/credential store. It does **not** reuse this repository author's account,
an instructor account, or the active VS Code chat connection. On another
student's machine, that student must authenticate and have their own entitlement.
No credential is bundled with this repository.

The SDK normally reads Copilot's OS credential store. The CLI may use its user
configuration directory if secure storage is unavailable. Do not copy or commit
that directory, even when distributing a working POC.

Check the active identity without printing a token:

```powershell
.\login.ps1 -CheckOnly
# Or: npm run check-auth
```

For a stored CLI login the output includes:

```text
Copilot is signed in as your-github-login.
Credential source: user (stored Copilot CLI login).
```

The SDK also supports other GitHub credential sources. Existing
`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` environment variables can
take precedence over a stored login. If the identity/source is unexpected,
remove unintended token overrides from your terminal environment and check again.
No GitHub token environment variable is required for this starter.

| Sign-in | Used for |
|---|---|
| `copilot login` via `login.ps1` | This starter's Copilot model access |
| VS Code Copilot sign-in | The editor extension; not automatically a CLI login |
| `gh auth login` | GitHub CLI repository operations; not needed to run this app |
| `az login` | Azure resources; not used here |

### Login is intentionally separate

- [setup.ps1](./setup.ps1): checks Node, installs pinned dependencies if missing,
  then delegates authentication.
- **[login.ps1](./login.ps1): the one place to change the interactive login
  policy tomorrow.** It reuses an existing login, otherwise runs the local
  `copilot login --device-code` command and verifies the result through the SDK.
- [scripts/check-auth.mjs](./scripts/check-auth.mjs): SDK identity/source check.
- [copilot.mjs](./copilot.mjs): runtime client and safe model/session settings.
  It consumes credentials; it never starts interactive login.

```powershell
.\login.ps1                  # Reuse login, otherwise use a GitHub device code
.\login.ps1 -WebFlow         # Use browser callback login if sign-in is needed
.\login.ps1 -CheckOnly       # Never start interactive sign-in; fail if unavailable
.\setup.ps1 -WebFlow         # Setup can forward the optional login mode
```

Run setup before invoking login on a fresh clone. If signing in after starting
the app, restart it so the runtime can load the new credentials.

## Use it as a POC base

### Chat POC

```text
index.html -> local server.mjs -> copilot.mjs -> GitHub Copilot SDK/runtime
```

Customize the UI or prompts while keeping model access behind the local backend.
The browser never receives credentials. Models are discovered from the signed-in
account, rather than assuming every student has a specific GPT or Claude model.

### Non-chat workflow POC

No browser or HTTP server is required:

```powershell
npm run workflow
npm run workflow -- "Plan a beginner workshop about testing JavaScript"
```

[scripts/workflow.mjs](./scripts/workflow.mjs) runs a two-step **plan -> review**
pipeline and prints `{ "model": "...", "plan": "...", "review": "..." }` JSON.
It reuses the same authenticated client and restricted session settings as chat.
JavaScript orchestrates the steps; model calls use the student's Copilot account.
It makes two real requests and consumes that account's allowance.

Use this pattern for a summarizer, classifier, review pipeline, or other POC:

1. Keep authentication in the existing login/client helpers.
2. Discover an entitled model, then call it through the official SDK.
3. Orchestrate and validate the steps in your application code.
4. Return explicit errors when login, model access, quota, or inference fails.

Do not replace the SDK with provider clients or add required
`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` settings. This is not a drop-in
OpenAI-compatible HTTP endpoint.

### Guidance for coding assistants

[.github/copilot-instructions.md](./.github/copilot-instructions.md) tells coding
assistants to preserve this **Copilot SDK + student's own CLI login** architecture
for both chat and workflows, without introducing separate cloud API credentials.
It guides development; it neither grants model access nor supplies credentials.
The demo intentionally does not load repository instructions into user sessions.

## Test locally

```powershell
npm test                        # Mocked unit/HTTP/login/workflow tests; no model calls
.\login.ps1 -CheckOnly           # Verify your existing identity without signing in again
npm run smoke                   # Two real HTTP/model requests; checks follow-up memory
npm run workflow                # Two real model requests without a browser/server
```

Or run `.\setup.ps1 -SmokeTest` for setup, login, and the live chat check.
The smoke test prints the active identity, credential source, and model ID, and
fails if authentication, entitlement, inference, or the exact test reply fails.
Unit login tests simulate sign-in states; they never log out your real account.

Optional model override for smoke/workflow: set
`$env:COPILOT_MODEL = "<available-model-id>"`. Models and rates can differ by
account; every live check uses the student's Copilot allowance.

## Troubleshooting and limits

- **Not signed in:** run `.\login.ps1`, verify the intended account, and restart
  any running app. Do not paste Azure tokens or provider keys into this project.
- **No models / permission denied:** check Copilot CLI access, your plan, and
  organization policy. A successful login or model listing is not a guarantee
  that every model can run.
- **Quota / rate limit:** stop or reduce live requests and check your Copilot
  allowance. Do not silently fall back to another account or provider.
- **Request failed or timed out:** check the terminal and use **New chat** before
  retrying; a timeout alone does not cancel inference.
- **Port already in use:** stop the other local instance, or use
  `$env:PORT = "4318"; npm start`.

File, shell, and MCP tools are excluded; permissions are denied; discovery,
skills, hooks, and host git features are disabled. The SDK's `copilot-cli` mode
can read the normal credential store, which this pinned SDK disables in `empty`
mode, so these restrictions are explicitly configured.

The server binds only to `127.0.0.1`, validates Host/Origin, and displays model
output as plain text. Do not expose a student's credentials/entitlement through
a shared public server. The app transcript is in memory, but Copilot may retain
its own session data in the user's profile. **New chat** is not secure log erasure.
Use non-sensitive sample inputs and follow GitHub's terms and your organization's
policies.

See the [official Copilot SDK documentation](https://github.com/github/copilot-sdk)
for supported authentication methods and current requirements.
