const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, '../..');
config.watchFolders = [...new Set([...(config.watchFolders || []), root])];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@leash/shared/canonical') {
    const shared = path.join(root, 'packages/shared/canonical.ts');
    if (fs.existsSync(shared)) return { filePath: shared, type: 'sourceFile' };
    if (process.env.EXPO_PUBLIC_USE_MOCKS === 'false')
      throw new Error('Live mode requires Prem’s packages/shared/canonical.ts.');
    return { filePath: path.join(__dirname, 'demo/canonical.ts'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
