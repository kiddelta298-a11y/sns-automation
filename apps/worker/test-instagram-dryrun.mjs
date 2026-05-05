/**
 * Instagram投稿フロー DRY-RUN（実投稿しない）
 * - フィード投稿の経路をシェアボタン直前まで再現してSELECTORSの妥当性を確認
 * - ストーリー投稿のセクション選択 → ファイル input 検出までを確認
 * - 実際に投稿はしない（途中でキャンセル）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) throw new Error(`.env not found at ${envPath}`);
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const USERNAME = process.env.INSTAGRAM_USERNAME;
if (!USERNAME) {
  console.error("INSTAGRAM_USERNAME not set");
  process.exit(1);
}

// テスト画像（既存のものを流用）
const IMAGE_PATH = path.resolve(__dirname, "data/test-story.png");
if (!fs.existsSync(IMAGE_PATH)) {
  console.log("Generating test image...");
  execSync("node generate-test-story-image.mjs", { cwd: __dirname, stdio: "inherit" });
}

const { BrowserSession } = await import("./dist/browser/base.js");

const session = new BrowserSession({
  sessionKey: `instagram_${USERNAME}`,
  headless: true,
});

const report = {
  newPostButton: false,
  fileInput: false,
  nextButton: false,
  captionTextarea: false,
  shareButton: false,
  storySectionLabel: false,
  storyFileInput: false,
  rateLimit: false,
  errors: [],
};

try {
  await session.init();
  const page = session.page;

  // ── フィード投稿フロー検証 ──────────────────
  console.log("\n[dryrun] === Feed post selectors ===");
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise(r => setTimeout(r, 4000));

  // レート制限／チャレンジ確認
  const rateLimitText = await page.locator('text="しばらくしてから", text="Try Again Later", text="Action Blocked"').count().catch(() => 0);
  report.rateLimit = rateLimitText > 0;

  // 新規投稿ボタン
  const newPost = await page.locator('[aria-label="新規投稿"], [aria-label="New post"]').count();
  report.newPostButton = newPost > 0;
  console.log(`[dryrun] newPostButton found: ${newPost}`);

  if (newPost > 0) {
    await page.locator('[aria-label="新規投稿"], [aria-label="New post"]').first().click();
    await new Promise(r => setTimeout(r, 2500));

    // file input
    const fileInput = await page.locator('input[type="file"]').count();
    report.fileInput = fileInput > 0;
    console.log(`[dryrun] fileInput found: ${fileInput}`);

    if (fileInput > 0) {
      await page.locator('input[type="file"]').first().setInputFiles(IMAGE_PATH);
      await new Promise(r => setTimeout(r, 4000));

      // 「次へ」ボタン（最初のクリック）
      const nextBtn1 = await page.getByRole("button", { name: /^(次へ|Next)$/ }).count();
      report.nextButton = nextBtn1 > 0;
      console.log(`[dryrun] nextButton(1st) found: ${nextBtn1}`);

      if (nextBtn1 > 0) {
        await page.getByRole("button", { name: /^(次へ|Next)$/ }).first().click();
        await new Promise(r => setTimeout(r, 2500));

        // 2回目「次へ」
        const nextBtn2 = await page.getByRole("button", { name: /^(次へ|Next)$/ }).count();
        if (nextBtn2 > 0) {
          await page.getByRole("button", { name: /^(次へ|Next)$/ }).first().click();
          await new Promise(r => setTimeout(r, 2500));

          // キャプション入力欄
          const captionSelector = 'div[aria-label="キャプションを入力…"], div[aria-label="Write a caption..."], div[contenteditable="true"][role="textbox"]';
          const caption = await page.locator(captionSelector).count();
          report.captionTextarea = caption > 0;
          console.log(`[dryrun] captionTextarea found: ${caption}`);

          // シェアボタン（クリックはしない）
          const share = await page.getByRole("button", { name: /^(シェア|Share)$/ }).count();
          report.shareButton = share > 0;
          console.log(`[dryrun] shareButton found: ${share}`);
        }
      }
    }
  }

  // ── ストーリー投稿フロー検証 ──────────────────
  // 別セッション（モバイルUA）で確認
  console.log("\n[dryrun] === Story post selectors (mobile UA) ===");
  await session.close();

  const mobileSession = new BrowserSession({
    sessionKey: `instagram_${USERNAME}`,
    headless: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });
  await mobileSession.init();
  const mPage = mobileSession.page;

  await mPage.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise(r => setTimeout(r, 4000));

  // 新規投稿ボタンを開く
  const mNewPost = await mPage.locator('[aria-label="新規投稿"], [aria-label="New post"]').count();
  if (mNewPost > 0) {
    await mPage.locator('[aria-label="新規投稿"], [aria-label="New post"]').first().click();
    await new Promise(r => setTimeout(r, 2500));

    const storyLabel = await mPage.locator('text="ストーリーズ", text="Story"').count();
    report.storySectionLabel = storyLabel > 0;
    console.log(`[dryrun] storySectionLabel found: ${storyLabel}`);

    const storyFile = await mPage.locator('input[type="file"]').count();
    report.storyFileInput = storyFile > 0;
    console.log(`[dryrun] storyFileInput found: ${storyFile}`);
  }

  await mobileSession.close();
} catch (err) {
  console.error("[dryrun] error:", err?.message ?? err);
  report.errors.push(err?.message ?? String(err));
} finally {
  try { await session.close(); } catch {}
}

console.log("\n[dryrun] === Summary ===");
console.log(JSON.stringify(report, null, 2));

const allFeedOk = report.newPostButton && report.fileInput && report.nextButton && report.captionTextarea && report.shareButton;
const allStoryOk = report.storySectionLabel && report.storyFileInput;
console.log(`\nFeed selectors OK: ${allFeedOk}`);
console.log(`Story selectors OK: ${allStoryOk}`);
console.log(`Rate limit detected: ${report.rateLimit}`);

process.exit(allFeedOk && allStoryOk ? 0 : 2);
