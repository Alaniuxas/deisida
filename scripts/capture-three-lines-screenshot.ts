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

  const metrics = await page.evaluate(() => {
    const editor = Array.from(document.querySelectorAll("div")).find(
      (node) =>
        node.className.includes("min-h-0") &&
        node.className.includes("overflow-y-auto") &&
        node.querySelector("[data-tile-lines-section]"),
    );
    const headings = Array.from(document.querySelectorAll("h3"))
      .filter((h) => h.textContent?.startsWith("Eilutė"))
      .map((h) => h.textContent);
    return {
      lineCount: headings.length,
      headings,
      editorScrollable: editor
        ? editor.scrollHeight > editor.clientHeight
        : false,
      previewRows: document.querySelectorAll("aside tbody tr").length,
    };
  });

  await page.getByRole("tab", { name: "Gamyba" }).click();
  await page.waitForTimeout(400);
  const productionBlocks = await page.locator("aside h3").count();

  await page.evaluate(() => {
    const editor = Array.from(document.querySelectorAll("div")).find(
      (node) =>
        node.className.includes("min-h-0") &&
        node.className.includes("overflow-y-auto") &&
        node.querySelector("[data-tile-lines-section]"),
    ) as HTMLElement | undefined;
    const row = editor?.parentElement as HTMLElement | undefined;
    const root = document.querySelector(".h-screen") as HTMLElement | null;
    if (editor) {
      editor.style.overflow = "visible";
      editor.style.height = `${editor.scrollHeight}px`;
    }
    if (row) {
      row.style.overflow = "visible";
      row.style.height = "auto";
    }
    if (root) {
      root.style.height = "auto";
      root.style.overflow = "visible";
    }
  });
  await page.waitForTimeout(200);

  const screenshotPath = path.join(MEDIA, "form-with-three-lines.png");
  await page.locator("[data-tile-lines-section]").screenshot({
    path: screenshotPath,
  });

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
