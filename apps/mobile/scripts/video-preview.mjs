import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { scenes } from './video-scenes.mjs';
import { renderPreview } from './render-video.mjs';
const base = process.env.LEASH_PREVIEW_URL || 'http://localhost:8081';
const out = resolve('../../artifacts');
const raw = resolve(out, 'raw');
await mkdir(raw, { recursive: true });
for (let i = 0; i < scenes.length; i++) {
  await writeFile(resolve(raw, `caption-${i}.txt`), scenes[i].caption);
  await writeFile(resolve(raw, `voice-${i}.txt`), scenes[i].voice);
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
  recordVideo: { dir: raw, size: { width: 390, height: 844 } },
});
const pageStarted = Date.now();
const page = await context.newPage();
await page.goto(`${base}/break-leash`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const started = Date.now();
const trimStart = (started - pageStarted) / 1000;
const waitUntil = async (second) => {
  const remaining = started + second * 1000 - Date.now();
  if (remaining > 0) await page.waitForTimeout(remaining);
};
await page.getByRole('button', { name: 'Withdraw with a leaked trading key' }).click();
await page.getByText('Stopped by Exchange', { exact: true }).scrollIntoViewIfNeeded();
await waitUntil(12);
await page.goto(`${base}/welcome`, { waitUntil: 'networkidle' });
await waitUntil(23);
await page.getByRole('button', { name: 'Explore the demo' }).click();
await waitUntil(28);
await page.goto(`${base}/rules`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Preview sample Leash Card' }).click();
await page.getByText('Your Leash Card', { exact: true }).scrollIntoViewIfNeeded();
await waitUntil(45);
await page.goto(`${base}/receipts`, { waitUntil: 'networkidle' });
await waitUntil(50);
await page
  .getByRole('button', { name: /falcon, EXECUTED, receipt/ })
  .first()
  .click();
await page.getByRole('button', { name: 'Try changing the receipt' }).scrollIntoViewIfNeeded();
await waitUntil(57);
await page.getByRole('button', { name: 'Try changing the receipt' }).click();
await waitUntil(62);
await page.getByRole('button', { name: 'Restore sample receipt' }).click();
await waitUntil(65);
await page.goto(`${base}/slack/10000000-0000-4000-8000-000000000001`, { waitUntil: 'networkidle' });
await waitUntil(75);
await page.getByRole('button', { name: 'Approve demo slack' }).click();
await page.getByRole('button', { name: 'See the new receipt' }).click();
await waitUntil(82);
// Keep the SPA session here to preserve the new sample receipt and subsequent pause.
await page.getByRole('tab', { name: 'Home', exact: true }).click();
const pull = page.getByRole('button', { name: 'Hold to pull the leash', exact: true });
await pull.scrollIntoViewIfNeeded();
const box = await pull.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(1300);
await page.mouse.up();
await waitUntil(89);
await page.getByRole('button', { name: 'Resume demo trader' }).click();
await waitUntil(93);
await page.getByRole('tab', { name: 'Risk', exact: true }).click();
await waitUntil(100);
await page.getByRole('tab', { name: 'Traders', exact: true }).click();
await waitUntil(113);
await page.goto(`${base}/break-leash`, { waitUntil: 'networkidle' });
await page.getByText('Stopped by Rules', { exact: true }).scrollIntoViewIfNeeded();
await waitUntil(120);
const video = page.video();
await context.close();
const input = await video.path();
await browser.close();
async function run(command, args) {
  await new Promise((res, rej) => {
    const p = spawn(command, args, { stdio: 'inherit' });
    p.on('error', rej);
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${command} exited ${code}`))));
  });
}
for (let i = 0; i < scenes.length; i++)
  await run('say', [
    '-v',
    'Samantha',
    '-r',
    '175',
    '-f',
    resolve(raw, `voice-${i}.txt`),
    '-o',
    resolve(raw, `voice-${i}.aiff`),
  ]);
await writeFile(
  resolve(raw, 'video-render.json'),
  JSON.stringify({ input, trimStart, scenes, out, raw }, null, 2),
);
await renderPreview({ input, trimStart, scenes, out, raw });
console.log('Two-minute narrated demo preview exported to artifacts/leash-demo-preview.mp4.');
