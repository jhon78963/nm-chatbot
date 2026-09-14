export interface Faculty {
  id: string;
  name: string;
  description: string;
  slug: string;
  type: string;
}

/**
 * Repository for faculties — used to build context for the general-info prompt (Prompt 5).
 */
export interface FacultyRepository {
  findAll(): Promise<Faculty[]>;
  findById(id: string): Promise<Faculty | null>;
}
