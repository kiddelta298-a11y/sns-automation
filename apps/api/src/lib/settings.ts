import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export const SETTING_KEYS = {
  ANTHROPIC_API_KEY:          "anthropic_api_key",
  DEFAULT_COLLECTION_TARGET:  "default_collection_target",
  AUTO_ANALYZE_AFTER_COLLECT: "auto_analyze_after_collect",
  THREADS_HEADLESS:           "threads_headless",
  NTFY_URL:                   "ntfy_url",
  NTFY_TOPIC:                 "ntfy_topic",
  DEFAULT_ACCOUNT_ID:         "default_account_id",
} as const;

export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.DEFAULT_COLLECTION_TARGET]:  "500",
  [SETTING_KEYS.AUTO_ANALYZE_AFTER_COLLECT]: "true",
  [SETTING_KEYS.THREADS_HEADLESS]:           "true",
  [SETTING_KEYS.NTFY_URL]:                   "",
  [SETTING_KEYS.NTFY_TOPIC]:                 "sns-automation",
  [SETTING_KEYS.DEFAULT_ACCOUNT_ID]:         "",
};

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) });
  return row?.value ?? SETTING_DEFAULTS[key] ?? null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.query.appSettings.findMany();
  const result: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  // APIキーはマスク
  if (result[SETTING_KEYS.ANTHROPIC_API_KEY]) {
    const raw = result[SETTING_KEYS.ANTHROPIC_API_KEY];
    result[SETTING_KEYS.ANTHROPIC_API_KEY] = raw.slice(0, 10) + "..." + raw.slice(-4);
  }
  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });

  // ANTHROPIC_API_KEY はプロセス環境変数にも即反映
  if (key === SETTING_KEYS.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = value;
  }
}
