import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface EnrollmentDateEntry {
  type: string;
  date: Date;
}

export interface PaymentOptionEntry {
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

export interface IEnrollmentPolicyDocument {
  _id: Types.ObjectId;
  id: string;
  careerId: string;
  period: string;
  enrollmentFee: number;
  monthlyFee: number;
  numberOfInstallments: number;
  inscriptionFee: number;
  description: string;
  dates: EnrollmentDateEntry[];
  careerType: string;
  schedule: unknown[];
  paymentOptions: PaymentOptionEntry[];
  isActive: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentPolicyDocument = HydratedDocument<IEnrollmentPolicyDocument>;

const enrollmentDateSchema = new Schema<EnrollmentDateEntry>(
  {
    type: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
  },
  { _id: false },
);

const paymentOptionSchema = new Schema<PaymentOptionEntry>(
  {
    id: { type: String, required: true },
    currency: { type: String, required: true, trim: true },
    enrollmentFee: { type: Number, default: 0 },
    monthlyFee: { type: Number, default: 0 },
    numberOfInstallments: { type: Number, default: 0 },
    inscriptionFee: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    simpleCost: { type: Number, default: 0 },
    totalWithDiscount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
  },
  { _id: false },
);

const enrollmentPolicySchema = new Schema<IEnrollmentPolicyDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    careerId: { type: String, required: true, index: true },
    period: { type: String, required: true, trim: true, index: true },
    enrollmentFee: { type: Number, default: 0 },
    monthlyFee: { type: Number, default: 0 },
    numberOfInstallments: { type: Number, default: 0 },
    inscriptionFee: { type: Number, default: 0 },
    description: { type: String, trim: true, default: '' },
    dates: { type: [enrollmentDateSchema], default: [] },
    careerType: { type: String, required: true, trim: true, index: true },
    schedule: { type: [Schema.Types.Mixed], default: [] },
    paymentOptions: { type: [paymentOptionSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    userId: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'enrollment_policies',
  },
);

enrollmentPolicySchema.index({ careerId: 1, careerType: 1, period: 1 });

export const EnrollmentPolicyModel = model<IEnrollmentPolicyDocument>(
  'EnrollmentPolicy',
  enrollmentPolicySchema,
);
