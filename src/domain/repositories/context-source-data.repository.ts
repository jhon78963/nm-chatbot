export interface ContextSourceData {
  originalId: string;
  fullTextContent: string;
  programName: string;
}

/**
 * Repository for pre-processed program text used in the RAG pipeline.
 * The full_text_content is what the prompts inject as {{program.full_text_content}}.
 */
export interface ContextSourceDataRepository {
  findByProgramId(programId: string): Promise<ContextSourceData | null>;
  findByProgramName(name: string): Promise<ContextSourceData | null>;
  /** Full-text search across program content — used for Prompt 6 RAG query results. */
  searchByText(query: string, limit?: number): Promise<ContextSourceData[]>;
}
