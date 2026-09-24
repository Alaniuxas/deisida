import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-calendar";

async function waitForApp(page: Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await page.goto(BASE, { waitUntil: "networkidle", timeout: 10000 });
      await page.getByRole("heading", { name: "Pasiūlymo kūrimas" }).waitFor({
        timeout: 5000,
      });
      return;
    } catch {
      await page.waitForTimeout(1500);
    }
  }
  throw new Error("App did not become ready on port 43127");
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await waitForApp(page);

  await page.locator("#valid-until").click();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(MEDIA, "01-lithuanian-calendar-open.png"),
    fullPage: false,
  });

  const weekdayText = await page.locator('[data-slot="calendar"] .rdp-weekday').first().innerText().catch(() => "");
  const monthText = await page.locator('[data-slot="calendar"] .rdp-caption_label, [data-slot="calendar"] select').first().innerText().catch(() => "");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(MEDIA, "02-page-no-next-badge.png"),
    fullPage: true,
  });

  const nextBadge = await page.locator('text=/Next\\.js|nextjs/i').count();
  const nIndicator = await page.locator('[data-nextjs-toast], #nextjs__container, [data-next-mark]').count();

  console.log(
    JSON.stringify(
      {
        screenshots: fs.readdirSync(MEDIA).filter((f) => f.endsWith(".png")),
        weekdayText,
        monthText,
        nextBadge,
        nIndicator,
        dateButtonText: await page.locator("#valid-until").innerText(),
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
