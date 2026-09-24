import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-downloads";

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
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage({ viewport: { width: 1600, height: 900 } });

  await waitForApp(page);
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");

  const pageHeader = page.getByRole("banner");
  const headerButtons = await pageHeader
    .getByRole("button", { name: /Atsisiųsti/ })
    .count();
  const previewButtons = await page
    .locator("aside")
    .getByRole("button", { name: /Atsisiųsti/ })
    .count();

  const [clientDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Atsisiųsti klientui" }).click(),
  ]);
  const clientFilename = clientDownload.suggestedFilename();
  await clientDownload.path();

  const [productionDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Atsisiųsti gamybai" }).click(),
  ]);
  const productionFilename = productionDownload.suggestedFilename();
  await productionDownload.path();

  const screenshotPath = path.join(MEDIA, "04-single-working-buttons.png");
  await pageHeader.screenshot({ path: screenshotPath });

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        headerButtons,
        previewButtons,
        clientFilename,
        productionFilename,
        downloadsOk:
          clientFilename.endsWith("_Klientui.pdf") &&
          productionFilename.endsWith("_Gamyba.pdf") &&
          headerButtons === 2 &&
          previewButtons === 0,
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
