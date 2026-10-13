import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passkeySetupIssue } from '../lib/passkeySetup';
const rpId = 'leash-brain-api.fly.dev';
test('browser passkeys reject localhost and lookalike hostnames outside the chosen RP domain', () => {
  for (const hostname of [
    'localhost',
    'evil-leash-brain-api.fly.dev',
    'leash-brain-api.fly.dev.attacker.example',
  ])
    assert.match(passkeySetupIssue({ platform: 'web', rpId, hostname })!, /browser preview/);
  assert.equal(passkeySetupIssue({ platform: 'web', rpId, hostname: rpId }), null);
  assert.equal(passkeySetupIssue({ platform: 'web', rpId, hostname: `app.${rpId}` }), null);
});
test('iPhone sign-up requires a configured signing team; Android does not require an Apple team', () => {
  assert.match(passkeySetupIssue({ platform: 'ios', rpId })!, /paid Apple Developer team/);
  assert.equal(passkeySetupIssue({ platform: 'android', rpId }), null);
});
