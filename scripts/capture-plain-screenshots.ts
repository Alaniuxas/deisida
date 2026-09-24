import { chromium, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://127.0.0.1:43127";
const MEDIA = "/cursor/stores/self/media/proposal-plain";

async function fillForm(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#client").fill("UAB Kauno Statyba");
  await page.locator("#object").fill("Gyvenamasis kompleksas „Šilainiai“");
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await fillForm(page);

  await page.screenshot({
    path: path.join(MEDIA, "01-correction-box.png"),
    fullPage: false,
    clip: { x: 0, y: 520, width: 900, height: 320 },
  });

  await page.locator('button:has-text("paletės")').first().click();
  await page.locator('[id^="quantity-"]').first().fill("3");
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(MEDIA, "02-quantity-paletes.png"),
    fullPage: false,
    clip: { x: 0, y: 680, width: 980, height: 260 },
  });

  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(MEDIA, "03-client-document-paletes.png"),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        screenshots: fs.readdirSync(MEDIA).filter((f) => f.endsWith(".png")),
        clientQuantity: await page.locator("tbody tr td").nth(4).innerText(),
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
