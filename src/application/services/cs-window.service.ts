export const CS_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CsWindowInfo {
  csWindowOpen: boolean;
  csWindowExpiresAt: string | null;
}

export function computeCsWindow(lastUserMessageAt: Date | null, now = new Date()): CsWindowInfo {
  if (!lastUserMessageAt) {
    return { csWindowOpen: false, csWindowExpiresAt: null };
  }

  const expiresAt = new Date(lastUserMessageAt.getTime() + CS_WINDOW_MS);
  return {
    csWindowOpen: now.getTime() < expiresAt.getTime(),
    csWindowExpiresAt: expiresAt.toISOString(),
  };
}
