// Setup checks before offering sign-up. The authenticator still validates the native association.
export function passkeySetupIssue(options: {
  platform: string;
  rpId: string;
  hostname?: string;
  appleTeamId?: string;
}): string | null {
  if (!options.rpId) return 'Passkeys are waiting for the permanent account domain.';
  if (options.platform === 'ios' && !options.appleTeamId)
    return 'iPhone passkeys are waiting for a build signed by a paid Apple Developer team and its domain association file. You can check the public receipt now.';
  if (options.platform === 'web') {
    const hostname = options.hostname?.toLowerCase() ?? '';
    const rpId = options.rpId.toLowerCase();
    if (hostname !== rpId && !hostname.endsWith(`.${rpId}`))
      return 'This browser preview can show receipts. Create or restore a passkey in the native app, or a web build hosted on the permanent passkey domain.';
  }
  return null;
}
