import { createPasskeyWithPrfOutput, getPasskeyPrfOutput } from '@category-labs/mera';
import { config } from './config';
export const createPasskey = (name: string) =>
  createPasskeyWithPrfOutput({
    rp: { id: config.rpId, name: 'LEASH' },
    user: { name, displayName: 'Your LEASH account' },
  });
export const getPasskey = (credential?: { credentialId: string; transports?: string[] }) =>
  getPasskeyPrfOutput({
    rpId: config.rpId,
    credential: credential as Parameters<typeof getPasskeyPrfOutput>[0]['credential'],
  });
