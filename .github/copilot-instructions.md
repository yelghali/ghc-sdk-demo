# Student Copilot SDK POC guidelines

## Model access and identity

- This starter is for students building chat or non-chat POCs with their own
  GitHub Copilot (GHC) access, without separate OpenAI/Anthropic cloud API access.
- Route model calls through the official `@github/copilot-sdk`. Reuse
  [createCopilotClient and chatSessionOptions](../copilot.mjs) and discover models
  from the signed-in account. Do not assume a particular model is entitled.
- Use each student's own Copilot CLI login through `useLoggedInUser: true`.
  Never extract, copy, print, commit, or ask for stored tokens or share an
  instructor's credentials with students.
- Do not introduce required provider API keys, OpenAI/Anthropic clients, Azure
  resources, or undocumented Copilot endpoints. Treat BYOK or a different model
  provider as an explicit opt-in change, not a silent fallback.

## Authentication boundary

- Keep interactive login policy in [login.ps1](../login.ps1). Device-code login
  is the default; `-WebFlow` is optional. Do not duplicate login logic in setup,
  the HTTP server, workflows, or the browser.
- [setup.ps1](../setup.ps1) installs dependencies and delegates authentication.
  Runtime code consumes the SDK's normal stored credentials; it does not log in.
- VS Code sign-in, `gh auth login`, and `az login` are not the same as the
  Copilot CLI sign-in used here. Surface identity, quota, and policy errors;
  never return a pretend model reply when access fails.

## POCs and validation

- Preserve the tool exclusions, denied permissions, and disabled ambient
  features in [copilot.mjs](../copilot.mjs), including for workflows. Add tools
  only for a deliberate POC need with narrow permissions and explicit approval.
- Keep workflows callable without a browser/HTTP server, following
  [the plan-and-review example](../scripts/workflow.mjs).
- Keep examples small, beginner-friendly, and single-user/local by default.
  Do not expose one student's Copilot entitlement as a shared public service.
- Run `npm test` for code changes. Live checks (`npm run smoke` and
  `npm run workflow`) require that user's Copilot access, consume allowance,
  and must be reported separately from mocked tests.
- Keep the [README](../README.md) accurate about setup, student prerequisites,
  auth changes, and limits. These instructions guide development; the demo
  intentionally does not load repository instructions into end-user sessions.
