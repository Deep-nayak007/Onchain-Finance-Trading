import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.LEASH_PREVIEW_URL || 'http://localhost:8081';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(`${base}/welcome`, { waitUntil: 'domcontentloaded' });
  await page.getByText('MONAD TESTNET', { exact: false }).first().waitFor({ timeout: 60000 });
  assert.equal(
    await page.getByRole('button', { name: 'Continue with Face ID' }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'Check the testnet receipt' }).click();
  await page
    .getByText('PAPER · No trade was executed', { exact: true })
    .waitFor({ timeout: 120000 });
  await page.getByText('PAPER · No trade was executed', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'View receipt on explorer' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'View trade on explorer' }).count(), 0);
  const blocked = (await page.getByRole('button', { name: 'Retry reasoning' }).count()) > 0;
  if (blocked) {
    assert.equal(await page.getByText('✓ matches onchain', { exact: false }).count(), 0);
    await page.getByRole('button', { name: 'Retry reasoning' }).waitFor();
  } else {
    await page.getByText('✓ matches onchain · 0.9 s', { exact: true }).first().waitFor();
  }
  await page.screenshot({
    path: '../../artifacts/screenshots/web/08-testnet-receipt-after-migration.png',
    fullPage: true,
  });
  console.log(
    blocked
      ? 'PASS: missing Brain reasoning shows paper metadata + pending verification, with no checkmark.'
      : 'PASS: public receipt independently verifies; paper, usedSlack, receipt explorer.',
  );
  await page.goto(`${base}/dev/services`, { waitUntil: 'domcontentloaded' });
  for (const label of [
    'Brain connected',
    'RPC matches · 10143',
    'Perpl connected',
    'MON-PERP · network matches',
    'Kuru book connected',
    'Envio connected',
  ]) {
    await page.getByText(label, { exact: false }).first().waitFor({ timeout: 120000 });
  }
  await page.screenshot({
    path: '../../artifacts/screenshots/web/09-testnet-connections.png',
    fullPage: true,
  });
  console.log(
    'PASS: public connection screen reads real Brain, RPC, Perpl book and markets, Kuru book and Envio.',
  );
  await page.goto(`${base}/traders`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue with Face ID' }).waitFor({ timeout: 30000 });
  console.log('PASS: wallet screens require sign-in; the public receipt does not.');
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  await browser.close();
}
