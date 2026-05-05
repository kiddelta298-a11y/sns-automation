/**
 * Nataliaセッション有効性チェック
 * - 既存の instagram_natalia_r_29.json セッションを使ってログイン状態を確認
 * - ログイン維持されていれば終了（投稿はしない）
 * - 維持されていなければ再ログインを試行 → 結果を報告
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

const USERNAME = process.env.INSTAGRAM_USERNAME;
const PASSWORD = process.env.INSTAGRAM_PASSWORD;
const SESSIONS_DIR = path.resolve(process.env.SESSIONS_DIR ?? path.join(__dirname, "data/sessions"));
const SESSION_FILE = path.join(SESSIONS_DIR, `instagram_${USERNAME}.json`);

if (!USERNAME || !PASSWORD) {
  console.error("Error: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env");
  process.exit(1);
}

console.log(`[check] Username: ${USERNAME}`);
console.log(`[check] Session file: ${SESSION_FILE}`);
console.log(`[check] Session exists: ${fs.existsSync(SESSION_FILE)}`);

if (fs.existsSync(SESSION_FILE)) {
  const stat = fs.statSync(SESSION_FILE);
  const ageDays = (Date.now() - stat.mtimeMs) / (24 * 3600 * 1000);
  console.log(`[check] Session age: ${ageDays.toFixed(1)} days`);
}

// dist の InstagramBrowser を使う（事前に build 済みである必要あり）
const distPath = path.resolve(__dirname, "dist/browser/instagram.js");
if (!fs.existsSync(distPath)) {
  console.log("[check] dist not built. Building...");
  const { execSync } = await import("node:child_process");
  execSync("pnpm build", { cwd: __dirname, stdio: "inherit" });
}

const { InstagramBrowser } = await import("./dist/browser/instagram.js");

const browser = new InstagramBrowser(
  { username: USERNAME, password: PASSWORD },
  { headless: true },
);

let exitCode = 0;
try {
  await browser.init();
  const loggedIn = await browser.isLoggedIn();
  console.log(`[check] isLoggedIn (before login): ${loggedIn}`);

  if (loggedIn) {
    console.log("[check] ✅ セッションは有効です（再ログイン不要）");
  } else {
    console.log("[check] ⚠️  セッション期限切れ。再ログインを試行します...");
    await browser.login();
    const loggedIn2 = await browser.isLoggedIn();
    console.log(`[check] isLoggedIn (after login): ${loggedIn2}`);
    if (loggedIn2) {
      console.log("[check] ✅ 再ログイン成功・セッション保存済み");
    } else {
      console.log("[check] ❌ 再ログインも失敗。手動確認が必要です");
      exitCode = 2;
    }
  }
} catch (err) {
  console.error("[check] ❌ エラー:", err?.message ?? err);
  exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}

process.exit(exitCode);
