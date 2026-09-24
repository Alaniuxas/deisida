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

async function setTriState(page: Page, id: string, value: "Taip" | "Ne") {
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: value }).click();
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  await waitForApp(page);
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");

  await setTriState(page, "order-many-parts", "Taip");
  await page.getByRole("heading", { name: "Baras ir pakavimas" }).scrollIntoViewIfNeeded();
  await page.locator('label:has(#order-baseProtection)').click();
  await page.locator('label:has(#order-rowInterlayer)').click();
  await page.waitForTimeout(400);

  const preview = page.locator("aside article").first();
  const packagingSection = preview.locator("section", { hasText: "Pakavimas" }).first();

  const screenshotPath = path.join(MEDIA, "05-client-packaging.png");
  await packagingSection.screenshot({ path: screenshotPath });

  const sectionText = await packagingSection.innerText();
  const articleText = await preview.innerText();

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        sectionText,
        hasBaras: /Baras/i.test(sectionText),
        hasGamybaHeading: /Gamyba ir pakavimas/i.test(sectionText),
        hasPakavimasHeading: /Pakavimas/i.test(sectionText),
        hasNeLines: /:\s*Ne/i.test(sectionText),
        hasTaipLine: sectionText.includes("Pakuoti daugiau nei į 2 dalis"),
        hasBaseProtection: sectionText.includes("Bazinė apsauga"),
        hasRowInterlayer: sectionText.includes("Kiekvienos eilės perklojimas"),
        articleHasBaras: /Baras/i.test(articleText),
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
