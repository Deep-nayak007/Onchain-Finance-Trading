import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '@expo/env';
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV ??= 'development';
load(mobile);
console.log('LEASH · Monad testnet 10143 · deployed Brain API · paper mode.');
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
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_USE_MOCKS: 'false',
      EXPO_PUBLIC_CHAIN_ID: '10143',
      EXPO_PUBLIC_RPC_URL: 'https://testnet-rpc.monad.xyz',
      EXPO_PUBLIC_API_URL: 'https://leash-brain-api.fly.dev',
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
