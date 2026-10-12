import type { ZodType } from 'zod';
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
export async function request<T>(
  base: string,
  path: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  if (!base) throw new Error('This service is not connected yet. Add its URL to apps/mobile/.env.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const message =
        payload && typeof payload === 'object' && ('error' in payload || 'message' in payload)
          ? 'error' in payload
            ? payload.error
            : (payload as { message: unknown }).message
          : null;
      throw new ServiceError(
        response.status,
        typeof message === 'string'
          ? message.slice(0, 500)
          : `The service returned ${response.status}. Refresh or try again shortly.`,
      );
    }
    const result = schema.safeParse(response.status === 204 ? null : await response.json());
    if (!result.success)
      throw new Error(
        'The service sent data this app cannot read. Ask the team to check the shared interface.',
      );
    return result.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('The service took too long to respond. Check your connection and retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
