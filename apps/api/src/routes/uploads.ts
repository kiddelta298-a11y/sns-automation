import { Hono } from "hono";
import { createWriteStream, mkdirSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "../../../data/uploads");

// Ensure upload directory exists
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const uploadsRouter = new Hono();

// POST /api/uploads — ファイルアップロード
uploadsRouter.post("/", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return c.json({ error: "ファイルが指定されていません" }, 400);
  }

  const originalName = (file as File).name ?? "upload";
  const ext = extname(originalName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return c.json({ error: "対応形式: jpg, jpeg, png, webp, gif" }, 400);
  }

  const arrayBuffer = await (file as File).arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
    return c.json({ error: "ファイルサイズは10MB以下にしてください" }, 400);
  }

  const filename = `${randomUUID()}${ext}`;
  const filePath = join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(arrayBuffer);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(filePath);
    ws.write(buffer, (err) => {
      if (err) reject(err);
      else {
        ws.end();
        ws.on("finish", resolve);
        ws.on("error", reject);
      }
    });
  });

  // Return the URL that can be served statically
  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const url = `${baseUrl}/uploads/${filename}`;

  return c.json({ url, filename }, 201);
});

// GET /uploads/:filename — 静的ファイル配信
// (mounted at root-level in index.ts)
export async function serveUpload(filename: string): Promise<Response | null> {
  const filePath = join(UPLOAD_DIR, filename);
  try {
    const { createReadStream, statSync } = await import("fs");
    const stat = statSync(filePath);
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";
    const stream = createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch {
    return null;
  }
}
