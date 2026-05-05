import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const SESSION_FILE = '/home/himawari_pchimawari_pc/projects/sns-automation/apps/worker/data/sessions/instagram_natalia_r_29.json';
const IMAGE_PATH = '/home/himawari_pchimawari_pc/projects/sns-automation/apps/worker/data/instagram-uploads/natalia_r_29/pending/LINE_ALBUM_韓国X画像_260429_1.jpg';
const BASE_URL = 'https://www.instagram.com';
const SS_DIR = '/home/himawari_pchimawari_pc/projects/sns-automation/apps/worker/data/screenshots';

const ss = async (page, name) => {
  const p = path.join(SS_DIR, `direct-test-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p });
  console.log(`Screenshot: ${p}`);
};

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    locale: 'ja-JP',
    storageState: JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')),
  });
  const page = await ctx.newPage();
  
  // Go to home
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const url = page.url();
  console.log('URL after home goto:', url);
  
  if (url.includes('/accounts/login')) {
    console.error('NOT LOGGED IN - session expired!');
    await ss(page, 'login');
    await browser.close();
    return;
  }
  
  // Wait for network idle
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(e => console.log('networkidle timeout:', e.message));
  
  await ss(page, 'home-before');
  
  // Find file inputs
  const inputs = await page.$$('input[type="file"]');
  console.log('File inputs found:', inputs.length);
  for (const inp of inputs) {
    const accept = await inp.getAttribute('accept');
    console.log('  accept:', accept);
  }
  
  // Find the avif story input
  let storyInput = null;
  for (const inp of inputs) {
    const accept = await inp.getAttribute('accept');
    if (accept?.includes('avif') || accept?.includes('image')) {
      storyInput = inp;
      console.log('Using input with accept:', accept);
      break;
    }
  }
  
  if (!storyInput) {
    console.error('Story file input NOT FOUND on home page!');
    const allInputsInfo = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type, accept: i.accept, name: i.name
      }))
    );
    console.log('All inputs:', JSON.stringify(allInputsInfo));
    await ss(page, 'no-input');
    await browser.close();
    return;
  }
  
  // Set files
  console.log('Setting files...');
  await storyInput.setInputFiles(IMAGE_PATH);
  console.log('Files set, waiting for /create/story/...');
  
  await page.waitForTimeout(5000);
  console.log('URL after setInputFiles:', page.url());
  await ss(page, 'after-set-files');
  
  if (!page.url().includes('/create/story/')) {
    console.error('Did not navigate to /create/story/!');
    await browser.close();
    return;
  }
  
  console.log('SUCCESS - reached story editor!');
  
  // Wait a bit and take screenshot of editor
  await page.waitForTimeout(3000);
  await ss(page, 'story-editor');
  
  // Look for share button (don't actually share in test)
  const shareSelectors = [
    'text="ストーリーズに追加"', 'text="Share to story"',
    'button:has-text("ストーリーズに追加")', 'button:has-text("Share")',
    'text="Share to Story"',
  ];
  let shareBtn = null;
  for (const sel of shareSelectors) {
    shareBtn = await page.$(sel);
    if (shareBtn) {
      console.log('Share button found via:', sel);
      break;
    }
  }
  
  if (!shareBtn) {
    console.log('Share button NOT found, listing buttons:');
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim().substring(0, 50))
    );
    console.log('Buttons:', JSON.stringify(btns));
  }
  
  await browser.close();
  console.log('Done!');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
