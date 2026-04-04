import { defineConfig } from "playwright/test";

export default defineConfig({
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  timeout: 60_000,
});
