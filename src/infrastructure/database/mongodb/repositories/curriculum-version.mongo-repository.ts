import type {
  CurriculumVersionRepository,
  CurriculumVersionSummary,
} from '../../../../domain/repositories/curriculum-version.repository.js';
import { CurriculumVersionModel } from '../models/curriculum-version.model.js';

export class CurriculumVersionMongoRepository implements CurriculumVersionRepository {
  async findActiveByCareerId(careerId: string): Promise<CurriculumVersionSummary | null> {
    const doc = await CurriculumVersionModel.findOne({ careerId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    if (!doc) return null;

    const cicle = doc.cicle.map((c) => ({
      name: c.name,
      goal: c.goal,
      content: c.content.map((course) => ({ title: course.title, credits: course.credits })),
    }));

    const totalCredits = cicle.reduce(
      (sum, c) => sum + c.content.reduce((s, course) => s + course.credits, 0),
      0,
    );

    return {
      careerId: doc.careerId,
      version: doc.version,
      description: doc.description,
      totalCredits,
      cicle,
      curriculumUrl: doc.curriculumUrl,
    };
  }
}
