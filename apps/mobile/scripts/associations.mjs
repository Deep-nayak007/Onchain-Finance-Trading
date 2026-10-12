import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile('.env');
} catch {}
const rpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID;
const teamId = process.env.APPLE_TEAM_ID;
const certificate = process.env.ANDROID_CERT_SHA256;
if (!rpId || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(rpId))
  throw new Error('Set the permanent EXPO_PUBLIC_PASSKEY_RP_ID hostname first.');
if (!teamId && !certificate)
  throw new Error(
    'Supply APPLE_TEAM_ID and/or ANDROID_CERT_SHA256 for your actual signing accounts.',
  );
const out = resolve('../../artifacts/associations/.well-known');
await mkdir(out, { recursive: true });
if (teamId) {
  if (!/^[A-Z0-9]{10}$/.test(teamId))
    throw new Error('APPLE_TEAM_ID must be the real 10-character Apple Team ID.');
  await writeFile(
    resolve(out, 'apple-app-site-association'),
    JSON.stringify({ webcredentials: { apps: [`${teamId}.app.leash.mobile`] } }, null, 2),
  );
}
if (certificate) {
  if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(certificate))
    throw new Error('Use the actual colon-separated SHA-256 signing certificate fingerprint.');
  await writeFile(
    resolve(out, 'assetlinks.json'),
    JSON.stringify(
      [
        {
          relation: ['delegate_permission/common.get_login_creds'],
          target: {
            namespace: 'android_app',
            package_name: 'app.leash.mobile',
            sha256_cert_fingerprints: [certificate],
          },
        },
      ],
      null,
      2,
    ),
  );
}
console.log(
  `Files generated in ${out}. Host them at https://${rpId}/.well-known/ with JSON content type and no redirects. Rebuild the native app after changing associated domains.`,
);
