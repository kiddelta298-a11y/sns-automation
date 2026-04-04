/**
 * Threads ログイン & テスト投稿スクリプト
 * headless: false でブラウザをリアルタイム表示
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSIONS_DIR = path.resolve(__dirname, "data/sessions");
const SESSION_FILE = path.join(SESSIONS_DIR, "threads_natalia_r_29.json");
const USERNAME = "natalia_r_29";
const PASSWORD = "lovelovelove";
const TEST_POST_TEXT = `🤖 テスト投稿 [SNS自動化システム]\n実行時刻: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}\n#自動化テスト`;

function log(msg) {
  const ts = new Date().toLocaleTimeString("ja-JP");
  console.log(`[${ts}] ${msg}`);
}

async function delay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((r) => setTimeout(r, ms));
}

async function ss(page, name) {
  const dir = path.resolve(__dirname, "data/screenshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`📸 ${path.basename(file)}`);
  return file;
}

async function main() {
  log("🚀 ブラウザ起動中 (headless: false)...");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    // ─── STEP 1: ログインページ ──────────────────────────
    log("🌐 Threads ログインページを開く...");
    await page.goto("https://www.threads.com/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(3000, 4000);
    await ss(page, "s1-login");

    // フォーム内の入力要素を全部確認
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(i => ({
        type: i.type, name: i.name, placeholder: i.placeholder,
        autocomplete: i.autocomplete, id: i.id,
      }))
    );
    log(`入力フィールド: ${JSON.stringify(inputs)}`);

    // ─── STEP 2: ユーザー名入力 ──────────────────────────
    log(`📝 ユーザー名入力: ${USERNAME}`);
    // Threads/Instagramフォームの実セレクタ
    const usernameSelectors = [
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[placeholder*="ユーザーネーム"]',
      'input[placeholder*="username"]',
      'input[placeholder*="電話番号"]',
      '#loginForm input:first-of-type',
    ];

    let userInput = null;
    for (const sel of usernameSelectors) {
      userInput = await page.$(sel);
      if (userInput) { log(`  → username selector: ${sel}`); break; }
    }
    if (!userInput) throw new Error("ユーザー名フィールドが見つかりません");

    await userInput.click();
    await delay(200, 400);
    for (const char of USERNAME) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 60 });
    }

    await delay(600, 1000);

    // ─── STEP 3: パスワード入力 ──────────────────────────
    log("🔒 パスワード入力...");
    const pwdSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ];
    let pwdInput = null;
    for (const sel of pwdSelectors) {
      pwdInput = await page.$(sel);
      if (pwdInput) { log(`  → password selector: ${sel}`); break; }
    }
    if (!pwdInput) throw new Error("パスワードフィールドが見つかりません");

    await pwdInput.click();
    await delay(200, 400);
    for (const char of PASSWORD) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 60 });
    }
    await delay(600, 1000);
    await ss(page, "s2-filled");

    // ─── STEP 4: ログインボタン ──────────────────────────
    log("🖱️  ログインボタンクリック...");
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("ログイン")',
      'button:has-text("Log in")',
      'button:has-text("続ける")',
      '#loginForm button',
      'div[role="button"]:has-text("ログイン")',
    ];
    let submitBtn = null;
    for (const sel of submitSelectors) {
      submitBtn = await page.$(sel);
      if (submitBtn) { log(`  → submit selector: ${sel}`); break; }
    }
    if (submitBtn) {
      try {
        await submitBtn.click({ force: true });
      } catch {
        // フォールバック: Enterキーで送信
        log("  → Enterキーでフォーム送信");
        await page.keyboard.press("Enter");
      }
    } else {
      log("  → Enterキーでフォーム送信");
      await page.keyboard.press("Enter");
    }
    await delay(6000, 9000);
    await ss(page, "s3-after-login");
    log(`📍 ログイン後URL: ${page.url()}`);

    // ─── STEP 5: ダイアログ処理 ──────────────────────────
    for (const text of ['情報を保存しない', '後で', 'Not Now', 'Skip']) {
      const btn = await page.$(`text="${text}"`);
      if (btn) {
        log(`⏭️  「${text}」をクリック`);
        await btn.click();
        await delay(1500, 2500);
      }
    }

    // ─── STEP 6: ログイン状態確認 ────────────────────────
    // ホームに遷移
    await page.goto("https://www.threads.com/", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await delay(3000, 4000);
    await ss(page, "s4-home");
    log(`📍 ホームURL: ${page.url()}`);

    const ariaLabels = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label]')].map(el => el.getAttribute('aria-label')).filter(Boolean)
    );
    log(`aria-labels: ${JSON.stringify(ariaLabels.slice(0, 25))}`);

    // セッション保存
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    await context.storageState({ path: SESSION_FILE });
    log(`💾 セッション保存: ${SESSION_FILE}`);

    // ─── STEP 7: 新規投稿モーダル ────────────────────────
    log("\n✏️  テスト投稿を開始...");
    log(`本文:\n${TEST_POST_TEXT}\n`);

    const createBtn = await page.$('[aria-label="作成"], [aria-label="Create"]');
    if (!createBtn) {
      const allLabels = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label]')].map(el => el.getAttribute('aria-label')).filter(Boolean)
      );
      throw new Error(`「作成」ボタンが見つかりません。aria-labels: ${JSON.stringify(allLabels)}`);
    }
    log("🖱️  「作成」ボタンクリック");
    await createBtn.click();
    await delay(2000, 3000);
    await ss(page, "s5-compose-modal");

    // ─── STEP 8: テキストエリアに入力 ───────────────────
    log("⌨️  テキストエリアを検索...");
    const textSelectors = [
      '[data-lexical-editor="true"]',
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '[aria-multiline="true"]',
      'textarea',
    ];

    let typed = false;
    for (const sel of textSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 8_000 });
        if (el) {
          log(`  ✓ textarea: ${sel}`);
          await el.click();
          await delay(200, 400);
          for (const char of TEST_POST_TEXT) {
            if (char === '\n') await page.keyboard.press('Shift+Enter');
            else await page.keyboard.type(char, { delay: 35 + Math.random() * 65 });
          }
          typed = true;
          break;
        }
      } catch {}
    }

    if (!typed) {
      const allCE = await page.evaluate(() =>
        [...document.querySelectorAll('[contenteditable]')].map(el => ({
          tag: el.tagName, role: el.getAttribute('role'),
          aria: el.getAttribute('aria-label'), val: el.getAttribute('data-lexical-editor'),
        }))
      );
      log(`contenteditable: ${JSON.stringify(allCE)}`);
      await ss(page, "s6-no-textarea");
      throw new Error("テキストエリアが見つかりません");
    }

    await delay(800, 1500);
    await ss(page, "s6-typed");
    log("✅ テキスト入力完了");

    // ─── STEP 9: 投稿ボタン（モーダル内を限定）───────────────
    log("🖱️  投稿ボタンを探す（モーダル内）...");

    // Playwrightの locator API でモーダル内に限定
    // モーダルは role="dialog" か、または特定のコンテナ内にある
    // "キャンセル" ボタンと同じコンテナ内の "投稿" を探す
    let published = false;

    // 方法1: role="dialog" 内の "投稿" ボタン
    try {
      const dialogPostBtn = page.getByRole('dialog').getByRole('button', { name: /^投稿$/ });
      const count = await dialogPostBtn.count();
      if (count > 0) {
        log(`  ✓ dialog内 投稿ボタン (count=${count})`);
        await dialogPostBtn.first().click({ timeout: 5000 });
        published = true;
      }
    } catch {}

    // 方法2: "キャンセル" と同じ親要素内の "投稿"
    if (!published) {
      try {
        // すべての "投稿" ボタンを取得して最後のものをクリック（モーダルは後に描画されるため）
        const allPostBtns = page.locator('div[role="button"]').filter({ hasText: /^投稿$/ });
        const count = await allPostBtns.count();
        log(`  div[role=button]:text="投稿" の数: ${count}`);
        if (count > 0) {
          // 最後のものがモーダル内のボタン
          log(`  ✓ 最後の投稿ボタンをクリック (index=${count - 1})`);
          await allPostBtns.last().click({ timeout: 5000 });
          published = true;
        }
      } catch {}
    }

    // 方法3: キーボードショートカット (Ctrl+Enter)
    if (!published) {
      log("  → Ctrl+Enter でフォーム送信試行");
      await page.keyboard.press("Control+Enter");
      published = true;
    }

    if (!published) {
      await ss(page, "s7-no-publish");
      throw new Error("投稿ボタンが見つかりません");
    }

    await delay(5000, 7000);
    await ss(page, "s8-done");

    const finalUrl = page.url();
    if (finalUrl.includes("/post/") || finalUrl.includes("/t/")) {
      log(`🎉 投稿成功！ URL: ${finalUrl}`);
    } else {
      log(`✅ 投稿処理完了 (URL: ${finalUrl})`);
    }

    await context.storageState({ path: SESSION_FILE });
    log("💾 最終セッション保存");
    log("\n🎉 完了！5秒後にブラウザを閉じます...");
    await delay(5000, 5000);

  } catch (err) {
    log(`❌ エラー: ${err.message}`);
    await ss(page, "error-final");
  } finally {
    await browser.close();
    log("🔒 ブラウザ終了");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
