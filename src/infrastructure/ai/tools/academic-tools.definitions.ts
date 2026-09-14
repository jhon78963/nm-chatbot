import type { ToolDefinition } from '../../../application/ports/ai-provider.port.js';

export const TOOL_NAMES = {
  OBTENER_COSTO_CARRERA: 'obtener_costo_carrera',
  OBTENER_INFORMACION_CARRERA: 'obtener_informacion_carrera',
} as const;

const NOMBRE_CARRERA_PARAM = {
  type: 'object',
  properties: {
    nombre_carrera: {
      type: 'string',
      description:
        'Nombre de la carrera o programa académico tal como lo menciona el usuario, ' +
        'por ejemplo "Ingeniería de Sistemas" o "Derecho". No es necesario que sea exacto.',
    },
  },
  required: ['nombre_carrera'],
} as const;

/**
 * Returns hard cost data (inscripción, matrícula, pensión, cuotas) for a career.
 * MUST be called instead of guessing any monetary figure.
 */
export const OBTENER_COSTO_CARRERA_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.OBTENER_COSTO_CARRERA,
    description:
      'Consulta en la base de datos oficial de la universidad los costos vigentes de una carrera: ' +
      'costo de inscripción, costo de matrícula, pensión/cuota mensual, número de cuotas y costo total. ' +
      'Debes usar esta herramienta SIEMPRE que el usuario pregunte cuánto cuesta, el precio, la inversión, ' +
      'la pensión o las cuotas de una carrera específica. Nunca respondas un monto sin haber llamado a esta herramienta.',
    parameters: NOMBRE_CARRERA_PARAM,
  },
};

/**
 * Returns career metadata (duration, modalities, curriculum/malla, admission requirements, contact).
 * MUST be called instead of guessing curriculum content or vacancy availability.
 */
export const OBTENER_INFORMACION_CARRERA_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.OBTENER_INFORMACION_CARRERA,
    description:
      'Consulta en la base de datos oficial de la universidad la información detallada de una carrera: ' +
      'duración, modalidades disponibles, malla curricular (ciclos y cursos con créditos), grado académico, ' +
      'título profesional, requisitos de admisión, fechas de enrolamiento (inscripción, examen de admisión, ' +
      'inicio de clases, cierre de admisiones) y contacto de WhatsApp de admisión. ' +
      'Debes usar esta herramienta SIEMPRE que el usuario pregunte por la malla curricular, cursos, duración exacta, ' +
      'modalidad, requisitos, fechas, examen de admisión, inicio de clases o vacantes de una carrera específica. ' +
      'Nunca inventes esta información.',
    parameters: NOMBRE_CARRERA_PARAM,
  },
};

export const ACADEMIC_TOOLS: ToolDefinition[] = [
  OBTENER_COSTO_CARRERA_TOOL,
  OBTENER_INFORMACION_CARRERA_TOOL,
];
