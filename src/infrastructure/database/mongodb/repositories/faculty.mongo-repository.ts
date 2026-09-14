import type {
  FacultyRepository,
  Faculty,
} from '../../../../domain/repositories/faculty.repository.js';
import { FacultyModel } from '../models/faculty.model.js';

export class FacultyMongoRepository implements FacultyRepository {
  async findAll(): Promise<Faculty[]> {
    const docs = await FacultyModel.find().lean();
    return docs.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? '',
      slug: d.slug,
      type: d.type,
    }));
  }

  async findById(id: string): Promise<Faculty | null> {
    const doc = await FacultyModel.findOne({ id }).lean();
    if (!doc) return null;
    return { id: doc.id, name: doc.name, description: doc.description ?? '', slug: doc.slug, type: doc.type };
  }
}
