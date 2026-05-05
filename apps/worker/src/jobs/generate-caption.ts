import fs from "node:fs";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface CaptionOptions {
  /** 画像のローカルパス（jpg/jpeg/png） */
  imagePath: string;
  /** アカウントの語調サンプル（任意。あれば模倣する） */
  toneSample?: string;
  /** 末尾にURLを追記するか（フィード投稿向け。Instagramフィード本文ではクリック不可だが視覚的誘導用） */
  appendUrl?: string;
  /** 末尾URL前の誘導文（例: "詳しくはこちら"） */
  urlPrefix?: string;
}

export interface CaptionResult {
  caption: string;
  raw: string;
  model: string;
}

/**
 * 画像から2行（50〜80字目安）の日本語キャプションを生成する。
 * - 改行で2行に整形
 * - 絵文字 1〜2個まで
 * - ハッシュタグはキャプション本文には付けない（必要なら呼び出し側で追加）
 * - 薬機法/景表法に抵触しそうな断言表現は避ける
 */
export async function generateInstagramCaption(opts: CaptionOptions): Promise<CaptionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!fs.existsSync(opts.imagePath)) {
    throw new Error(`Image not found: ${opts.imagePath}`);
  }

  const modelName = "gemini-2.0-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const imageData = fs.readFileSync(opts.imagePath);
  const base64 = imageData.toString("base64");
  const ext = path.extname(opts.imagePath).toLowerCase();
  const mimeType =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    "image/jpeg";

  const toneBlock = opts.toneSample
    ? `\n【参考にする語調サンプル】\n${opts.toneSample.slice(0, 400)}\n`
    : "";

  const prompt =
    `あなたはInstagramの女性向けライフスタイルアカウントの編集担当です。\n` +
    `添付画像を見て、Instagramフィード投稿のキャプションを作成してください。\n\n` +
    `【厳守ルール】\n` +
    `- 必ず日本語で2行（合計50〜80字目安）。1行目と2行目の間は改行（\\n）で区切る\n` +
    `- 絵文字は0〜2個まで（多用しない）\n` +
    `- ハッシュタグは付けない\n` +
    `- 「100%効く」「絶対」「最強」など断言表現は禁止（薬機法/景表法配慮）\n` +
    `- 商品名や具体的な効能には触れず、雰囲気・気分・情景にフォーカス\n` +
    `- URLや誘導文はキャプション本文には含めない（呼び出し側で追記）\n` +
    toneBlock +
    `\n出力は2行のキャプションのみ。前置きや説明、引用符は不要。`;

  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    prompt,
  ]);

  const raw = result.response.text().trim();
  const caption = sanitizeCaption(raw);

  // URL誘導文 + URL を末尾に付加（オプション）
  const finalCaption = opts.appendUrl
    ? `${caption}\n\n${opts.urlPrefix ?? "詳しくはこちら"}\n${opts.appendUrl}`
    : caption;

  return { caption: finalCaption, raw, model: modelName };
}

function sanitizeCaption(raw: string): string {
  let s = raw.replace(/^["「『]+|["」』]+$/g, "");
  s = s.replace(/\r\n?/g, "\n").trim();
  // 3行以上になっていたら最初の2行に切り詰める
  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 2) {
    return lines.slice(0, 2).join("\n");
  }
  if (lines.length === 1) {
    return lines[0];
  }
  return lines.join("\n");
}
