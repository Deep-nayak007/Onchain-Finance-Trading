import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cache = resolve(homedir(), 'Library/Caches/leash-native-build');
async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        EXPO_NO_GIT_STATUS: '1',
        EXPO_PACKAGER_PROXY_URL: process.env.EXPO_PACKAGER_PROXY_URL || 'http://localhost:8081',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
await mkdir(cache, { recursive: true });
// rsync does not copy extended attributes: synced Desktop Finder metadata breaks Xcode framework signing.
await run('rsync', [
  '-a',
  '--exclude=/.git',
  '--exclude=/artifacts',
  '--exclude=/apps/mobile/ios',
  '--exclude=/apps/mobile/.expo',
  '--exclude=/apps/mobile/dist',
  '--exclude=/node_modules/expo-modules-jsi/apple/.DerivedData',
  `${root}/`,
  `${cache}/`,
]);
const mobile = resolve(cache, 'apps/mobile');
await run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install'], mobile);
await run('npx', ['expo', 'run:ios', '--no-bundler', ...process.argv.slice(2)], mobile);
console.log(
  'Native app built in the local cache. Run npm start from the source workspace, then open the development server in LEASH.',
);
