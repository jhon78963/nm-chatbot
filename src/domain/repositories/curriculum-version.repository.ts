export interface CurriculumCourseSummary {
  title: string;
  credits: number;
}

export interface CurriculumCicleSummary {
  name: string;
  goal: string;
  content: CurriculumCourseSummary[];
}

/** Flat, read-only projection of an active curriculum ("malla curricular") for a career. */
export interface CurriculumVersionSummary {
  careerId: string;
  version: string;
  description: string;
  totalCredits: number;
  cicle: CurriculumCicleSummary[];
  curriculumUrl: string;
}

/**
 * Read-only persistence port for career curriculum versions ("malla curricular").
 * This is the ONLY source of truth the chatbot may use to answer curriculum questions.
 */
export interface CurriculumVersionRepository {
  /** Returns the active curriculum version for a career, or null if none exists. */
  findActiveByCareerId(careerId: string): Promise<CurriculumVersionSummary | null>;
}
