const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, '../..');
config.watchFolders = [...new Set([...(config.watchFolders || []), root])];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@leash/shared/canonical') {
    if (process.env.EXPO_PUBLIC_USE_MOCKS !== 'false') {
      return { filePath: path.join(__dirname, 'mocks/canonical.ts'), type: 'sourceFile' };
    }
    // Prem's canonical JSON lives in packages/shared/src/ (exported as @leash/shared/canonical).
    for (const rel of ['packages/shared/src/canonical.ts', 'packages/shared/canonical.ts']) {
      const shared = path.join(root, rel);
      if (fs.existsSync(shared)) return { filePath: shared, type: 'sourceFile' };
    }
    throw new Error('Live mode requires Prem’s packages/shared/canonical.ts.');
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
