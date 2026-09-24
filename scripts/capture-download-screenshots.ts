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
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  await waitForApp(page);
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");
  await page.waitForTimeout(400);

  const header = page.locator("header").first();
  await header.screenshot({
    path: path.join(MEDIA, "01-download-buttons-header.png"),
  });

  const [clientDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Atsisiųsti klientui" }).first().click(),
  ]);
  await page.waitForTimeout(800);
  const clientNote = await page.locator("text=/Atsisiųsta: .*_Klientui\\.pdf/").first().innerText();
  const clientFilename = clientDownload.suggestedFilename();
  await clientDownload.path();

  const [productionDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: "Atsisiųsti gamybai" }).nth(1).click(),
  ]);
  await page.waitForTimeout(800);
  const productionNote = await page.locator("text=/Atsisiųsta: .*_Gamyba\\.pdf/").first().innerText();
  const productionFilename = productionDownload.suggestedFilename();
  await productionDownload.path();

  await page.getByRole("tab", { name: "Gamyba" }).click();
  await page.waitForTimeout(600);

  const previewPanel = page.locator("aside").first();
  await previewPanel.screenshot({
    path: path.join(MEDIA, "02-download-buttons-preview.png"),
  });

  const productionDoc = previewPanel.locator("article").first();
  await productionDoc.screenshot({
    path: path.join(MEDIA, "03-production-document.png"),
  });

  const files = fs
    .readdirSync(MEDIA)
    .filter((f) => f.endsWith(".png"))
    .map((f) => path.join(MEDIA, f));

  console.log(
    JSON.stringify(
      {
        screenshots: files,
        clientNote,
        productionNote,
        clientFilename,
        productionFilename,
        downloadsOk:
          !!clientFilename?.endsWith("_Klientui.pdf") &&
          !!productionFilename?.endsWith("_Gamyba.pdf"),
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
