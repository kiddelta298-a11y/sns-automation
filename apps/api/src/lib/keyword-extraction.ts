import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { buzzKeywords } from "../db/schema.js";

// 最低限の日本語ストップワード（助詞・助動詞・形式名詞）
const STOP_WORDS = new Set([
  "の","に","は","を","が","で","と","た","て","い","し","る","な","も","れ","ら",
  "から","まで","ので","だ","です","ます","こと","これ","それ","あれ","その","あの",
  "ここ","そこ","どの","ため","という","として","によって","における","だった","でした",
  "なる","なっ","ある","いる","する","した","して","できる","ない","ません","でしょう",
  "さん","くん","ちゃん","今日","明日","昨日","今","もう","まだ","でも","けど","しかし",
  "そして","また","やっぱり","やっぱ","本当","ほんと","すごい","すごく","とても","ちょっと",
  "少し","たくさん","みたい","みたいに","一緒","みんな","自分","私","僕","俺","あなた",
  "君","彼","彼女","人","方","時","中","前","後","上","下","左","右","そう","こう","どう",
  "なんか","なんで","なに","何","いつ","どこ","誰","どれ","どっち","これから","ここまで",
  "について","に関して","による","によれば","かも","かな","だけ","だけど","のに","のか",
  "いう","言う","思う","思っ","感じ","感じる","気","気持ち","話","話し","見","見る","見た",
  "聞い","行く","来る","来た","やる","やっ","出","出る","入る","取","使","使う","作","作る",
  "一","二","三","四","五","六","七","八","九","十","百","千","万","回","個","件","人",
]);

/**
 * 日本語＋英数字の軽量N-gram抽出。
 * - カタカナは連続塊（例: マーケティング）
 * - 漢字は2〜4文字のスライディング (例: 勝ちパターン → 勝ち/ちパ... ではなく 意味のある漢字連続)
 * - 英単語は空白区切り
 * - ひらがなは単独では弱いので連続3文字以上のみ拾う
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();

  // 1) URL / メンション / 記号を除去
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[A-Za-z0-9_]+/g, " ")
    .replace(/[!?！？。、…「」【】『』\[\]()（）\n\r\t\.,"'"'`~#*_\-—=+<>\/\\|]/g, " ");

  // 2) カタカナ連続（2文字以上）
  const kataMatches = cleaned.match(/[ァ-ヴー]{2,}/g) ?? [];
  for (const k of kataMatches) if (k.length <= 20) out.add(k);

  // 3) 漢字連続（2〜6文字、意味を持ちやすい）
  const kanjiMatches = cleaned.match(/[\u4e00-\u9faf]{2,6}/g) ?? [];
  for (const k of kanjiMatches) out.add(k);

  // 4) 漢字＋ひらがな（動詞・形容詞ぽい 2〜5文字）
  const mixedMatches = cleaned.match(/[\u4e00-\u9faf][\u3040-\u309f]{1,3}/g) ?? [];
  for (const m of mixedMatches) if (m.length >= 2 && m.length <= 5) out.add(m);

  // 5) 英単語（3文字以上）
  const engMatches = cleaned.match(/[A-Za-z][A-Za-z0-9]{2,19}/g) ?? [];
  for (const e of engMatches) out.add(e.toLowerCase());

  // フィルタ
  return [...out].filter(
    (w) => w.length >= 2 && w.length <= 20 && !STOP_WORDS.has(w),
  );
}

interface BuzzKeywordInput {
  industryId: string | null;
  keywordSetId?: string | null;
  /** 各投稿の { text, buzzScore } */
  posts: { text: string; buzzScore: number }[];
}

/**
 * 投稿群からキーワードを抽出し buzz_keywords テーブルに upsert。
 * PDCA: 既存行があれば occurrences / totalBuzzScore を加算し avgBuzzScore と winScore を再計算。
 */
export async function upsertBuzzKeywords({
  industryId,
  keywordSetId = null,
  posts,
}: BuzzKeywordInput): Promise<{ keywordsProcessed: number }> {
  if (!industryId || posts.length === 0) return { keywordsProcessed: 0 };

  // キーワード → { occurrences, totalBuzz, postCount }
  const agg = new Map<string, { occurrences: number; totalBuzz: number; postCount: number }>();

  for (const post of posts) {
    const kws = extractKeywords(post.text);
    const seenInPost = new Set<string>();
    for (const kw of kws) {
      const entry = agg.get(kw) ?? { occurrences: 0, totalBuzz: 0, postCount: 0 };
      entry.occurrences += 1;
      if (!seenInPost.has(kw)) {
        entry.postCount += 1;
        entry.totalBuzz += post.buzzScore;
        seenInPost.add(kw);
      }
      agg.set(kw, entry);
    }
  }

  // 上位300件だけを永続化（ノイズ除去）
  const sorted = [...agg.entries()]
    .sort((a, b) => b[1].occurrences - a[1].occurrences)
    .slice(0, 300);

  if (sorted.length === 0) return { keywordsProcessed: 0 };

  // upsert
  for (const [keyword, v] of sorted) {
    await db
      .insert(buzzKeywords)
      .values({
        industryId,
        keywordSetId,
        keyword,
        occurrences: v.occurrences,
        totalBuzzScore: v.totalBuzz,
        postCount: v.postCount,
        avgBuzzScore: v.postCount > 0 ? v.totalBuzz / v.postCount : 0,
        jobCount: 1,
        winScore: v.occurrences * (v.postCount > 0 ? v.totalBuzz / v.postCount : 0),
      })
      .onConflictDoUpdate({
        target: [buzzKeywords.industryId, buzzKeywords.keyword],
        set: {
          occurrences: sql`${buzzKeywords.occurrences} + ${v.occurrences}`,
          totalBuzzScore: sql`${buzzKeywords.totalBuzzScore} + ${v.totalBuzz}`,
          postCount: sql`${buzzKeywords.postCount} + ${v.postCount}`,
          jobCount: sql`${buzzKeywords.jobCount} + 1`,
          avgBuzzScore: sql`(${buzzKeywords.totalBuzzScore} + ${v.totalBuzz}) / NULLIF(${buzzKeywords.postCount} + ${v.postCount}, 0)`,
          winScore: sql`(${buzzKeywords.occurrences} + ${v.occurrences}) * ((${buzzKeywords.totalBuzzScore} + ${v.totalBuzz}) / NULLIF(${buzzKeywords.postCount} + ${v.postCount}, 0))`,
          lastSeenAt: sql`NOW()`,
        },
      });
  }

  return { keywordsProcessed: sorted.length };
}
