const { chromium } = require('playwright');

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1DlcBcbyNYyEkQiLFU6TtHS2g1ODPNAkEd5ZyMQCgxUc/edit';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to spreadsheet...');
  await page.goto(SPREADSHEET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  const title = await page.title();
  console.log('Title:', title);

  // Close any dialogs / sign-in prompts
  try {
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("続行"), [aria-label="Close"]').first();
    await continueBtn.click({ timeout: 3000 });
    await sleep(1000);
  } catch(e) {}

  // ---- Step 1: Add new sheet "SNS戦略" ----
  console.log('Adding new sheet...');

  // Click the + button at the bottom to add sheet
  const addBtn = page.locator('.docs-sheet-tab-add, [aria-label*="シートを追加"], [title*="シートを追加"]').first();
  try {
    await addBtn.click({ timeout: 5000 });
    await sleep(1500);
    console.log('Clicked add sheet button');
  } catch(e) {
    console.log('Add button not found, trying alternative...', e.message);
  }

  // A dialog may appear to name the sheet, or a tab is created that we double-click to rename
  // Check for dialog first
  const dialogInput = page.locator('dialog input, [role="dialog"] input, .modal input[type="text"]').first();
  let hasDialog = false;
  try {
    await dialogInput.waitFor({ timeout: 2000 });
    hasDialog = true;
  } catch(e) {}

  if (hasDialog) {
    console.log('Dialog found, typing sheet name...');
    await dialogInput.fill('SNS戦略');
    await sleep(300);
    const okBtn = page.locator('button:has-text("OK"), button:has-text("作成"), [aria-label="OK"]').first();
    await okBtn.click();
    await sleep(1500);
  } else {
    // Double-click the active (newly created) sheet tab to rename
    console.log('No dialog, renaming new tab by double-clicking...');
    const activeTab = page.locator('.docs-sheet-tab.docs-sheet-tab-active, .docs-sheet-active, [aria-selected="true"]').last();
    await activeTab.dblclick({ timeout: 3000 });
    await sleep(800);
    // Select all and type new name
    await page.keyboard.press('Control+a');
    await sleep(200);
    await page.keyboard.type('SNS戦略', { delay: 30 });
    await page.keyboard.press('Enter');
    await sleep(1000);
  }

  console.log('Sheet tab set up.');
  await sleep(1000);

  // ---- Step 2: Make sure we are on the new sheet ----
  // Click the SNS戦略 tab if it exists
  try {
    const snsTab = page.locator('.docs-sheet-tab-name:has-text("SNS戦略"), [data-sheet-name="SNS戦略"]').first();
    await snsTab.click({ timeout: 3000 });
    await sleep(500);
  } catch(e) {}

  // ---- Step 3: Navigate to A1 and type data ----
  console.log('Navigating to A1...');
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Control+Home');
  await sleep(500);

  async function typeRow(cells) {
    for (let i = 0; i < cells.length; i++) {
      await page.keyboard.type(cells[i], { delay: 25 });
      if (i < cells.length - 1) {
        await page.keyboard.press('Tab');
        await sleep(80);
      }
    }
    await page.keyboard.press('Enter');
    await sleep(300);
  }

  console.log('Typing headers...');
  await typeRow(['カテゴリ', '集客経路', 'マネタイズ方法', '商材・内容', '単価', 'ステータス']);

  console.log('Typing data rows...');
  await typeRow(['アダルトアフィリエイト', 'Threads → Instagram', 'ストーリーAFリンク → LP', 'アプリインストール・公式LINE登録', '約500円', '計画中']);
  await typeRow(['占いアフィリエイト', '未定', 'アフィリエイト or 実写サービス', '占いジャンル展開', '未定', '構想中']);
  await typeRow(['競輪予想', '未定', 'アフィリエイトリンク', '競輪予想コンテンツ', '未定', '構想中']);

  console.log('Data entered. Now formatting...');
  await sleep(500);

  // ---- Step 4: Apply formatting via toolbar ----
  // Select row 1: go to A1, then select A1:F1
  await page.keyboard.press('Control+Home');
  await sleep(300);

  // Select A1:F1 using Name Box
  // Click the Name Box (cell reference input at top left)
  const nameBox = page.locator('[class*="name-box"] input, .cell-input, #t-name-box input, [aria-label*="Cell"], .docs-name-box-input').first();
  try {
    await nameBox.click({ timeout: 3000 });
    await sleep(200);
    await nameBox.fill('A1:F1');
    await page.keyboard.press('Enter');
    await sleep(400);
    console.log('Selected A1:F1 via Name Box');
  } catch(e) {
    console.log('Name Box not found, using keyboard selection...');
    await page.keyboard.press('Control+Home');
    await sleep(200);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await sleep(60);
    }
    await page.keyboard.up('Shift');
  }
  await sleep(300);

  // Apply dark background to header: use Format > Cells or toolbar fill color
  // Try toolbar fill color dropdown
  console.log('Applying header background color...');

  // Find the fill color button (bucket icon)
  // It's usually aria-label="Fill color" or similar in Google Sheets
  const fillColorDropdownArrow = page.locator(
    '[aria-label="塗りつぶしの色"] .goog-flat-menu-button-dropdown, ' +
    '[data-tooltip="塗りつぶしの色"] + *, ' +
    '.goog-toolbar-combo-button:has([aria-label*="Fill"]) .goog-flat-menu-button-dropdown, ' +
    '[aria-label*="fill color"] .dropdown-arrow, ' +
    '#backgroundcolor + *, ' +
    '[id*="background"] .goog-flat-menu-button-dropdown'
  ).first();

  let colorApplied = false;
  try {
    await fillColorDropdownArrow.click({ timeout: 3000 });
    await sleep(600);
    colorApplied = true;
    console.log('Opened fill color picker');
  } catch(e) {
    console.log('Could not open fill color dropdown, trying Format menu...');
  }

  if (colorApplied) {
    // Pick a dark color - look for hex input or a specific dark color swatch
    // Try custom hex input
    const hexInput = page.locator('[placeholder="#RRGGBB"], [aria-label="Hex"], input[maxlength="6"]').first();
    try {
      await hexInput.click({ timeout: 2000 });
      await hexInput.fill('37474F');
      await page.keyboard.press('Enter');
      await sleep(500);
      console.log('Applied dark color #37474F to header');
    } catch(e) {
      // Try clicking a dark blue/gray swatch
      console.log('No hex input, trying color swatch...');
      // dark gray swatch - usually in the grid
      const darkSwatch = page.locator('[aria-label*="Dark slate 4"], [aria-label*="暗いスレート"], [title="暗いスレート 4"], td[title="#37474f"]').first();
      try {
        await darkSwatch.click({ timeout: 2000 });
        await sleep(400);
      } catch(e2) {
        console.log('Could not apply specific dark color, continuing...');
        await page.keyboard.press('Escape');
      }
    }
  }

  await sleep(500);

  // Now set header text color to white
  console.log('Setting header text color to white...');
  // Make sure A1:F1 is still selected
  try {
    const nbx = page.locator('[class*="name-box"] input, .cell-input').first();
    await nbx.click({ timeout: 2000 });
    await nbx.fill('A1:F1');
    await page.keyboard.press('Enter');
    await sleep(300);
  } catch(e) {}

  // Find text color button
  const textColorArrow = page.locator(
    '[aria-label="文字の色"] .goog-flat-menu-button-dropdown, ' +
    '[data-tooltip="文字の色"] + *, ' +
    '[aria-label*="text color"] .dropdown-arrow, ' +
    '[id*="foreground"] .goog-flat-menu-button-dropdown, ' +
    '[aria-label*="Font color"] + *'
  ).first();

  try {
    await textColorArrow.click({ timeout: 3000 });
    await sleep(600);

    // Click white
    const whiteHex = page.locator('[placeholder="#RRGGBB"], input[maxlength="6"]').first();
    try {
      await whiteHex.click({ timeout: 2000 });
      await whiteHex.fill('FFFFFF');
      await page.keyboard.press('Enter');
      await sleep(400);
      console.log('Applied white text color');
    } catch(e) {
      const whiteSwatch = page.locator('[aria-label="白"], [title="白"], td[title="#ffffff"]').first();
      try {
        await whiteSwatch.click({ timeout: 2000 });
      } catch(e2) {
        await page.keyboard.press('Escape');
      }
    }
  } catch(e) {
    console.log('Could not apply text color, continuing...');
  }

  await sleep(500);

  // Make header bold
  try {
    const nbx = page.locator('[class*="name-box"] input, .cell-input').first();
    await nbx.click({ timeout: 2000 });
    await nbx.fill('A1:F1');
    await page.keyboard.press('Enter');
    await sleep(300);
    await page.keyboard.press('Control+b');
    await sleep(300);
    console.log('Applied bold to header');
  } catch(e) {}

  // ---- Row 2: Light red/pink (adult affiliate) ----
  console.log('Coloring row 2 (pink)...');
  try {
    const nbx = page.locator('[class*="name-box"] input, .cell-input').first();
    await nbx.click({ timeout: 2000 });
    await nbx.fill('A2:F2');
    await page.keyboard.press('Enter');
    await sleep(300);

    const fcArrow2 = page.locator(
      '[aria-label="塗りつぶしの色"] .goog-flat-menu-button-dropdown, ' +
      '[id*="background"] .goog-flat-menu-button-dropdown'
    ).first();
    await fcArrow2.click({ timeout: 3000 });
    await sleep(500);

    const hexInput2 = page.locator('[placeholder="#RRGGBB"], input[maxlength="6"]').first();
    await hexInput2.click({ timeout: 2000 });
    await hexInput2.fill('FFCDD2');
    await page.keyboard.press('Enter');
    await sleep(400);
    console.log('Row 2 colored pink');
  } catch(e) {
    console.log('Could not color row 2:', e.message);
  }

  // ---- Row 3: Light purple (fortune) ----
  console.log('Coloring row 3 (purple)...');
  try {
    const nbx = page.locator('[class*="name-box"] input, .cell-input').first();
    await nbx.click({ timeout: 2000 });
    await nbx.fill('A3:F3');
    await page.keyboard.press('Enter');
    await sleep(300);

    const fcArrow3 = page.locator(
      '[aria-label="塗りつぶしの色"] .goog-flat-menu-button-dropdown, ' +
      '[id*="background"] .goog-flat-menu-button-dropdown'
    ).first();
    await fcArrow3.click({ timeout: 3000 });
    await sleep(500);

    const hexInput3 = page.locator('[placeholder="#RRGGBB"], input[maxlength="6"]').first();
    await hexInput3.click({ timeout: 2000 });
    await hexInput3.fill('E1BEE7');
    await page.keyboard.press('Enter');
    await sleep(400);
    console.log('Row 3 colored purple');
  } catch(e) {
    console.log('Could not color row 3:', e.message);
  }

  // ---- Row 4: Light green (keirin) ----
  console.log('Coloring row 4 (green)...');
  try {
    const nbx = page.locator('[class*="name-box"] input, .cell-input').first();
    await nbx.click({ timeout: 2000 });
    await nbx.fill('A4:F4');
    await page.keyboard.press('Enter');
    await sleep(300);

    const fcArrow4 = page.locator(
      '[aria-label="塗りつぶしの色"] .goog-flat-menu-button-dropdown, ' +
      '[id*="background"] .goog-flat-menu-button-dropdown'
    ).first();
    await fcArrow4.click({ timeout: 3000 });
    await sleep(500);

    const hexInput4 = page.locator('[placeholder="#RRGGBB"], input[maxlength="6"]').first();
    await hexInput4.click({ timeout: 2000 });
    await hexInput4.fill('C8E6C9');
    await page.keyboard.press('Enter');
    await sleep(400);
    console.log('Row 4 colored green');
  } catch(e) {
    console.log('Could not color row 4:', e.message);
  }

  // ---- Save ----
  await page.keyboard.press('Control+s');
  await sleep(2000);

  // Screenshot
  await page.screenshot({ path: '/tmp/sns_strategy_result.png' });
  console.log('Done! Screenshot: /tmp/sns_strategy_result.png');

  await sleep(5000);
  await browser.close();
})();
