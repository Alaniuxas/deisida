import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-audit";
const FORBIDDEN = /\b(issue|yes|no|unset)\b/i;

async function waitForApp(page: Page) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 15000 });
      await page.getByRole("heading", { name: "Pasiūlymo kūrimas" }).waitFor({
        timeout: 8000,
      });
      return;
    } catch {
      await page.waitForTimeout(1500);
    }
  }
  throw new Error("App did not become ready on port 43127");
}

async function setTriState(page: Page, idSuffix: string, choice: "taip" | "ne") {
  const trigger = page.locator(`#${idSuffix}`).first();
  await trigger.click();
  await page.getByRole("option", { name: choice === "taip" ? "Taip" : "Ne" }).click();
}

async function scanForbidden(page: Page) {
  const bodyText = await page.locator("body").innerText();
  const matches = bodyText.match(new RegExp(FORBIDDEN, "gi")) ?? [];
  const issueOverlay = await page.locator("text=/\\d+ Issue/i").count();
  return { matches: [...new Set(matches.map((m) => m.toLowerCase()))], issueOverlay };
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await waitForApp(page);
  await page.waitForTimeout(1500);

  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");

  const lineId = "line-1";
  await setTriState(page, `${lineId}-intact`, "ne");
  await setTriState(page, `${lineId}-two-parts`, "taip");
  await setTriState(page, `${lineId}-many-parts`, "ne");
  await setTriState(page, `${lineId}-leftovers`, "taip");

  await page.waitForTimeout(400);

  const packagingSection = page
    .locator("h4", { hasText: "Gamyba ir pakavimas" })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'border-t')]");
  await packagingSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await packagingSection.screenshot({
    path: path.join(MEDIA, "01-packaging-lithuanian-only.png"),
  });

  await page.screenshot({
    path: path.join(MEDIA, "02-full-page-no-issue-badge.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);

  const previewPanel = page.locator("aside").first();
  await previewPanel.screenshot({
    path: path.join(MEDIA, "03-client-preview.png"),
  });

  const forbidden = await scanForbidden(page);
  const files = fs
    .readdirSync(MEDIA)
    .filter((f) => f.endsWith(".png"))
    .map((f) => path.join(MEDIA, f));

  console.log(
    JSON.stringify(
      {
        screenshots: files,
        forbidden,
        consoleErrors: consoleErrors.slice(0, 10),
        packagingLabels: await page
          .locator(`#${lineId}-intact, #${lineId}-two-parts, #${lineId}-many-parts, #${lineId}-leftovers`)
          .allInnerTexts(),
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
