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
  await page.locator("#client").fill("UAB Statybos partneriai");
  await page.locator("#object").fill("Vilniaus g. 12, Kaunas");

  await page.getByRole("button", { name: "Pridėti eilutę" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Pridėti eilutę" }).click();
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const editor = Array.from(document.querySelectorAll("div")).find(
      (node) =>
        node.className.includes("min-h-0") &&
        node.className.includes("overflow-y-auto") &&
        node.querySelector("section.bg-white"),
    ) as HTMLElement | undefined;
    if (editor) editor.scrollTop = 0;
  });
  await page.waitForTimeout(300);

  const metrics = await page.evaluate(() => {
    const editor = Array.from(document.querySelectorAll("div")).find((node) =>
      node.className.includes("min-h-0") &&
      node.className.includes("overflow-y-auto") &&
      node.querySelector("section.bg-white"),
    );
    const headings = Array.from(document.querySelectorAll("h3"))
      .filter((h) => h.textContent?.startsWith("Eilutė"))
      .map((h) => h.textContent);
    const line2 = document.getElementById("tile-line-1");
    const rect2 = line2?.getBoundingClientRect();
    return {
      lineCount: headings.length,
      headings,
      editorScrollable: editor
        ? editor.scrollHeight > editor.clientHeight
        : false,
      line2InViewport: rect2
        ? rect2.top >= 0 && rect2.bottom <= window.innerHeight
        : false,
      previewRows: document.querySelectorAll("aside tbody tr").length,
      productionBlocks: document.querySelectorAll("aside h3").length,
    };
  });

  await page.getByRole("tab", { name: "Gamyba" }).click();
  await page.waitForTimeout(400);

  const productionBlocks = await page.locator("aside h3").count();

  await page.getByRole("tab", { name: "Klientui" }).click();
  await page.waitForTimeout(200);

  const tilesSection = page.locator("section.bg-white").last();
  await tilesSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const box = await tilesSection.boundingBox();
  if (box) {
    await page.screenshot({
      path: path.join(MEDIA, "form-with-three-lines.png"),
      clip: {
        x: box.x,
        y: box.y,
        width: Math.min(box.width, 980),
        height: Math.min(box.height, 2400),
      },
    });
  } else {
    await page.screenshot({
      path: path.join(MEDIA, "form-with-three-lines.png"),
      fullPage: true,
    });
  }

  const screenshotPath = path.join(MEDIA, "form-with-three-lines.png");

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        exists: fs.existsSync(screenshotPath),
        metrics,
        productionBlocks,
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
