import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-lines";

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

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  await waitForApp(page);
  await page.getByRole("button", { name: "Pridėti eilutę" }).click();
  await page.waitForTimeout(700);

  const line2 = page.locator("#tile-line-1");
  await line2.scrollIntoViewIfNeeded();

  const checks = await page.evaluate(() => {
    const line2Root = document.getElementById("tile-line-1");
    const text = line2Root?.textContent ?? "";
    return {
      hasBarasSelect: !!line2Root?.querySelector('[id^="quantity-"]')?.closest(".grid")?.querySelector("button[role=combobox]") && text.includes("Baras"),
      hasPackaging: text.includes("Pakuoti tik neskilusi"),
      hasStorisInput: !!line2Root?.querySelector('input[type="number"]:not([id^="quantity-"])'),
      hasOrderPackaging: !!document.body.textContent?.includes("Baras ir pakavimas"),
    };
  });

  await page.locator("#tile-line-1").locator("button").filter({ hasText: /^Kolumba|^AARHUS|^Bellbrook|^Alu/ }).click();
  await page.getByRole("option", { name: "AARHUS weisgrau" }).click();
  await page.waitForTimeout(300);

  const storisAfterTileChange = await page
    .locator("#tile-line-1")
    .getByText("52 mm")
    .count();

  await page.locator("#order-intact").click();
  await page.getByRole("option", { name: "Taip" }).click();
  await page.waitForTimeout(200);

  const packagingOnce = await page.locator("#order-intact").count();

  await line2.screenshot({
    path: path.join(MEDIA, "line-only-tile-and-quantity.png"),
  });

  const screenshotPath = path.join(MEDIA, "line-only-tile-and-quantity.png");

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        checks,
        storisAfterTileChange,
        packagingOnce,
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
