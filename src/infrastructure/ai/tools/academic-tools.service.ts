import type {
  EnrollmentPolicyRepository,
  EnrollmentPolicySummary,
} from '../../../domain/repositories/enrollment-policy.repository.js';
import type {
  CurriculumVersionRepository,
  CurriculumVersionSummary,
} from '../../../domain/repositories/curriculum-version.repository.js';
import type { ProgramRepository } from '../../../domain/repositories/program.repository.js';
import type { Program } from '../../../domain/entities/program.entity.js';
import { TOOL_NAMES } from './academic-tools.definitions.js';
import { formatEnrollmentDatesForTool } from '../../shared/format-enrollment-dates.js';
import { logger } from '../../shared/logger.js';

interface ToolArgs {
  nombre_carrera?: unknown;
}

/** Generic technical-failure payload the LLM is instructed (via the system prompt) to handle gracefully. */
function dbErrorPayload(context: string): string {
  return JSON.stringify({
    ok: false,
    error: 'DB_UNAVAILABLE',
    mensaje:
      'No fue posible consultar la base de datos en este momento (posible caída o timeout de conexión). ' +
      'No inventes ningun dato. Informa al usuario que hay un inconveniente técnico temporal y ofrécele ' +
      'derivarlo con un asesor humano.',
    context,
  });
}

function careerNotFoundPayload(nombreCarrera: string): string {
  return JSON.stringify({
    ok: false,
    error: 'CAREER_NOT_FOUND',
    mensaje: `No se encontró ninguna carrera activa que coincida con "${nombreCarrera}" en la base de datos. ` +
      'No asumas ni inventes un costo o información para esta carrera. Pide al usuario que confirme el nombre ' +
      'exacto de la carrera, o deriva a un asesor si el usuario insiste en un nombre que no existe.',
  });
}

/**
 * Executes the Mongo-backed academic tools exposed to the LLM (function/tool calling).
 * Every method returns a JSON string ready to be placed in a role:"tool" message —
 * it NEVER throws, so a single failing tool call can never crash the chat turn.
 */
export class AcademicToolsService {
  constructor(
    private readonly programRepo: ProgramRepository,
    private readonly enrollmentPolicyRepo: EnrollmentPolicyRepository,
    private readonly curriculumRepo: CurriculumVersionRepository,
  ) {}

  /** Dispatches a tool call by name. Returns the JSON string to send back as the tool result. */
  async execute(toolName: string, rawArguments: string): Promise<string> {
    switch (toolName) {
      case TOOL_NAMES.OBTENER_COSTO_CARRERA:
        return this.obtenerCostoCarrera(rawArguments);
      case TOOL_NAMES.OBTENER_INFORMACION_CARRERA:
        return this.obtenerInformacionCarrera(rawArguments);
      default:
        logger.warn('[AcademicTools] Unknown tool requested by the model', { toolName });
        return JSON.stringify({
          ok: false,
          error: 'UNKNOWN_TOOL',
          mensaje: `La herramienta "${toolName}" no existe en este sistema.`,
        });
    }
  }

