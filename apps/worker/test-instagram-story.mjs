/**
 * Instagram ストーリーズ投稿テストスクリプト
 * - .env から認証情報を読み込み
 * - data/test-story.png を使ってストーリーズ投稿
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── .env 読み込み ──────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env not found at ${envPath}`);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const USERNAME = process.env.INSTAGRAM_USERNAME;
const PASSWORD = process.env.INSTAGRAM_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error("Error: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env");
  process.exit(1);
}

// ── テスト画像確認 ──────────────────────────────────
const IMAGE_PATH = path.resolve(__dirname, "data/test-story.png");

if (!fs.existsSync(IMAGE_PATH)) {
  console.log("Test image not found, generating...");
  execSync("node generate-test-story-image.mjs", { cwd: __dirname, stdio: "inherit" });
}

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`Error: Test image not found at ${IMAGE_PATH}`);
  process.exit(1);
}

console.log(`Test image: ${IMAGE_PATH}`);
console.log(`Image size: ${fs.statSync(IMAGE_PATH).size} bytes`);

// ── Instagram ストーリーズ投稿 ─────────────────────
async function main() {
  // tsx でコンパイルされたモジュールを動的インポート
  const { InstagramBrowser } = await import("./src/browser/instagram.js");

  const ig = new InstagramBrowser(
    { username: USERNAME, password: PASSWORD },
    { headless: false },
  );

  try {
    console.log("\n[test] Initializing browser...");
    await ig.init();

    console.log("[test] Logging in...");
    await ig.login();

    console.log("[test] Posting story...");
    const result = await ig.postStory({
      imagePath: IMAGE_PATH,
    });

    console.log("\n[test] Result:", JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("\n✅ ストーリーズ投稿成功！");
    } else {
      console.log(`\n❌ ストーリーズ投稿失敗: ${result.error}`);
    }
  } catch (err) {
    console.error("\n❌ Error:", err.message);
  } finally {
    console.log("[test] Closing browser...");
    await ig.close();
    console.log("[test] Done.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
