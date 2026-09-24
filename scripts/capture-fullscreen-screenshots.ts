import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-fullscreen";

async function fillForm(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#client").fill("UAB Kauno Statyba");
  await page.locator("#object").fill("Gyvenamasis kompleksas „Šilainiai“");
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await fillForm(page);
  await page.screenshot({
    path: path.join(MEDIA, "01-full-editor-wide.png"),
    fullPage: true,
  });

  await page.locator('button:has-text("paletės")').first().click();
  await page.locator('[id^="quantity-"]').first().fill("3");
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(MEDIA, "02-packaging-pasirinkite.png"),
    fullPage: false,
    clip: { x: 0, y: 520, width: 1200, height: 420 },
  });

  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(MEDIA, "03-proposal-table-wide.png"),
    fullPage: false,
    clip: { x: 900, y: 120, width: 680, height: 520 },
  });

  const unsetVisible = await page.locator("text=unset").count();
  const pasirinkiteVisible = await page.locator("text=Pasirinkite").count();

  console.log(
    JSON.stringify(
      {
        screenshots: fs.readdirSync(MEDIA).filter((f) => f.endsWith(".png")),
        unsetVisible,
        pasirinkiteVisible,
        correctionBoxVisible: await page.locator("text=Ką pakeisti?").count(),
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
