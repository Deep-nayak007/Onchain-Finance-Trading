import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { createSecp256k1SigningSession, isMeraError } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Address, LocalAccount } from 'viem';
import { config } from './config';
import { createPasskey, getPasskey } from './passkeys';
type Credential = { credentialId: string; transports?: string[] };
const storageKey = () => `leash.credential.${config.rpId}`;
async function storeCredential(credential: Credential) {
  const value = JSON.stringify(credential);
  if (Platform.OS === 'web') localStorage.setItem(storageKey(), value);
  else await SecureStore.setItemAsync(storageKey(), value);
}
async function loadCredential(): Promise<Credential | undefined> {
  const value =
    Platform.OS === 'web'
      ? localStorage.getItem(storageKey())
      : await SecureStore.getItemAsync(storageKey());
  if (!value) return undefined;
  try {
    const c = JSON.parse(value) as Credential;
    return typeof c.credentialId === 'string' ? c : undefined;
  } catch {
    return undefined;
  }
}
function requireRpId() {
  if (!config.rpId)
    throw new Error(
      'Choose the permanent passkey domain with your team, then set EXPO_PUBLIC_PASSKEY_RP_ID and rebuild. You can explore the demo now.',
    );
}
export function deriveEvmKey(prfOutput: Uint8Array): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const root = HDKey.fromMasterSeed(seed);
  let child: HDKey | undefined;
  try {
    child = root.derive("m/44'/60'/0'/0/0");
    if (!child.privateKey)
      throw new Error('The passkey could not derive your account. Try signing in again.');
    return new Uint8Array(child.privateKey);
  } finally {
    seed.fill(0);
    root.wipePrivateData();
    child?.wipePrivateData();
  }
}
function addressFromPrf(prfOutput: Uint8Array): Address {
  let key: Uint8Array | undefined;
  let session: ReturnType<typeof createSecp256k1SigningSession> | undefined;
  try {
    key = deriveEvmKey(prfOutput);
    session = createSecp256k1SigningSession({ privateKey: key });
    return toViemAccount(session).address;
  } finally {
    session?.end();
    key?.fill(0);
    prfOutput.fill(0);
  }
}
export async function createAccount(): Promise<Address> {
  requireRpId();
  const result = await createPasskey(`leash-${Date.now()}`);
  try {
    await storeCredential({
      credentialId: result.credentialId,
      transports: result.transports ? [...result.transports] : undefined,
    });
    return addressFromPrf(result.prfOutput);
  } finally {
    result.prfOutput.fill(0);
  }
}
export async function signIn(): Promise<Address> {
  requireRpId();
  const known = await loadCredential();
  const result = await getPasskey(known);
  try {
    await storeCredential(
      known?.credentialId === result.credentialId ? known : { credentialId: result.credentialId },
    );
    return addressFromPrf(result.prfOutput);
  } finally {
    result.prfOutput.fill(0);
  }
}
let signing = false;
export async function withSigner<T>(
  expectedAddress: Address,
  fn: (account: LocalAccount) => Promise<T>,
): Promise<T> {
  requireRpId();
  if (signing) throw new Error('Finish the current signing request before starting another.');
  signing = true;
  let key: Uint8Array | undefined;
  let prf: Uint8Array | undefined;
  let session: ReturnType<typeof createSecp256k1SigningSession> | undefined;
  try {
    const result = await getPasskey(await loadCredential());
    prf = result.prfOutput;
    key = deriveEvmKey(prf);
    session = createSecp256k1SigningSession({ privateKey: key });
    const account = toViemAccount(session);
    if (account.address.toLowerCase() !== expectedAddress.toLowerCase())
      throw new Error(
        'That passkey belongs to another wallet. Choose the passkey you signed in with.',
      );
    return await fn(account);
  } finally {
    session?.end();
    key?.fill(0);
    prf?.fill(0);
    signing = false;
  }
}
export function walletError(error: unknown): string {
  if (isMeraError(error)) {
    const messages: Record<string, string> = {
      PRF_UNAVAILABLE:
        'This passkey provider cannot unlock your wallet. Try iCloud Keychain or a supported Google Password Manager passkey.',
      PASSKEY_OPERATION_FAILED: 'The passkey prompt did not finish. Try again when you are ready.',
      CRYPTO_UNAVAILABLE:
        'Passkeys need a secure connection. Open the app over HTTPS or use the native development build.',
      SESSION_ENDED: 'That signing session has ended. Use Face ID again to sign.',
    };
    // Surface the browser's own reason (e.g. NotAllowedError) so failures are diagnosable.
    const cause = (error as { cause?: unknown }).cause;
    const detail =
      cause instanceof Error
        ? ` (${cause.name}: ${cause.message})`
        : cause
          ? ` (${String(cause)})`
          : '';
    if (error.code === 'PASSKEY_OPERATION_FAILED' && Platform.OS === 'web')
      return `The passkey prompt did not finish${detail}. If you just created your passkey, tap "I already have a passkey" to unlock it with a fresh tap.`;
    return (
      (messages[error.code] ?? 'Your wallet could not finish this action. Try signing in again.') +
      detail
    );
  }
  return error instanceof Error ? error.message : 'This action did not finish. Please retry.';
}