  private parseArgs(rawArguments: string): ToolArgs {
    try {
      const parsed = JSON.parse(rawArguments) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as ToolArgs) : {};
    } catch {
      return {};
    }
  }

  private extractCareerName(rawArguments: string): string | null {
    const { nombre_carrera } = this.parseArgs(rawArguments);
    return typeof nombre_carrera === 'string' && nombre_carrera.trim() ? nombre_carrera.trim() : null;
  }

  /** Resolves free-text career name → concrete Program. Throws on DB failure so callers can distinguish it. */
  private async resolveProgram(nombreCarrera: string): Promise<Program | null> {
    const matches = await this.programRepo.findByNameContains(nombreCarrera);
    if (matches.length === 0) return null;

    const exact = matches.find((p) => p.name.toLowerCase() === nombreCarrera.toLowerCase());
    return exact ?? matches[0]!;
  }

  async obtenerCostoCarrera(rawArguments: string): Promise<string> {
    const nombreCarrera = this.extractCareerName(rawArguments);
    if (!nombreCarrera) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Falta el nombre de la carrera para consultar el costo.',
      });
    }

    let program: Program | null;
    try {
      program = await this.resolveProgram(nombreCarrera);
    } catch (err) {
      logger.error('[AcademicTools] obtener_costo_carrera — Mongo lookup failed (Program)', {
        nombreCarrera,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('program_lookup');
    }

    if (!program) {
      return careerNotFoundPayload(nombreCarrera);
    }

    let policy: EnrollmentPolicySummary | null;
    try {
      policy = await this.enrollmentPolicyRepo.findActiveByCareerId(program.id);
    } catch (err) {
      logger.error('[AcademicTools] obtener_costo_carrera — Mongo lookup failed (EnrollmentPolicy)', {
        careerId: program.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('enrollment_policy_lookup');
    }

    if (!policy) {
      return JSON.stringify({
        ok: true,
        encontrado: false,
        carrera: program.name,
        mensaje:
          'La carrera existe pero no tiene una política de costos activa registrada en la base de datos. ' +
          'No inventes un monto; indica que un asesor confirmará el costo vigente.',
      });
    }

    return JSON.stringify({
      ok: true,
      encontrado: true,
      carrera: program.name,
      periodo: policy.period,
      moneda: policy.currency,
      costoInscripcion: policy.inscriptionFee,
      costoMatricula: policy.enrollmentFee,
      pensionMensual: policy.monthlyFee,
      numeroCuotas: policy.numberOfInstallments,
      opcionesPago: policy.paymentOptions,
    });
  }

  async obtenerInformacionCarrera(rawArguments: string): Promise<string> {
    const nombreCarrera = this.extractCareerName(rawArguments);
    if (!nombreCarrera) {
      return JSON.stringify({
        ok: false,
        error: 'MISSING_ARGUMENT',
        mensaje: 'Falta el nombre de la carrera para consultar su información.',
      });
    }

    let program: Program | null;
    try {
      program = await this.resolveProgram(nombreCarrera);
    } catch (err) {
      logger.error('[AcademicTools] obtener_informacion_carrera — Mongo lookup failed (Program)', {
        nombreCarrera,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('program_lookup');
    }

    if (!program) {
      return careerNotFoundPayload(nombreCarrera);
    }

    let curriculum: CurriculumVersionSummary | null;
    let policies: EnrollmentPolicySummary[];
    try {
      [curriculum, policies] = await Promise.all([
        this.curriculumRepo.findActiveByCareerId(program.id),
        this.enrollmentPolicyRepo.findAllActiveByCareerId(program.id),
      ]);
    } catch (err) {
      logger.error('[AcademicTools] obtener_informacion_carrera — Mongo lookup failed (Curriculum/Policy)', {
        careerId: program.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return dbErrorPayload('curriculum_or_policy_lookup');
    }

    const fechasEnrolamiento = formatEnrollmentDatesForTool(policies);

    return JSON.stringify({
      ok: true,
      encontrado: true,
      carrera: program.name,
      duracion: program.duration,
      gradoAcademico: program.academicDegree,
      tituloProfesional: program.professionalTitle,
      modalidades: program.modalities.map((m) => ({
        tipoCarrera: m.careerType,
        modalidades: m.modalities,
      })),
      requisitosAdmision: program.admissionRequirements,
      whatsappAdmision: program.whatsappContact,
      brochureUrl: program.brochureUrl,
      periodoVigente: policies[0]?.period ?? null,
      fechasEnrolamiento,
      mensajeFechas: fechasEnrolamiento.length
        ? undefined
        : 'No hay fechas de enrolamiento activas registradas para esta carrera en la base de datos; ' +
          'no inventes fechas de examen, inscripción ni inicio de clases.',
      mallaCurricular: curriculum
        ? {
            version: curriculum.version,
            totalCreditos: curriculum.totalCredits,
            ciclos: curriculum.cicle,
            urlMallaCompleta: curriculum.curriculumUrl,
          }
        : null,
      mensajeMalla: curriculum
        ? undefined
        : 'No hay una malla curricular activa registrada para esta carrera en la base de datos; ' +
          'no inventes cursos, indica que un asesor puede compartir el detalle completo.',
    });
  }
}
