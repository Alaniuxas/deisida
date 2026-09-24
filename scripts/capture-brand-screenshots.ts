import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-brand";

async function fillForm(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#client").fill("UAB Kauno Statyba");
  await page.locator("#object").fill("Gyvenamasis kompleksas „Šilainiai“");
  await page.locator("#comment").fill("Pristatymas per 5 darbo dienas.");
  await page.locator('[id^="comment-"]').first().fill("Pirmą eilutę pjauti atsargiai.");
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await fillForm(page);
  await page.screenshot({ path: path.join(MEDIA, "01-editor-desktop.png"), fullPage: true });

  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(MEDIA, "02-client-document-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Gamyba" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(MEDIA, "03-production-document-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await fillForm(page);
  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(MEDIA, "04-mobile-client.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await fillForm(page);

  const clientDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pasiūlymo PDF" }).click();
  const clientFile = await clientDownload;
  const clientPath = path.join(MEDIA, "test-client.pdf");
  await clientFile.saveAs(clientPath);

  const productionDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Gamybos PDF" }).click();
  const productionFile = await productionDownload;
  const productionPath = path.join(MEDIA, "test-production.pdf");
  await productionFile.saveAs(productionPath);

  const clientStat = fs.statSync(clientPath);
  const productionStat = fs.statSync(productionPath);

  console.log(
    JSON.stringify(
      {
        clientPdfBytes: clientStat.size,
        productionPdfBytes: productionStat.size,
        screenshots: fs.readdirSync(MEDIA).filter((f) => f.endsWith(".png")),
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
