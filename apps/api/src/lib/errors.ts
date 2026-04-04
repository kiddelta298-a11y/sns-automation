import type { Context } from "hono";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Not found") {
  return new AppError(404, message);
}

export function handleError(err: unknown, c: Context) {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, { status: err.statusCode });
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
}
