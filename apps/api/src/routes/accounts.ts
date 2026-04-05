import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { createAccountSchema, updateAccountSchema, paginationSchema } from "../lib/validators.js";
import { notFound } from "../lib/errors.js";

export const accountsRouter = new Hono();

// POST /api/accounts — アカウント作成
accountsRouter.post("/", zValidator("json", createAccountSchema), async (c) => {
  const data = c.req.valid("json");
  const [account] = await db.insert(accounts).values(data).returning();
  return c.json(account, 201);
});

// GET /api/accounts — アカウント一覧
accountsRouter.get("/", zValidator("query", paginationSchema), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const results = await db.query.accounts.findMany({
    limit,
    offset,
    orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
  });
  // credentials を除外して返す
  const sanitized = results.map(({ credentials, ...rest }) => rest);
  return c.json(sanitized);
});

// GET /api/accounts/:id — アカウント詳細
accountsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { accountMetrics: true },
  });
  if (!account) throw notFound("Account not found");
  const { credentials, ...rest } = account;
  return c.json(rest);
});

// PUT /api/accounts/:id — アカウント更新
accountsRouter.put("/:id", zValidator("json", updateAccountSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(accounts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();
  if (!updated) throw notFound("Account not found");
  const { credentials, ...rest } = updated;
  return c.json(rest);
});

// DELETE /api/accounts/:id — アカウント削除
accountsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(accounts).where(eq(accounts.id, id)).returning();
  if (!deleted) throw notFound("Account not found");
  return c.json({ success: true });
});
