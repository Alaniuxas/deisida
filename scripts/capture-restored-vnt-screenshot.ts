import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-price";

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
  const page = await browser.newPage({
    viewport: { width: 1800, height: 1100 },
  });

  await waitForApp(page);
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");
  await page.locator("#quantity-line-1").fill("100");
  await page.locator("#tile-line-0 button", { hasText: "vnt." }).click();
  await page.waitForTimeout(300);
  await page
    .locator("aside .overflow-x-auto")
    .first()
    .evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
  await page.waitForTimeout(200);

  const screenshotPath = path.join(MEDIA, "restored-vnt.png");
  await page.locator("aside article").first().screenshot({ path: screenshotPath });

  const previewText = await page.locator("aside article").first().innerText();
  const formPrice = await page.locator("#tile-line-0").innerText();

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        previewHas800Total: /800,00\s*€/.test(previewText),
        previewHas8UnitPrice: /8,00\s*€/.test(previewText),
        previewHas100Vnt: previewText.includes("100 vnt."),
        formHasKainaUzVnt: formPrice.includes("Kaina už vnt."),
        formHas800: /800,00\s*€/.test(previewText),
        no0333: !/0,0333/.test(previewText),
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
