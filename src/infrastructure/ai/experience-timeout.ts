export const DEFAULT_AI_TIMEOUT_FALLBACK =
  'Disculpa, estoy tardando un poco más de lo normal. En un momento te atiendo; también puedes repetir tu consulta.';

export function isExperienceTimeoutEnabled(timeoutMs: number): boolean {
  return Number.isFinite(timeoutMs) && timeoutMs > 0;
}

export async function withExperienceTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> {
  if (!isExperienceTimeoutEnabled(timeoutMs)) {
    return { value: await work(new AbortController().signal), timedOut: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const value = await work(controller.signal);
    return { value, timedOut: false };
  } catch (error) {
    if (controller.signal.aborted) {
      return { value: fallback, timedOut: true };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
