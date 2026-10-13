import { GraphQLClient, type RequestDocument, type Variables } from 'graphql-request';
import type { ZodType } from 'zod';
import { config } from './config';
// Use actual packages/shared/queries.graphql in the team adapter. No query fields are invented here.
let pointed: { url: string; at: number } | null = null;
/** Current Envio URL: the pointer file (rotated when a tunnel restarts) if valid, else EXPO_PUBLIC_ENVIO_URL. */
export async function envioEndpoint(): Promise<string> {
  if (config.envioUrlPointer) {
    if (pointed && Date.now() - pointed.at < 60000) return pointed.url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(config.envioUrlPointer, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = response.ok ? (await response.text()).trim() : '';
      if (/^https:\/\/[a-z0-9.-]+\/v1\/graphql$/i.test(text)) {
        pointed = { url: text, at: Date.now() };
        return text;
      }
    } catch {
      // fall back below
    } finally {
      clearTimeout(timer);
    }
    if (pointed) return pointed.url;
  }
  return config.envioUrl;
}
export async function queryEnvio<T>(
  document: RequestDocument,
  schema: ZodType<T>,
  variables?: Variables,
): Promise<T> {
  const endpoint = await envioEndpoint();
  if (!endpoint)
    throw new Error('The history service is not connected yet. Add EXPO_PUBLIC_ENVIO_URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const client = new GraphQLClient(endpoint, {
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });
    const payload = await client.request(document, variables);
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new Error(
        'The indexer sent data this app cannot read. Ask Rails to check the shared queries.',
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('The history service took too long to respond. Refresh after it reconnects.');
    if (error instanceof TypeError)
      throw new Error(
        'The history service could not be reached. Refresh after the team restores it.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
