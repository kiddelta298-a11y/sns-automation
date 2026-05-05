# Scrapling Sidecar (Threads Scraper)

Threadsスクレイピングを Scrapling (StealthyFetcher/Camoufox) で実行するPythonスクリプト。
TS Worker から子プロセスとして呼び出される。

## ローカルセットアップ（コスト0）

```bash
cd apps/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r python/requirements.txt
scrapling install        # Camoufoxブラウザを取得
deactivate
```

`.env` に以下を追加すれば既存Playwright実装からScraplingに切替わる:

```
THREADS_SCRAPER_ENGINE=scrapling
PYTHON_BIN=/path/to/sns-automation/apps/worker/.venv/bin/python3
```

`THREADS_SCRAPER_ENGINE=playwright`（または未設定）で従来動作に戻る。

## プロトコル

- **stdin**: 1行 JSON  `{"action":"profile","username":"..."}`
- **stdout**: 1行 JSON  `{"ok":true,"profile":{...}}` or `{"ok":false,"error":"..."}`
- **stderr**: `PROGRESS: <msg>` 形式の進捗ログ

## サポートするaction

| action | 必須フィールド | 戻り値 |
|---|---|---|
| `profile` | `username` | `profile` |
| `account_posts` | `username`, `max_posts` | `posts[]` |
| `account_posts_detailed` | `username`, `target_matches`, `max_processed_urls` | `posts[]` |
| `keyword` | `keyword`, `max_posts` | `posts[]` |
| `for_you_feed` | `max_posts` | `posts[]` |

## デプロイ
Render Worker内に同居（Dockerfile参照）。追加コンテナ・追加課金なし。
