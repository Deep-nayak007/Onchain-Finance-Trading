import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.env.LEASH_PREVIEW_URL || 'http://localhost:8081';
const out = resolve('../../artifacts/screenshots/web');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const screens = [
  ['home', '01-home'],
  ['receipts', '02-receipts'],
  ['slack/10000000-0000-4000-8000-000000000001', '03-slack'],
  ['risk', '04-risk'],
  ['traders', '05-traders'],
  ['rules', '06-rules'],
];
try {
  for (const [route, name] of screens) {
    await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (route === 'rules') {
      await page.getByRole('button', { name: 'Preview sample Leash Card' }).click();
      await page.getByText('Your Leash Card', { exact: true }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    console.log(`Captured ${name}`);
  }
  await writeFile(
    resolve(out, 'README.txt'),
    'Six 1170x2532 captures of the Expo web app at iPhone viewport size. Sample data is visibly labelled DEMO. These are browser captures, not physical-device proof or live trading evidence.\n',
  );
} finally {
  await browser.close();
}
