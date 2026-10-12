import { GraphQLClient, type RequestDocument, type Variables } from 'graphql-request';
import type { ZodType } from 'zod';
import { config } from './config';
// Use actual packages/shared/queries.graphql in the team adapter. No query fields are invented here.
export async function queryEnvio<T>(
  document: RequestDocument,
  schema: ZodType<T>,
  variables?: Variables,
): Promise<T> {
  if (!config.envioUrl)
    throw new Error('The history service is not connected yet. Add EXPO_PUBLIC_ENVIO_URL.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const client = new GraphQLClient(config.envioUrl, {
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });
    const payload = await client.request(document, variables);
    const parsed = schema.safeParse(payload);
    if (!parsed.success)
      throw new Error(
        'The indexer sent data this app cannot read. Ask Rails to check the shared queries.',
      );
    return parsed.data;
  } finally {
    clearTimeout(timer);
  }
}
