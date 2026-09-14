export interface SaveMediaOptions {
  mimeType: string;
  conversationId: string;
  originalName?: string;
}

export interface SavedMedia {
  /** Relative key used to retrieve the file, e.g. "1720000000000-abc123.jpg" */
  storageKey: string;
  /** Public path served by the API, e.g. "/media/1720000000000-abc123.jpg" */
  publicPath: string;
}

/**
 * Port for persisting media files received from or sent to leads.
 */
export interface MediaStoragePort {
  save(buffer: Buffer, options: SaveMediaOptions): Promise<SavedMedia>;
}
