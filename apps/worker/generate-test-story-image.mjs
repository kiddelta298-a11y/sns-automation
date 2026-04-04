/**
 * テスト用ストーリー画像生成スクリプト
 * Playwright で HTML → スクリーンショットとして 1080x1920 PNG を生成
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, "data/test-story.png");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1080px;
          height: 1920px;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif;
        }
        .text {
          color: #fff;
          font-size: 96px;
          font-weight: bold;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="text">おはよう！</div>
    </body>
    </html>
  `);

  await page.screenshot({ path: OUTPUT_PATH, fullPage: true });
  console.log(`Generated: ${OUTPUT_PATH}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
