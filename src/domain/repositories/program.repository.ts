import type { Program } from '../entities/program.entity.js';
import type { ProgramType } from '../enums/program-type.enum.js';
import type { Modality } from '../enums/modality.enum.js';

/**
 * Persistence port for Program aggregate roots.
 */
export interface ProgramRepository {
  findById(id: string): Promise<Program | null>;
  findBySlug(slug: string): Promise<Program | null>;
  findAll(): Promise<Program[]>;
  findActive(): Promise<Program[]>;
  findByType(type: ProgramType): Promise<Program[]>;
  findByModality(modality: Modality): Promise<Program[]>;
  findByFacultyId(facultyId: string): Promise<Program[]>;
  search(query: string): Promise<Program[]>;
  /**
   * Case/diacritic-insensitive partial name match against active programs.
   * Used to resolve free-text career names supplied by the LLM (tool calling)
   * into a concrete Program document.
   */
  findByNameContains(name: string): Promise<Program[]>;
  save(program: Program): Promise<Program>;
  delete(id: string): Promise<void>;
}
