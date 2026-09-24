import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const messages: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") messages.push(msg.text());
  });
  page.on("pageerror", (err) => messages.push(err.message));

  await page.goto("http://127.0.0.1:43127", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const issueText = await page
    .locator("text=/Issue/i")
    .allTextContents()
    .catch(() => []);

  const overlay = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("body *"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent || "";
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          /issue|next\.js|nextjs/i.test(text) &&
          text.length < 80
        );
      })
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent?.trim(),
        className: (el as HTMLElement).className?.toString?.().slice(0, 120),
      }));
    return candidates;
  });

  console.log(JSON.stringify({ messages, issueText, overlay }, null, 2));
  await browser.close();
})();
