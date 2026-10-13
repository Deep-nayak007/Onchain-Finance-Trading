const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const config = getDefaultConfig(__dirname);
// Expo inlines public settings into transforms. Switching native/web RP domains
// must not reuse a bundle compiled with the previous profile's settings.
const buildProfile = Object.keys(process.env)
  .filter((key) => key.startsWith('EXPO_PUBLIC_') || ['NODE_ENV', 'EXPO_NO_DOTENV'].includes(key))
  .sort()
  .map((key) => [key, process.env[key]]);
config.cacheVersion += `-${createHash('sha256').update(JSON.stringify(buildProfile)).digest('hex')}`;
const root = path.resolve(__dirname, '../..');
config.watchFolders = [...new Set([...(config.watchFolders || []), root])];
// Expo 57's development env module merges .env files after shell variables.
// Explicit profiles must keep those files out of the context module as well.
if (process.env.EXPO_NO_DOTENV === '1') {
  const existing = config.resolver.blockList;
  config.resolver.blockList = [
    ...(existing ? (Array.isArray(existing) ? existing : [existing]) : []),
    /[/\\]\.env(?:\.[^/\\]*)?$/,
  ];
}
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@leash/shared/canonical') {
    if (process.env.EXPO_PUBLIC_USE_MOCKS !== 'false') {
      return { filePath: path.join(__dirname, 'mocks/canonical.ts'), type: 'sourceFile' };
    }
    const shared = path.join(root, 'packages/shared/src/canonical.ts');
    if (fs.existsSync(shared)) return { filePath: shared, type: 'sourceFile' };
    throw new Error('Live mode requires packages/shared/src/canonical.ts.');
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
