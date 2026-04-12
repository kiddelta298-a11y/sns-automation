import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  accountGroups,
  accountGroupMembers,
  accounts,
  posts,
  scheduledPosts,
} from "../db/schema.js";

export const accountGroupsRouter = new Hono();

// GET /api/account-groups — グループ一覧（メンバー数付き）
accountGroupsRouter.get("/", async (c) => {
  const groups = await db.query.accountGroups.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    with: {
      members: {
        with: {
          account: true,
        },
      },
    },
  });

  const result = groups.map((g) => ({
    ...g,
    memberCount: g.members.length,
    members: g.members.map((m) => ({
      id: m.id,
      accountId: m.accountId,
      addedAt: m.addedAt,
      account: {
        id: m.account.id,
        platform: m.account.platform,
        username: m.account.username,
        displayName: m.account.displayName,
        status: m.account.status,
      },
    })),
  }));

  return c.json(result);
});

// POST /api/account-groups — グループ作成
accountGroupsRouter.post("/", async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);

  const [group] = await db.insert(accountGroups).values({
    name: body.name.trim(),
    description: body.description ?? null,
  }).returning();

  return c.json(group, 201);
});

// DELETE /api/account-groups/:id — グループ削除
accountGroupsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(accountGroups).where(eq(accountGroups.id, id));
  return c.json({ ok: true });
});

// POST /api/account-groups/:id/members — メンバー追加
accountGroupsRouter.post("/:id/members", async (c) => {
  const groupId = c.req.param("id");
  const body = await c.req.json<{ accountId: string }>();

  const [member] = await db.insert(accountGroupMembers).values({
    groupId,
    accountId: body.accountId,
  }).returning();

  return c.json(member, 201);
});

// DELETE /api/account-groups/:groupId/members/:memberId — メンバー削除
accountGroupsRouter.delete("/:groupId/members/:memberId", async (c) => {
  const memberId = c.req.param("memberId");
  await db.delete(accountGroupMembers).where(eq(accountGroupMembers.id, memberId));
  return c.json({ ok: true });
});

// POST /api/account-groups/:id/bulk-post — 一括投稿
accountGroupsRouter.post("/:id/bulk-post", async (c) => {
  const groupId = c.req.param("id");
  const body = await c.req.json<{
    contentText: string;
    scheduledAt?: string;
    linkUrl?: string;
  }>();

  if (!body.contentText?.trim()) {
    return c.json({ error: "contentText is required" }, 400);
  }

  // グループのメンバーを取得
  const group = await db.query.accountGroups.findFirst({
    where: eq(accountGroups.id, groupId),
    with: {
      members: {
        with: { account: true },
      },
    },
  });

  if (!group) return c.json({ error: "Group not found" }, 404);
  if (group.members.length === 0) return c.json({ error: "No members in group" }, 400);

  const createdPosts = [];

  for (const member of group.members) {
    if (member.account.status !== "active") continue;

    const [post] = await db.insert(posts).values({
      accountId: member.accountId,
      platform: member.account.platform,
      contentText: body.contentText.trim(),
      linkUrl: body.linkUrl ?? null,
      status: body.scheduledAt ? "scheduled" : "draft",
    }).returning();

    if (body.scheduledAt) {
      await db.insert(scheduledPosts).values({
        postId: post.id,
        scheduledAt: new Date(body.scheduledAt),
      });
    }

    createdPosts.push({
      postId: post.id,
      accountId: member.accountId,
      username: member.account.username,
      platform: member.account.platform,
      status: post.status,
    });
  }

  return c.json({ created: createdPosts.length, posts: createdPosts }, 201);
});

// GET /api/account-groups/:id/stats — グループ統計
accountGroupsRouter.get("/:id/stats", async (c) => {
  const groupId = c.req.param("id");

  const group = await db.query.accountGroups.findFirst({
    where: eq(accountGroups.id, groupId),
    with: {
      members: {
        with: { account: true },
      },
    },
  });

  if (!group) return c.json({ error: "Group not found" }, 404);

  const accountIds = group.members.map((m) => m.accountId);
  if (accountIds.length === 0) {
    return c.json({ group, stats: [], totalFollowers: 0, totalPosts: 0 });
  }

  // 各アカウントの投稿統計
  const stats = await db.execute(sql`
    SELECT
      a.id as account_id,
      a.username,
      a.platform,
      a.display_name,
      count(p.id)::int as post_count,
      count(CASE WHEN p.status = 'posted' THEN 1 END)::int as posted_count,
      coalesce(max(am.followers), 0)::int as followers
    FROM accounts a
    LEFT JOIN posts p ON p.account_id = a.id
    LEFT JOIN (
      SELECT DISTINCT ON (account_id) account_id, followers
      FROM account_metrics
      ORDER BY account_id, collected_at DESC
    ) am ON am.account_id = a.id
    WHERE a.id = ANY(${accountIds})
    GROUP BY a.id, a.username, a.platform, a.display_name
  `);

  return c.json({
    group: { id: group.id, name: group.name, description: group.description },
    stats,
  });
});
