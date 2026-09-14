/**
 * Academic program classification used for filtering and display.
 */
export enum ProgramType {
  PREGRADO = 'PREGRADO',
  CAREERS_FOR_WORKERS = 'CAREERS_FOR_WORKERS',
  MAESTRIA = 'MAESTRIA',
  DOCTORADO = 'DOCTORADO',
  ESPECIALIZACION = 'ESPECIALIZACION',
  DIPLOMADO = 'DIPLOMADO',
  TECNOLOGO = 'TECNOLOGO',
  TECNICO = 'TECNICO',
}

export const PROGRAM_TYPE_LABELS: Record<ProgramType, string> = {
  [ProgramType.PREGRADO]: 'Undergraduate',
  [ProgramType.CAREERS_FOR_WORKERS]: 'Careers for workers',
  [ProgramType.MAESTRIA]: "Master's degree",
  [ProgramType.DOCTORADO]: 'Doctorate',
  [ProgramType.ESPECIALIZACION]: 'Specialization',
  [ProgramType.DIPLOMADO]: 'Diploma',
  [ProgramType.TECNOLOGO]: 'Technologist',
  [ProgramType.TECNICO]: 'Technical',
};
