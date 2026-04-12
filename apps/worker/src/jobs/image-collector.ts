import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const IMAGES_DIR = path.resolve(process.env.IMAGES_DIR ?? "./data/images");

// ── 画像ダウンロード ──────────────────────────────────────────────────────────
export async function downloadImage(url: string, jobId: string, index: number): Promise<string | null> {
  const dir = path.join(IMAGES_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });

  // 拡張子を URL から推定（なければ .jpg）
  const ext = url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] ?? "jpg";
  const filename = `img_${index.toString().padStart(4, "0")}.${ext}`;
  const destPath = path.join(dir, filename);

  // 既にダウンロード済みならスキップ
  if (fs.existsSync(destPath)) return destPath;

  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);

    const req = protocol.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        file.close();
        fs.unlink(destPath, () => {});
        resolve(null);
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(destPath); });
      file.on("error", () => { fs.unlink(destPath, () => {}); resolve(null); });
    });
    req.on("error", () => { resolve(null); });
    req.setTimeout(12_000, () => { req.destroy(); resolve(null); });
  });
}

// ── Gemini Vision でバズ理由を分析 ────────────────────────────────────────────
export async function analyzeImageBuzz(
  imagePath: string,
  context: { likeCount: number; contentText: string; keyword: string },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString("base64");
    const mimeType = imagePath.match(/\.png$/i) ? "image/png"
      : imagePath.match(/\.webp$/i) ? "image/webp"
      : "image/jpeg";

    const prompt =
      `この画像はSNS（Threads）でキーワード「${context.keyword}」に関連するバズ投稿（いいね数: ${context.likeCount}件）に含まれていました。\n` +
      `投稿テキスト: "${context.contentText.slice(0, 120)}"\n\n` +
      `この画像がバズった理由を以下の観点で日本語200字以内に分析してください：\n` +
      `① 視覚的特徴（色・構図・インパクト）\n` +
      `② 感情的訴求（共感・驚き・欲求など）\n` +
      `③ このキーワードのターゲット層への刺さり方`;

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt,
    ]);
    return result.response.text().trim();
  } catch (err) {
    console.warn("[image-collector] Gemini analysis failed:", err);
    return "";
  }
}

// ── 複数画像をまとめてダウンロード + 分析 ────────────────────────────────────
export interface ImageRecord {
  jobId: string;
  keywordSetId: string | null;
  keyword: string;
  authorUsername: string | null;
  contentText: string;
  imageUrl: string;
  localPath: string | null;
  likeCount: number;
  buzzScore: number;
  analysisText: string;
}

export async function collectImages(
  images: {
    jobId: string;
    keywordSetId: string | null;
    keyword: string;
    authorUsername: string | null;
    contentText: string;
    imageUrls: string[];
    likeCount: number;
    buzzScore: number;
  }[],
  maxImages = 30,
): Promise<ImageRecord[]> {
  const records: ImageRecord[] = [];
  let globalIdx = 0;

  for (const item of images) {
    if (records.length >= maxImages) break;

    for (const url of item.imageUrls) {
      if (records.length >= maxImages) break;

      const localPath = await downloadImage(url, item.jobId, globalIdx++);
      const analysisText = localPath
        ? await analyzeImageBuzz(localPath, {
            likeCount: item.likeCount,
            contentText: item.contentText,
            keyword: item.keyword,
          })
        : "";

      records.push({
        jobId: item.jobId,
        keywordSetId: item.keywordSetId,
        keyword: item.keyword,
        authorUsername: item.authorUsername,
        contentText: item.contentText,
        imageUrl: url,
        localPath,
        likeCount: item.likeCount,
        buzzScore: item.buzzScore,
        analysisText,
      });

      console.log(`[image-collector] Downloaded & analyzed: ${localPath ?? "failed"}`);
    }
  }

  return records;
}
