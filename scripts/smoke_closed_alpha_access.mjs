import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import { assert, ensureBaseUrlReachable, prepareSmokeFixture, waitFor } from "./smoke_support.mjs";

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

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(path.dirname(args.screenshotPath), { recursive: true });
  await ensureBaseUrlReachable(args.baseUrl, "The closed-alpha smoke web shell");
  await prepareSmokeFixture(args.username);

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

    await page.goto(`${args.baseUrl}/register`, { waitUntil: "networkidle" });
    await page.waitForURL("**/login");

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
    await waitFor(async () => ((await page.locator("[data-release-badge]").count()) > 0 ? true : null), 10_000, "the closed-alpha shell badge");
    await waitFor(async () => ((await page.locator("[data-version-stamp]").count()) > 0 ? true : null), 10_000, "the shell version stamp");

    assert((await page.locator("[data-release-badge]").count()) > 0, "Closed-alpha release badge should be rendered in the shell.");
    assert((await page.locator("[data-version-stamp]").count()) > 0, "Version stamp should be rendered in the shell.");
    assert((await page.locator("[data-nav-item='map']").count()) === 1, "Strategic Map nav item should be visible after login.");
    assert((await page.locator("[data-archive-item='messages']").count()) === 1, "Message Center archive link should stay visible.");
    assert((await page.locator("[data-archive-item='market']").count()) === 0, "Imperial Market archive link should be hidden when store is disabled.");
    assert((await page.locator("[data-quick-action='store']").count()) === 0, "Market quick action should be hidden when store is disabled.");

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
