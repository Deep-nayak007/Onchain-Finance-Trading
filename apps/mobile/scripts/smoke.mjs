import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.LEASH_PREVIEW_URL || 'http://localhost:8081';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
const externalRequests = [];
page.on('request', (request) => {
  const url = new URL(request.url());
  if (
    ['http:', 'https:'].includes(url.protocol) &&
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  )
    externalRequests.push(request.url());
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByText('$1,248.62', { exact: true }).waitFor();
  const pull = page.getByRole('button', { name: 'Hold to pull the leash', exact: true });
  await pull.scrollIntoViewIfNeeded();
  let box = await pull.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  assert.equal(await page.getByText('Demo trader paused.', { exact: false }).count(), 0);
  await page.mouse.down();
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page
    .getByText('Demo trader paused. No onchain transaction was sent.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Resume demo trader' }).click();
  await page.getByText('Your trader can trade again.', { exact: true }).waitFor();
  console.log('PASS: short hold cancels; full hold pauses; user resumes.');
  await page.getByRole('button', { name: 'Review slack request' }).click();
  await page.getByRole('button', { name: 'Approve demo slack' }).click();
  await page.getByRole('button', { name: 'See the new receipt' }).click();
  await page
    .getByRole('button', { name: /falcon, EXECUTED, receipt/ })
    .first()
    .click();
  await page
    .getByText('Temporary slack used · expires on its own', { exact: false })
    .filter({ visible: true })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Try changing the receipt' }).click();
  await page
    .getByText('Doesn’t match · do not trust this receipt', { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Restore sample receipt' }).click();
  assert.equal(
    await page.getByText('Doesn’t match · do not trust this receipt', { exact: true }).count(),
    0,
  );
  console.log('PASS: denied → slack approved → new receipt; tampering fails visibly.');
  await page.goto(`${base}/traders`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Hire Owl' }).click();
  await page.getByRole('button', { name: 'Preview sample Leash Card' }).click();
  await page.getByText('Only MON-PERP and MON/AUSD', { exact: true }).waitFor();
  await page
    .getByRole('textbox', { name: 'Your trading rules' })
    .fill('Trade MON only. Up to 2x leverage, $15 per trade. Stop at 3% weekly loss.');
  assert.equal(await page.getByRole('button', { name: 'Use these demo rules' }).count(), 0);
  await page.getByRole('button', { name: 'Preview sample Leash Card' }).click();
  await page.getByText('Up to 2x leverage', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Use these demo rules' }).click();
  await page.getByRole('button', { name: 'Back to your trader' }).click();
  await page.getByText('2x / $15', { exact: true }).waitFor();
  console.log('PASS: persona selection, card invalidation, rule compilation and activation.');
  for (const [route, title] of [
    ['risk', 'Room to breathe.'],
    ['spot', 'A simple swap.'],
    ['trade', 'Your call.'],
    ['perpl-setup', 'Fund the leash.'],
    ['welcome', 'GIVE IT SLACK.'],
    ['break-leash', 'Try to break the leash.'],
  ]) {
    await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
    await page.getByText(title, { exact: route !== 'welcome' }).waitFor();
  }
  await page.goto(`${base}/spot`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Get a quote' }).click();
  await page.getByRole('button', { name: 'Confirm demo swap' }).click();
  await page.getByText('Demo swap completed. No funds were exchanged.', { exact: true }).waitFor();
  await page.goto(`${base}/trade`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Manual trade amount' }).fill('100');
  assert.equal(await page.getByRole('button', { name: 'Place demo trade' }).isDisabled(), true);
  await page.getByRole('textbox', { name: 'Manual trade amount' }).fill('25');
  await page.getByRole('button', { name: 'Place demo trade' }).click();
  await page
    .getByText('Demo trade added to receipts. No order was sent.', { exact: true })
    .waitFor();
  console.log('PASS: all routes, swap quote/confirmation, manual trade cap and execution.');
  await page.goto(`${base}/home`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Mock data controls' }).click();
  await page.getByRole('button', { name: 'Show an empty portfolio' }).click();
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await page.getByText('$0.00', { exact: true }).filter({ visible: true }).first().waitFor();
  await page.getByRole('tab', { name: 'Receipts', exact: true }).click();
  await page.getByText('No receipts yet', { exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('tab', { name: 'Risk', exact: true }).click();
  await page.getByText('No open positions', { exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Mock data controls' }).click();
  await page.getByRole('button', { name: 'Reset all mock data' }).click();
  await page.getByText('$1,248.62', { exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Mock data controls' }).click();
  await page.getByRole('button', { name: 'Create a fresh slack request' }).click();
  await page
    .getByText('A fresh ten-minute request is ready. Open Home to review it.', { exact: true })
    .waitFor();
  console.log('PASS: empty portfolio states, full reset, and repeatable slack requests.');
  await page.getByRole('button', { name: 'Test onboarding' }).click();
  await page.getByRole('button', { name: 'Continue with demo account' }).click();
  await page.getByRole('button', { name: 'Prepare demo account' }).click();
  await page.getByRole('button', { name: 'Set up my trader' }).click();
  await page.getByRole('button', { name: 'Add demo dollars' }).click();
  await page.getByRole('button', { name: 'Authorize demo trader' }).click();
  await page.getByRole('button', { name: 'Write my rules' }).waitFor();
  await page.getByRole('button', { name: 'Mock data controls' }).click();
  await page.getByRole('button', { name: 'Reset all mock data' }).click();
  console.log(
    'PASS: demo onboarding, gas, deposit and key authorization without passkeys or services.',
  );
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto(`${base}/home`, { waitUntil: 'networkidle' });
  assert.ok((await desktop.getByRole('button', { name: 'LEASH · welcome' }).boundingBox()).x > 400);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(externalRequests.length, 0, externalRequests.join('\n'));
  console.log('PASS: no external API, gateway, indexer, RPC or passkey requests in mock mode.');
  console.log('PASS: desktop framing and no browser console/runtime errors.');
} finally {
  await browser.close();
}
