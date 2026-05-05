/**
 * キャプション生成テスト
 * 実画像で Gemini Vision を呼び、2行キャプションが取れるか確認
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.resolve(__dirname, ".env");
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const IMAGE_PATH = path.resolve(__dirname, "data/test-story.png");
if (!fs.existsSync(IMAGE_PATH)) {
  execSync("node generate-test-story-image.mjs", { cwd: __dirname, stdio: "inherit" });
}

execSync("pnpm build", { cwd: __dirname, stdio: "inherit" });
const { generateInstagramCaption } = await import("./dist/jobs/generate-caption.js");

console.log("\n[test] Calling generateInstagramCaption...");
const result = await generateInstagramCaption({
  imagePath: IMAGE_PATH,
  appendUrl: "https://example.com/aff/abc",
  urlPrefix: "詳しくはこちら",
});

console.log("\n[test] === Raw output ===");
console.log(result.raw);
console.log("\n[test] === Final caption ===");
console.log(result.caption);
console.log(`\n[test] Model: ${result.model}`);
console.log(`[test] Caption lines (sanitized body, before URL): ${result.raw.split(/\r?\n/).filter(Boolean).length}`);
