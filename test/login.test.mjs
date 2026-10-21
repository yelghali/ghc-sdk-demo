import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const quote = (value) => `'${value.replaceAll("'", "''")}'`;

async function loginFixture(t, { signedIn = false, checkCode = 2, loginCode = 0, saveLogin = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "ghc-sdk-login-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await mkdir(join(directory, "node_modules", "@github", "copilot-sdk"), { recursive: true });
  await writeFile(join(directory, "node_modules", "@github", "copilot-sdk", "package.json"), "{}");
  await copyFile(new URL("../login.ps1", import.meta.url), join(directory, "login.ps1"));
  await copyFile(new URL("../setup.ps1", import.meta.url), join(directory, "setup.ps1"));
  const marker = join(bin, "signed-in");
  if (signedIn) await writeFile(marker, "ready");
  await writeFile(join(bin, "copilot.cmd"), [
    "@echo off",
    'echo %*>"%~dp0arguments.txt"',
    ...(loginCode === 0 && saveLogin ? ['echo ready>"%~dp0signed-in"'] : []),
    `exit /b ${loginCode}`,
  ].join("\r\n"));
  return {
    run: (args = "", script = "login.ps1") => spawnSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
      `function global:node {
        if ($args[0] -eq '--version') { Write-Output 'v24.16.0'; $global:LASTEXITCODE = 0; return }
        if (Test-Path -LiteralPath ${quote(marker)}) { $global:LASTEXITCODE = 0 }
        else { $global:LASTEXITCODE = ${checkCode} }
      }
      & ${quote(join(directory, script))} ${args}`,
    ], { encoding: "utf8", timeout: 20_000 }),
    arguments: () => readFile(join(bin, "arguments.txt"), "utf8"),
  };
}

const windowsOnly = { skip: process.platform !== "win32" };

test("login reuses the stored account without opening interactive sign-in", windowsOnly, async (t) => {
  const fixture = await loginFixture(t, { signedIn: true });
  const result = fixture.run("-CheckOnly");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /existing Copilot login is ready/);
  await assert.rejects(fixture.arguments(), { code: "ENOENT" });
});

test("login defaults to device-code authorization", windowsOnly, async (t) => {
  const fixture = await loginFixture(t);
  const result = fixture.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await fixture.arguments()).trim(), "login --device-code");
});

test("setup delegates optional web login to the separate login script", windowsOnly, async (t) => {
  const fixture = await loginFixture(t);
  const result = fixture.run("-WebFlow", "setup.ps1");
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await fixture.arguments()).trim(), "login --web-flow");
});

test("check-only never starts login when the account is signed out", windowsOnly, async (t) => {
  const fixture = await loginFixture(t);
  const result = fixture.run("-CheckOnly");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not signed in/);
  await assert.rejects(fixture.arguments(), { code: "ENOENT" });
});

test("a failed authentication check does not start login", windowsOnly, async (t) => {
  const fixture = await loginFixture(t, { checkCode: 1 });
  const result = fixture.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Could not check Copilot authentication/);
  await assert.rejects(fixture.arguments(), { code: "ENOENT" });
});

test("failed login and unusable saved credentials fail explicitly", windowsOnly, async (t) => {
  for (const options of [{ loginCode: 9 }, { saveLogin: false }]) {
    const fixture = await loginFixture(t, options);
    const result = fixture.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /login was not completed|SDK cannot use it/);
  }
});
