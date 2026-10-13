import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
console.log('LEASH mock mode · localhost:8081 · no Brain/Rails services or passkeys required.');
const child = spawn(
  'npx',
  [
    'expo',
    'start',
    '--dev-client',
    '--localhost',
    '--port',
    '8081',
    '--clear',
    ...process.argv.slice(2),
  ],
  {
    cwd: mobile,
    stdio: 'inherit',
    env: {
      ...process.env,
      EXPO_PUBLIC_USE_MOCKS: 'true',
      EXPO_NO_DOTENV: '1',
      EXPO_PACKAGER_PROXY_URL: 'http://localhost:8081',
    },
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
