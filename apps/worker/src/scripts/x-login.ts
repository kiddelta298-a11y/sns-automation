/**
 * X (旧Twitter) 対話型ログインCLI
 *
 * ローカルPCで実行し、手動でログインした後に storageState を JSON で出力する。
 * 出力された JSON を /accounts UI の「セッションをアップロード」ボタンから
 * アップロードすると、本番Worker/API がそれを使ってログイン済み状態で動作する。
 *
 * 使い方:
 *   pnpm --filter @sns-automation/worker exec tsx src/scripts/x-login.ts <username>
 *
 *   → headful でブラウザが開くので手動ログイン
 *   → ログイン完了後、ターミナルで Enter キーを押す
 *   → ./data/sessions/x_<username>.json が書き出される
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { XBrowser } from "../browser/x.js";

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: tsx src/scripts/x-login.ts <username>");
    process.exit(1);
  }

  console.log(`[x-login] Launching headful browser for @${username}...`);
  const browser = new XBrowser(
    { username },
    { headless: false, blockResources: false },
  );

  try {
    await browser.init();
    const page = browser.getPage();
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });

    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ブラウザウィンドウでXに手動ログインしてください。");
    console.log("  ログイン完了後、このターミナルで Enter キーを押します。");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");

    await waitForEnter();

    const state = await browser.dumpStorageState();
    const outDir = path.resolve("./data/sessions");
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `x_${username}.json`);
    fs.writeFileSync(outFile, JSON.stringify(state, null, 2));

    console.log("");
    console.log(`[x-login] storageState saved to: ${outFile}`);
    console.log("[x-login] 次のステップ:");
    console.log("  1. /accounts ページを開く");
    console.log(`  2. @${username} の行から「セッションをアップロード」を選択`);
    console.log(`  3. ${outFile} を添付してアップロード`);
    console.log("");
  } finally {
    await browser.close();
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("ログインが完了したら Enter を押してください > ", () => {
      rl.close();
      resolve();
    });
  });
}

main().catch((err) => {
  console.error("[x-login] Fatal error:", err);
  process.exit(1);
});
