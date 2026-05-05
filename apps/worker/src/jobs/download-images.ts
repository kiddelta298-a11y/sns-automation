import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/worker/src/jobs → apps/worker/data/uploads/scraped-images
const SCRAPED_DIR = path.resolve(__dirname, "../../data/uploads/scraped-images");

/**
 * Threads CDN から画像をダウンロードしローカル保存する。
 *
 * monitoredPostId ごとにディレクトリを切り、`img-<index>.<ext>` で保存。
 * 同じ postId で再ダウンロードする場合は既存ファイルを上書きする。
 *
 * 戻り値: 保存先の絶対パス配列（失敗した URL は含めない）
 */
export async function downloadPostImages(
  monitoredPostId: string,
  imageUrls: string[],
): Promise<string[]> {
  if (!imageUrls || imageUrls.length === 0) return [];

  const dir = path.join(SCRAPED_DIR, monitoredPostId);
  await fs.mkdir(dir, { recursive: true });

  const saved: string[] = [];

  for (let i = 0; i < imageUrls.length && i < 10; i++) {
    const url = imageUrls[i];
    if (!url || !/^https?:\/\//i.test(url)) continue;

    try {
      const res = await fetch(url, {
        // Threads CDN は Referer/UA がないと拒否することがあるため最低限を付与
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          "Referer": "https://www.threads.com/",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[download-images] HTTP ${res.status} for ${url}`);
        continue;
      }

      const ct = res.headers.get("content-type") || "";
      const ext =
        /jpeg|jpg/.test(ct) ? "jpg"
        : /png/.test(ct) ? "png"
        : /webp/.test(ct) ? "webp"
        : /gif/.test(ct) ? "gif"
        : "jpg";

      const filePath = path.join(dir, `img-${i}.${ext}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(filePath, buf);
      saved.push(filePath);
    } catch (err) {
      console.warn(`[download-images] fail ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return saved;
}
