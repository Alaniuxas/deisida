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
  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);

  const screenshotPath = path.join(MEDIA, "vnt-price.png");
  await page.locator("aside article").first().screenshot({ path: screenshotPath });

  const previewText = await page.locator("aside article").first().innerText();
  const formPrice = await page
    .locator("#tile-line-0")
    .getByText(/0,03\s*€|0,033\s*€/)
    .first()
    .innerText()
    .catch(() => "");

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        previewHasPerPiecePrice: /0,03\s*€\s*\/\s*vnt\./.test(previewText),
        previewHasLineTotal: /3,33\s*€/.test(previewText),
        previewHas100Vnt: previewText.includes("100 vnt."),
        formPrice,
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
