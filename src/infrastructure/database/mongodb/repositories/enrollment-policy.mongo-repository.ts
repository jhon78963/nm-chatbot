import type {
  EnrollmentPolicyRepository,
  EnrollmentPolicySummary,
} from '../../../../domain/repositories/enrollment-policy.repository.js';
import { EnrollmentPolicyModel } from '../models/enrollment-policy.model.js';

function toSummary(doc: {
  careerId: string;
  period: string;
  careerType: string;
  inscriptionFee: number;
  enrollmentFee: number;
  monthlyFee: number;
  numberOfInstallments: number;
  description: string;
  paymentOptions: Array<{
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
  }>;
  dates: Array<{ type: string; date: Date }>;
}): EnrollmentPolicySummary {
  return {
    careerId: doc.careerId,
    period: doc.period,
    careerType: doc.careerType,
    currency: doc.paymentOptions[0]?.currency ?? 'PEN',
    inscriptionFee: doc.inscriptionFee,
    enrollmentFee: doc.enrollmentFee,
    monthlyFee: doc.monthlyFee,
    numberOfInstallments: doc.numberOfInstallments,
    description: doc.description,
    paymentOptions: doc.paymentOptions.map((p) => ({
      id: p.id,
      currency: p.currency,
      enrollmentFee: p.enrollmentFee,
      monthlyFee: p.monthlyFee,
      numberOfInstallments: p.numberOfInstallments,
      inscriptionFee: p.inscriptionFee,
      totalCost: p.totalCost,
      simpleCost: p.simpleCost,
      totalWithDiscount: p.totalWithDiscount,
      discount: p.discount,
    })),
    dates: doc.dates.map((entry) => ({
      type: entry.type,
      date: entry.date,
    })),
  };
}

export class EnrollmentPolicyMongoRepository implements EnrollmentPolicyRepository {
  async findActiveByCareerId(careerId: string): Promise<EnrollmentPolicySummary | null> {
    const doc = await EnrollmentPolicyModel.findOne({ careerId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    return doc ? toSummary(doc) : null;
  }

  async findAllActiveByCareerId(careerId: string): Promise<EnrollmentPolicySummary[]> {
    const docs = await EnrollmentPolicyModel.find({ careerId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    return docs.map((doc) => toSummary(doc));
  }

  async findActiveByCareerIds(careerIds: string[]): Promise<Map<string, EnrollmentPolicySummary | null>> {
    const uniqueIds = [...new Set(careerIds.filter(Boolean))];
    const result = new Map<string, EnrollmentPolicySummary | null>();
    if (uniqueIds.length === 0) return result;

    const docs = await EnrollmentPolicyModel.find({
      careerId: { $in: uniqueIds },
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    for (const id of uniqueIds) {
      result.set(id, null);
    }

    for (const doc of docs) {
      if (result.get(doc.careerId) === null) {
        result.set(doc.careerId, toSummary(doc));
      }
    }

    return result;
  }

  async findAllActiveByCareerIds(careerIds: string[]): Promise<Map<string, EnrollmentPolicySummary[]>> {
    const uniqueIds = [...new Set(careerIds.filter(Boolean))];
    const result = new Map<string, EnrollmentPolicySummary[]>();
    if (uniqueIds.length === 0) return result;

    const docs = await EnrollmentPolicyModel.find({
      careerId: { $in: uniqueIds },
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    for (const id of uniqueIds) {
      result.set(id, []);
    }

    for (const doc of docs) {
      const list = result.get(doc.careerId) ?? [];
      list.push(toSummary(doc));
      result.set(doc.careerId, list);
    }

    return result;
  }
}
