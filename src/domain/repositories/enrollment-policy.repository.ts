export interface PaymentOptionSummary {
  id: string;
  currency: string;
  enrollmentFee: number;
  monthlyFee: number;
  numberOfInstallments: number;
  inscriptionFee: number;
  totalCost: number;
  simpleCost: number;
  totalWithDiscount: number;
  discount: number;
}

export interface EnrollmentDateSummary {
  type: string;
  date: Date;
}

/** Flat, read-only projection of an active enrollment/cost policy for a career. */
export interface EnrollmentPolicySummary {
  careerId: string;
  period: string;
  careerType: string;
  currency: string;
  inscriptionFee: number;
  enrollmentFee: number;
  monthlyFee: number;
  numberOfInstallments: number;
  description: string;
  paymentOptions: PaymentOptionSummary[];
  dates: EnrollmentDateSummary[];
}

/**
 * Read-only persistence port for career cost/enrollment policies.
 * This is the ONLY source of truth the chatbot may use to answer cost and enrollment date questions.
 */
export interface EnrollmentPolicyRepository {
  /** Returns the most recently updated active policy for a career, or null if none exists. */
  findActiveByCareerId(careerId: string): Promise<EnrollmentPolicySummary | null>;
  /** Returns all active policies for a career (e.g. PREGRADO + PUEDE). */
  findAllActiveByCareerId(careerId: string): Promise<EnrollmentPolicySummary[]>;
  findActiveByCareerIds(careerIds: string[]): Promise<Map<string, EnrollmentPolicySummary | null>>;
  findAllActiveByCareerIds(careerIds: string[]): Promise<Map<string, EnrollmentPolicySummary[]>>;
}
