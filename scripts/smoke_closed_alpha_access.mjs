import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://127.0.0.1:4173",
    username: "demo_smoke",
    password: "demo12345",
    screenshotPath: path.resolve("output", "closed-alpha-access-e2e.png"),
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--base-url" && next) {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--username" && next) {
      args.username = next;
      index += 1;
    } else if (arg === "--password" && next) {
      args.password = next;
      index += 1;
    } else if (arg === "--screenshot" && next) {
      args.screenshotPath = path.resolve(next);
      index += 1;
    }
  }

  return args;
}

function prepareSmokeFixture(username) {
  if (username !== "demo_smoke") {
    return;
  }

  const serverDir = path.resolve("apps", "server");
  const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");

  execFileSync(process.execPath, [tsxCli, "prisma/resetSmokeFixture.ts", "--username", username], {
    cwd: serverDir,
    stdio: "inherit",
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(path.dirname(args.screenshotPath), { recursive: true });
  prepareSmokeFixture(args.username);

  const bootstrapResponse = await fetch(`${args.baseUrl}/api/public/bootstrap`);
  assert(bootstrapResponse.ok, `Bootstrap request failed with ${bootstrapResponse.status}.`);
  const bootstrap = await bootstrapResponse.json();

  assert(bootstrap.launchPhase === "closed_alpha", "Expected launchPhase to be closed_alpha.");
  assert(bootstrap.registrationMode === "login_only", "Expected registrationMode to be login_only.");
  assert(bootstrap.storeEnabled === false, "Expected storeEnabled to be false.");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto(`${args.baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByText("Closed Alpha", { exact: true }).first().waitFor({ timeout: 5_000 });

    assert((await page.getByRole("link", { name: /go to register|register/i }).count()) === 0, "Register CTA should be hidden in closed alpha.");
    assert((await page.locator("[data-demo-login]").count()) === 0, "Demo login buttons should be hidden in closed alpha.");
    assert(
      (await page.getByText(/Public signup is disabled|Access is provisioned by operators/i).count()) > 0,
      "Closed alpha access policy copy was not rendered.",
    );

    await page.getByLabel("Username").fill(args.username);
    await page.getByLabel("Password").fill(args.password);
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/app/dashboard");

    assert((await page.getByRole("link", { name: "Imperial Market" }).count()) === 0, "Imperial Market nav link should be hidden when store is disabled.");
    assert((await page.getByRole("button", { name: /Open Imperial Market|Open Market/i }).count()) === 0, "Market CTA should be hidden when store is disabled.");

    await page.goto(`${args.baseUrl}/app/market`, { waitUntil: "networkidle" });
    await page.waitForURL("**/app/dashboard");

    await page.screenshot({ path: args.screenshotPath, fullPage: true });

    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected:\n${consoleErrors.join("\n")}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          screenshot: args.screenshotPath,
          bootstrap,
          redirectedTo: page.url(),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
