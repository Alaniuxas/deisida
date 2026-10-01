import { chromium, type Page } from "playwright";
import { PDFParse } from "pdf-parse";
import fs from "fs";

const BASE = "http://127.0.0.1:43127";

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

async function setTriState(page: Page, id: string, value: "Taip" | "Ne") {
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: value }).click();
}

async function readPdfText(filePath: string): Promise<string> {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text.normalize("NFC");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  await waitForApp(page);
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");

  await page.getByRole("heading", { name: "Baras ir pakavimas" }).scrollIntoViewIfNeeded();
  await setTriState(page, "order-intact", "Taip");
  await page.locator('label:has(#order-baseProtection)').click();
  await page.getByRole("button", { name: "Pridėti eilutę" }).click();
  await page.waitForTimeout(400);

  const [clientDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.getByRole("button", { name: "Atsisiųsti klientui" }).click(),
  ]);
  const clientPath = await clientDownload.path();
  if (!clientPath) throw new Error("Client PDF path missing");
  const clientText = await readPdfText(clientPath);

  const [productionDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.getByRole("button", { name: "Atsisiųsti gamybai" }).click(),
  ]);
  const productionPath = await productionDownload.path();
  if (!productionPath) throw new Error("Production PDF path missing");
  const productionText = await readPdfText(productionPath);

  const checks = {
    clientHasPasiulyma: clientText.toLowerCase().includes("pasiūlymas"),
    clientHasPlytele: clientText.toLowerCase().includes("plytelė"),
    clientHasPalete: clientText.includes("paletė"),
    productionHasPlytele: productionText.toLowerCase().includes("plytelė"),
    productionHasBaras: productionText.toLowerCase().includes("baras"),
    allOk:
      clientText.toLowerCase().includes("pasiūlymas") &&
      clientText.toLowerCase().includes("plytelė") &&
      productionText.toLowerCase().includes("plytelė"),
  };

  console.log(JSON.stringify(checks, null, 2));

  if (!checks.allOk) {
    console.error("Client PDF excerpt:", clientText.slice(0, 800));
    process.exit(1);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
