import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-type";

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

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });

  await waitForApp(page);
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");
  await page.locator("#comment").fill("komentaras klientui");

  await page.getByRole("heading", { name: "Baras ir pakavimas" }).scrollIntoViewIfNeeded();
  await setTriState(page, "order-intact", "Taip");
  await setTriState(page, "order-leftovers", "Taip");
  await page.locator('label:has(#order-baseProtection)').click();
  await page.locator('label:has(#order-rowInterlayer)').click();

  await page.getByRole("button", { name: "Pridėti eilutę" }).click();
  await page.waitForTimeout(300);

  const clientPath = path.join(MEDIA, "client.png");
  const productionPath = path.join(MEDIA, "production.png");

  const clientArticle = page.locator("aside article").first();
  await clientArticle.screenshot({ path: clientPath });

  await page.getByRole("tab", { name: "Gamyba" }).click();
  await page.waitForTimeout(500);

  const productionArticle = page.locator("aside article").first();
  await productionArticle.screenshot({ path: productionPath });

  const clientText = await clientArticle.innerText();
  const productionText = await productionArticle.innerText();

  console.log(
    JSON.stringify(
      {
        clientPath,
        productionPath,
        clientExists: fs.existsSync(clientPath),
        productionExists: fs.existsSync(productionPath),
        clientHasPasiulyma: clientText.includes("Pasiūlymas klientui"),
        clientHasPlytele: clientText.includes("Plytelė"),
        clientHasPalete: /1 paletė|paletės/.test(clientText),
        clientHasLithuanianPackaging: clientText.includes("likučiai"),
        productionHasBaras: productionText.includes("Baras"),
        productionHasPlytele: productionText.includes("Plytelė"),
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
