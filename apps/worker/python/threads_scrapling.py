#!/usr/bin/env python3
"""
threads_scrapling.py

Threads スクレイパー — Scrapling StealthyFetcher (Camoufox) 使用

stdin:  1行 JSON  {"action": "...", ...}
stdout: 1行 JSON  {"ok": true/false, ...}
stderr: "PROGRESS: <text>" 形式の進捗ログ
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime
from typing import Optional
from urllib.parse import quote

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False


# ─────────────────────────────────────────────────────────
# ユーティリティ
# ─────────────────────────────────────────────────────────

def progress(msg: str) -> None:
    print(f"PROGRESS: {msg}", file=sys.stderr, flush=True)


def parse_count(text: str) -> int:
    """'1.2K', '1.2万', '1,234' などを int に変換"""
    if not text:
        return 0
    text = str(text).replace(",", "").replace("，", "").strip()
    m = re.match(r"^([\d.]+)\s*([KkMm万千]?)$", text)
    if not m:
        return 0
    num = float(m.group(1))
    unit = m.group(2).lower()
    mp = {"k": 1000, "m": 1_000_000, "万": 10000, "千": 1000}
    return round(num * mp.get(unit, 1))


def calc_account_age_months(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    MONTHS = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
        "jan": 1, "feb": 2, "mar": 3, "apr": 4,
        "jun": 6, "jul": 7, "aug": 8, "sep": 9,
        "oct": 10, "nov": 11, "dec": 12,
    }
    year = month = None
    m = re.search(r"([A-Za-z]+)\s+(\d{4})", s)
    if m:
        month = MONTHS.get(m.group(1).lower())
        year = int(m.group(2))
    if year is None:
        m = re.search(r"(\d{4})年(\d{1,2})月", s)
        if m:
            year, month = int(m.group(1)), int(m.group(2))
    if year is None or month is None:
        return None
    now = datetime.now()
    return max(0, (now.year - year) * 12 + (now.month - month))


def clean_post_text(text: str) -> str:
    text = re.sub(
        r"(?i)(?:^|\s)(?:Translate|翻訳を見る|翻訳|See translation|Translated from \w+)(?:\s|$)",
        " ", text,
    )
    text = re.sub(
        r"(?i)(?:View\s+activity|アクティビティを見る|View\s+post\s+activity|View\s+insights|Insights)+",
        "", text,
    )
    text = re.sub(r"(?:^|\s)\d{1,2}\s*/\s*\d{1,2}(?:\s|$)", " ", text)
    return re.sub(r"[ \t]{2,}", " ", text).strip()


# ─────────────────────────────────────────────────────────
# HTML パーサ (BeautifulSoup4)
# ─────────────────────────────────────────────────────────

def _parse_engagement(container) -> tuple[int, int, int, int]:
    """(like, repost, reply, view) を aria-label → 位置ベースの順で抽出"""
    like = reply = repost = view = 0
    aria_matched = False

    for btn in container.select("button, [role='button']"):
        aria = (btn.get("aria-label") or "").lower()
        raw = re.sub(r"[,，\s]", "", btn.get_text())
        m = re.search(r"([\d.]+)([KkMm万千]?)", raw)
        cnt = parse_count(m.group(0)) if m else 0

        if "いいね" in aria or "like" in aria:
            like = cnt; aria_matched = True
        elif "リポスト" in aria or "repost" in aria or "rethread" in aria or "再共有" in aria:
            repost = cnt; aria_matched = True
        elif "返信" in aria or "reply" in aria or "comment" in aria:
            reply = cnt; aria_matched = True
        elif "表示" in aria or "view" in aria or "impression" in aria:
            view = cnt; aria_matched = True

    if not aria_matched:
        counts: list[int] = []
        for btn in container.select("button, [role='button']"):
            if btn.find("svg"):
                raw = re.sub(r"[,，\s]", "", btn.get_text())
                m = re.search(r"([\d.]+)([KkMm万千]?)", raw)
                counts.append(parse_count(m.group(0)) if m else 0)
        if len(counts) >= 3:
            like, reply, repost = counts[0], counts[1], counts[2]

    # 方式3: ビュー専用テキストパターン ("X回表示", "X views" など)
    if view == 0:
        for el in container.select("span, div, a"):
            if el.find_all(recursive=False):  # 子要素があればスキップ
                continue
            wt = el.get_text(strip=True)
            vm = re.match(
                r"^([\d.,]+)\s*([KkMm万千]?)\s*(回表示|回|views?|view|impressions?)$",
                wt, re.IGNORECASE,
            )
            if vm:
                vn = float(vm.group(1).replace(",", ""))
                vu = vm.group(2).lower()
                mp = {"k": 1000, "m": 1_000_000, "万": 10000, "千": 1000}
                view = round(vn * mp.get(vu, 1))
                break

    return like, repost, reply, view


def extract_posts_from_html(html: str, limit: int = 50) -> list[dict]:
    if not html or not _HAS_BS4:
        return []
    soup = BeautifulSoup(html, "html.parser")

    containers = (
        soup.select("[data-pressable-container]")
        or soup.select("article")
        or soup.select("div[role='article']")
    )

    posts: list[dict] = []
    for container in containers:
        if len(posts) >= limit:
            break

        # 本文
        parts: list[str] = []
        for span in container.select(
            "span[dir='auto'], span[dir='ltr'], span[dir='rtl'], [data-text-content]"
        ):
            if span.find_parent("a"):
                continue
            t = span.get_text(strip=True)
            if len(t) >= 5 and not re.match(r"^[\d/:. ]+$", t):
                parts.append(t)

        content_text = " ".join(parts)
        if len(content_text) < 5:
            continue

        # 連投続き (2/N...) はスキップ
        m = re.search(r"(?:^|\s)(\d{1,2})\s*/\s*(\d{1,2})(?:\s|$)", content_text)
        if m and int(m.group(1)) >= 2:
            continue

        content_text = clean_post_text(content_text)

        # 著者
        author_el = container.select_one("a[href*='/@']")
        author_username: Optional[str] = None
        if author_el:
            href = author_el.get("href", "")
            author_username = re.sub(r"^/@?", "", href).split("/")[0] or None

        # 画像
        image_urls: list[str] = []
        for img in container.select("img"):
            src = img.get("src", "")
            if (
                any(cdn in src for cdn in ("cdninstagram", "fbcdn", "scontent"))
                and src.startswith("http")
                and ".svg" not in src
            ):
                image_urls.append(src)
                if len(image_urls) >= 3:
                    break

        like, repost, reply, view = _parse_engagement(container)

        time_el = container.select_one("time")
        posted_at: Optional[str] = time_el.get("datetime") if time_el else None

        link_el = container.select_one("a[href*='/post/']")
        platform_post_id: Optional[str] = link_el.get("href") if link_el else None

        posts.append(
            {
                "author_username": author_username,
                "author_followers": None,
                "content_text": content_text,
                "has_image": bool(image_urls),
                "image_urls": image_urls,
                "like_count": like,
                "repost_count": repost,
                "reply_count": reply,
                "view_count": view,
                "posted_at": posted_at,
                "platform_post_id": platform_post_id,
            }
        )

    return posts


def extract_profile_from_html(html: str, username: str) -> dict:
    empty = {
        "username": username,
        "display_name": None,
        "bio": None,
        "followers_count": None,
        "posts_count": None,
        "account_created_at": None,
        "account_age_months": None,
    }
    if not html or not _HAS_BS4:
        return empty

    soup = BeautifulSoup(html, "html.parser")

    # 表示名
    h1 = soup.find("h1")
    display_name: Optional[str] = h1.get_text(strip=True) if h1 else None

    # バイオ
    bio: Optional[str] = None
    for sel in ("[data-testid='userBio']", "[class*='bio']"):
        el = soup.select_one(sel)
        if el:
            t = el.get_text(strip=True)
            if 3 < len(t) < 500:
                bio = t
                break

    # フォロワー数
    followers_count: Optional[int] = None
    for link in soup.select("a[href*='followers']"):
        link_text = link.get_text()
        m = re.search(
            r"([\d.,]+)\s*([万千KkMm]?)\s*(?:フォロワー|followers?)", link_text, re.IGNORECASE
        )
        if m:
            num = float(m.group(1).replace(",", ""))
            unit = m.group(2).lower()
            mp = {"万": 10000, "千": 1000, "k": 1000, "m": 1_000_000}
            followers_count = round(num * mp.get(unit, 1))
            break

    if followers_count is None:
        body_text = soup.get_text()
        m = re.search(
            r"([\d,]+(?:\.\d+)?)\s*([万千]?)\s*(?:フォロワー|followers?)", body_text, re.IGNORECASE
        )
        if m:
            num = float(m.group(1).replace(",", ""))
            if "万" in m.group(0):
                num *= 10000
            followers_count = round(num)

    # アカウント開設日
    body_text = soup.get_text()
    account_created_at: Optional[str] = None

    m = re.search(r"Joined\s+([A-Za-z]+\s+\d{4})", body_text)
    if m:
        account_created_at = m.group(1)

    if not account_created_at:
        m = re.search(r"(\d{4})年(\d+)月[に]?参加", body_text)
        if m:
            account_created_at = f"{m.group(1)}年{m.group(2)}月"

    if not account_created_at:
        m = re.search(r"(\d{4})年(\d{1,2})月", body_text)
        if m and 2016 <= int(m.group(1)) <= 2030:
            account_created_at = f"{m.group(1)}年{m.group(2)}月"

    # 投稿数
    posts_count: Optional[int] = None
    m = re.search(r"([\d,]+)\s*(?:投稿|posts?)", body_text, re.IGNORECASE)
    if m:
        posts_count = int(m.group(1).replace(",", ""))

    return {
        "username": username,
        "display_name": display_name,
        "bio": bio,
        "followers_count": followers_count,
        "posts_count": posts_count,
        "account_created_at": account_created_at,
        "account_age_months": calc_account_age_months(account_created_at),
    }


# ─────────────────────────────────────────────────────────
# GraphQL ウォーカー（詳細ページ用）
# ─────────────────────────────────────────────────────────

def _walk_gql(obj: object, metrics: dict, depth: int = 0) -> None:
    """JSON オブジェクトを再帰走査してエンゲージメント数値を抽出"""
    if depth > 2000 or not obj:
        return
    if isinstance(obj, list):
        for item in obj:
            _walk_gql(item, metrics, depth + 1)
        return
    if not isinstance(obj, dict):
        return
    lk = obj.get("like_count")
    if isinstance(lk, int) and lk > metrics["like"]:
        metrics["like"] = lk
    vc = (
        obj.get("view_count")
        or obj.get("video_view_count")
        or obj.get("feed_view_count")
        or obj.get("impression_count")
    )
    if isinstance(vc, int) and vc > metrics["view"]:
        metrics["view"] = vc
    rc = obj.get("reshare_count") or obj.get("repost_count")
    if isinstance(rc, int) and rc > metrics["repost"]:
        metrics["repost"] = rc
    rp = obj.get("direct_reply_count") or obj.get("reply_count")
    if isinstance(rp, int) and rp > metrics["reply"]:
        metrics["reply"] = rp
    for v in obj.values():
        if isinstance(v, (dict, list)):
            _walk_gql(v, metrics, depth + 1)


# ─────────────────────────────────────────────────────────
# StealthyFetcher ラッパー
# ─────────────────────────────────────────────────────────

def _fetch(url: str, scroll_count: int = 0) -> str:
    """URL をフェッチして HTML 文字列を返す（オプションでスクロール）"""
    from scrapling.fetchers import StealthyFetcher

    if scroll_count > 0:
        async def page_action(page) -> None:
            try:
                await page.wait_for_selector(
                    "[data-pressable-container], article", timeout=10_000
                )
            except Exception:
                pass
            await asyncio.sleep(1.0)
            for i in range(scroll_count):
                await page.evaluate("window.scrollBy(0, 800)")
                await asyncio.sleep(0.7 + 0.3 * (i % 3 == 0))

        result = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            page_action=page_action,
        )
    else:
        result = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
        )

    return result.html if result else ""


def _fetch_with_gql(url: str) -> tuple[str, dict]:
    """
    URL をフェッチしながら GraphQL レスポンスを傍受する。
    Returns (html, gql_metrics)
    """
    from scrapling.fetchers import StealthyFetcher

    gql: dict = {"like": 0, "view": 0, "reply": 0, "repost": 0}

    async def page_action(page) -> None:
        # response ハンドラを登録（goto より前）
        try:
            async def on_response(response) -> None:
                r_url = response.url
                if not re.search(r"graphql|/api/|/post_info", r_url, re.IGNORECASE):
                    return
                try:
                    data = await response.json()
                    _walk_gql(data, gql)
                except Exception:
                    pass

            page.on("response", on_response)
        except Exception:
            pass  # camoufox が on() をサポートしない場合は DOM 抽出のみ

        # いいねボタンが出るまで待機
        try:
            await page.wait_for_selector(
                "button[aria-label*='いいね'], button[aria-label*='like'], button[aria-label*='Like']",
                timeout=5_000,
            )
        except Exception:
            pass

        await asyncio.sleep(0.8)

        # 軽くスクロール（レンダリング促進）
        await page.evaluate("window.scrollBy(0, 300)")
        await asyncio.sleep(0.6)

    result = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        page_action=page_action,
    )
    return (result.html if result else ""), gql


# ─────────────────────────────────────────────────────────
# アクション実装
# ─────────────────────────────────────────────────────────

def action_profile(username: str) -> dict:
    progress(f"@{username} のプロフィールを取得中...")
    url = f"https://www.threads.com/@{username}"
    try:
        html = _fetch(url, scroll_count=0)
        profile = extract_profile_from_html(html, username)
        progress(
            f"@{username}: フォロワー={profile['followers_count']} "
            f"開設={profile['account_created_at']}"
        )
        return {"ok": True, "profile": profile}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def action_account_posts(username: str, max_posts: int = 20) -> dict:
    progress(f"@{username} の投稿を収集中 (max={max_posts})...")
    url = f"https://www.threads.com/@{username}"
    try:
        scroll_count = max(2, max_posts // 5)
        html = _fetch(url, scroll_count=scroll_count)
        posts = extract_posts_from_html(html, limit=max_posts)
        progress(f"@{username}: {len(posts)}件取得")
        return {"ok": True, "posts": posts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def action_account_posts_detailed(
    username: str,
    target_matches: int = 20,
    max_processed_urls: int = 200,
) -> dict:
    """
    プロフィールページから投稿URLを収集 → 各詳細ページを巡回。
    GraphQL インターセプトで正確なエンゲージメント値を取得。
    """
    progress(f"@{username} 詳細収集開始 (目標={target_matches}件)...")

    all_urls: set[str] = set()
    results: list[dict] = []
    processed_set: set[str] = set()

    def collect_urls(html: str) -> None:
        for m in re.finditer(r'href="(/@[^"]+/post/[^"]+)"', html):
            all_urls.add(m.group(1))

    profile_url = f"https://www.threads.com/@{username}"

    try:
        # プロフィールページをスクロールしてURLを収集
        scroll_count = min(max(target_matches * 3 // 4, 8), 20)
        html = _fetch(profile_url, scroll_count=scroll_count)
        collect_urls(html)
        progress(f"@{username}: {len(all_urls)}件のURL収集")

        matched = 0
        for post_url in list(all_urls):
            if matched >= target_matches or len(processed_set) >= max_processed_urls:
                break
            processed_set.add(post_url)

            full_url = (
                f"https://www.threads.com{post_url}"
                if not post_url.startswith("http")
                else post_url
            )

            try:
                html_detail, gql = _fetch_with_gql(full_url)
                posts = extract_posts_from_html(html_detail, limit=1)
                if posts:
                    post = posts[0]
                    post["platform_post_id"] = post_url
                    # GraphQL 値でマージ（DOM より高い場合のみ上書き）
                    if gql["like"] > post["like_count"]:
                        post["like_count"] = gql["like"]
                    if gql["view"] > post["view_count"]:
                        post["view_count"] = gql["view"]
                    if gql["reply"] > post["reply_count"]:
                        post["reply_count"] = gql["reply"]
                    if gql["repost"] > post["repost_count"]:
                        post["repost_count"] = gql["repost"]
                    results.append(post)
                    matched += 1
                    progress(
                        f"[合致{matched}/{target_matches}|処理{len(processed_set)}] "
                        f"❤{post['like_count']} 💬{post['reply_count']} "
                        f"🔁{post['repost_count']} 👁{post['view_count']}"
                    )
            except Exception as e:
                progress(f"詳細取得エラー {post_url}: {e}")

        progress(f"@{username}: 完了 {matched}件取得 (処理={len(processed_set)})")
        return {"ok": True, "posts": results}

    except Exception as e:
        return {"ok": False, "error": str(e)}


def action_keyword(keyword: str, max_posts: int = 50) -> dict:
    progress(f"「{keyword}」を検索中...")
    encoded = quote(keyword)
    url = f"https://www.threads.com/search?q={encoded}&serp_type=default"
    try:
        scroll_count = max(3, max_posts // 8)
        html = _fetch(url, scroll_count=scroll_count)
        posts = extract_posts_from_html(html, limit=max_posts)
        progress(f"「{keyword}」: {len(posts)}件取得")
        return {"ok": True, "posts": posts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def action_for_you_feed(max_posts: int = 100) -> dict:
    progress("おすすめフィードを収集中...")
    url = "https://www.threads.com/"
    try:
        scroll_count = max(5, max_posts // 10)
        html = _fetch(url, scroll_count=scroll_count)
        posts = extract_posts_from_html(html, limit=max_posts)
        progress(f"フィード: {len(posts)}件取得")
        return {"ok": True, "posts": posts}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─────────────────────────────────────────────────────────
# エントリポイント
# ─────────────────────────────────────────────────────────

def main() -> None:
    raw = sys.stdin.readline().strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"Invalid JSON: {e}"}), flush=True)
        return

    action = data.get("action", "")

    try:
        if action == "profile":
            result = action_profile(data["username"])
        elif action == "account_posts":
            result = action_account_posts(
                data["username"], int(data.get("max_posts", 20))
            )
        elif action == "account_posts_detailed":
            result = action_account_posts_detailed(
                data["username"],
                int(data.get("target_matches", 20)),
                int(data.get("max_processed_urls", 200)),
            )
        elif action == "keyword":
            result = action_keyword(data["keyword"], int(data.get("max_posts", 50)))
        elif action == "for_you_feed":
            result = action_for_you_feed(int(data.get("max_posts", 100)))
        else:
            result = {"ok": False, "error": f"Unknown action: {action!r}"}
    except KeyError as e:
        result = {"ok": False, "error": f"Missing required field: {e}"}
    except Exception as e:
        result = {"ok": False, "error": str(e)}

    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
