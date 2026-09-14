import axios from 'axios';

/** Safe error shape for logs — never includes Authorization headers or tokens. */
export function formatMetaApiError(err: unknown): Record<string, unknown> {
  if (axios.isAxiosError(err)) {
    return {
      message: err.message,
      status: err.response?.status,
      metaError: err.response?.data,
    };
  }

  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }

  return { message: String(err) };
}
