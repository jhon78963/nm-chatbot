/**
 * Delivery mode for academic programs.
 */
export enum Modality {
  ONSITE = 'ONSITE',
  VIRTUAL = 'VIRTUAL',
  HIBRYD = 'HIBRYD',
}

export const MODALITY_LABELS: Record<Modality, string> = {
  [Modality.ONSITE]: 'On-site',
  [Modality.VIRTUAL]: 'Virtual',
  [Modality.HIBRYD]: 'Hybrid',
};
