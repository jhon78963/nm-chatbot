import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export type AgentStatus = 'Active' | 'Inactive';
export type AgentRole = 'agent' | 'admin';

export interface IAgentDocument {
  _id: Types.ObjectId;
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  status: AgentStatus;
  userId: string;
  username: string | null;
  passwordHash: string | null;
  lastLoginAt: Date | null;
  role: AgentRole;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentDocument = HydratedDocument<IAgentDocument>;

const agentSchema = new Schema<IAgentDocument>(
  {
    id: {
      type: String,
      required: [true, 'Agent id is required'],
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Email format is invalid',
      },
    },
    whatsapp: {
      type: String,
      required: [true, 'WhatsApp number is required'],
      trim: true,
      validate: {
        validator: (v: string) => /^\+[1-9]\d{7,14}$/.test(v),
        message: 'WhatsApp number must be in E.164 format',
      },
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      required: [true, 'Status is required'],
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'userId is required'],
      index: true,
    },
    username: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['agent', 'admin'] satisfies AgentRole[],
      default: 'agent',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'agents',
  },
);

export const AgentModel = model<IAgentDocument>('Agent', agentSchema);
