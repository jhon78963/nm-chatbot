import type {
  ContextSourceDataRepository,
  ContextSourceData,
} from '../../../../domain/repositories/context-source-data.repository.js';
import type { EnrollmentPolicyRepository } from '../../../../domain/repositories/enrollment-policy.repository.js';
import { appendEnrollmentDateFromPolicy } from '../../../shared/format-enrollment-dates.js';
import { ContextSourceDataModel } from '../models/context-source-data.model.js';
import { ProgramModel } from '../models/program.model.js';
import { EnrollmentPolicyMongoRepository } from './enrollment-policy.mongo-repository.js';

export class ContextSourceDataMongoRepository implements ContextSourceDataRepository {
  constructor(
    private readonly enrollmentPolicyRepo: EnrollmentPolicyRepository = new EnrollmentPolicyMongoRepository(),
  ) {}

  async findByProgramId(programId: string): Promise<ContextSourceData | null> {
    const [doc, policies] = await Promise.all([
      ContextSourceDataModel.findOne({ original_id: programId }).lean(),
      this.enrollmentPolicyRepo.findAllActiveByCareerId(programId),
    ]);

    if (doc) {
      return {
        originalId: doc.original_id,
        fullTextContent: appendEnrollmentDateFromPolicy(doc.full_text_content, policies),
        programName: doc.program_name,
      };
    }
    return this.buildFromProgram(programId, policies);
  }

  async findByProgramName(name: string): Promise<ContextSourceData | null> {
    const doc = await ContextSourceDataModel.findOne({
      program_name: { $regex: new RegExp(name.trim(), 'i') },
    }).lean();
    if (doc) {
      const policies = await this.enrollmentPolicyRepo.findAllActiveByCareerId(doc.original_id);
      return {
        originalId: doc.original_id,
        fullTextContent: appendEnrollmentDateFromPolicy(doc.full_text_content, policies),
        programName: doc.program_name,
      };
    }

    const prog = await ProgramModel.findOne({
      name: { $regex: new RegExp(name.trim(), 'i') },
      status: 'active',
    }).lean();
    if (!prog) return null;
    return this.buildFromProgram(prog.id);
  }

  async searchByText(query: string, limit = 5): Promise<ContextSourceData[]> {
    if (!query.trim()) return [];

    try {
      const docs = await ContextSourceDataModel
        .find({ $text: { $search: query } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean();

      if (docs.length > 0) {
        const policiesByCareer = await this.enrollmentPolicyRepo.findAllActiveByCareerIds(
          docs.map((d) => d.original_id),
        );
        return docs.map((d) => ({
          originalId: d.original_id,
          fullTextContent: appendEnrollmentDateFromPolicy(
            d.full_text_content,
            policiesByCareer.get(d.original_id) ?? [],
          ),
          programName: d.program_name,
        }));
      }
    } catch {
      // Text index might not exist; fall through to regex search
    }

    const terms = query.split(/\s+/).filter(Boolean).slice(0, 5);
    const regexes = terms.map((t) => new RegExp(t, 'i'));
    const progs = await ProgramModel.find({
      status: 'active',
      $or: [
        { name: { $in: regexes } },
        { summary: { $in: regexes } },
        { iaInformation: { $in: regexes } },
      ],
    })
      .limit(limit)
      .lean();

    const policiesByCareer = await this.enrollmentPolicyRepo.findAllActiveByCareerIds(
      progs.map((p) => p.id),
    );

    return progs.map((prog) => ({
      originalId: prog.id,
      fullTextContent: this.buildProgramText(
        prog,
        policiesByCareer.get(prog.id) ?? [],
      ),
      programName: prog.name,
    }));
  }

  private async buildFromProgram(
    programId: string,
    policies?: Awaited<ReturnType<EnrollmentPolicyRepository['findAllActiveByCareerId']>>,
  ): Promise<ContextSourceData | null> {
    const prog = await ProgramModel.findOne({ id: programId }).lean();
    if (!prog) return null;
    const resolvedPolicies = policies ?? (await this.enrollmentPolicyRepo.findAllActiveByCareerId(programId));
    return {
      originalId: prog.id,
      fullTextContent: this.buildProgramText(prog, resolvedPolicies),
      programName: prog.name,
    };
  }

  private buildProgramText(
    prog: Record<string, unknown>,
    policies: Awaited<ReturnType<EnrollmentPolicyRepository['findAllActiveByCareerId']>> = [],
  ): string {
    const lines: string[] = [];
    if (prog['name']) lines.push(`Nombre: ${prog['name']}`);
    if (prog['summary']) lines.push(`Resumen: ${prog['summary']}`);
    if (prog['iaInformation']) lines.push(`Detalle IA: ${prog['iaInformation']}`);
    if (prog['duration']) lines.push(`Duración: ${prog['duration']}`);
    if (prog['scheduleDescription']) lines.push(`Horarios: ${prog['scheduleDescription']}`);
    if (prog['graduateProfile']) lines.push(`Perfil del egresado: ${prog['graduateProfile']}`);
    if (prog['objective']) lines.push(`Objetivos: ${prog['objective']}`);
    if (prog['admissionRequirements'] && Array.isArray(prog['admissionRequirements'])) {
      lines.push(`Requisitos: ${(prog['admissionRequirements'] as string[]).join(', ')}`);
    }
    if (prog['whatsappContact']) lines.push(`WhatsApp admisiones: ${prog['whatsappContact']}`);
    if (prog['brochureUrl']) lines.push(`Brochure: ${prog['brochureUrl']}`);
    if (prog['applicationFormUrl']) lines.push(`Inscripción: ${prog['applicationFormUrl']}`);
    const costs = prog['costs'] as Array<Record<string, unknown>> | undefined;
    if (costs && costs.length > 0) {
      const costStr = costs
        .map((c) => `${c['currency']}: bachiller S/${c['bachelorFolderFee']}, tesis S/${c['thesisFolderFee']}`)
        .join(' | ');
      lines.push(`Inversión: ${costStr}`);
    }
    return appendEnrollmentDateFromPolicy(lines.join('\n'), policies);
  }
}
