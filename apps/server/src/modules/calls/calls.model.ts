import { Schema, model, type Document } from 'mongoose';

export type CallType = 'audio' | 'video';
export type CallMode = 'p2p' | 'sfu';
export type CallSessionStatus = 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
export type CallParticipantRole = 'caller' | 'callee' | 'participant';
export type CallParticipantStatus = 'invited' | 'joined' | 'rejected' | 'busy' | 'left' | 'missed';

export interface ICallSession extends Document {
  conversationId?: string;
  callType: CallType;
  mode: CallMode;
  status: CallSessionStatus;
  initiatedBy: string;
  participantIds: string[];
  timeoutAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  endedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICallParticipant extends Document {
  sessionId: string;
  userId: string;
  role: CallParticipantRole;
  status: CallParticipantStatus;
  joinedAt?: Date;
  leftAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICallEvent extends Document {
  sessionId: string;
  actorUserId?: string;
  type: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserCallState extends Document {
  userId: string;
  activeCallSessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const callSessionSchema = new Schema<ICallSession>(
  {
    conversationId: { type: String },
    callType: { type: String, enum: ['audio', 'video'], default: 'video', required: true },
    mode: { type: String, enum: ['p2p', 'sfu'], default: 'p2p', required: true },
    status: {
      type: String,
      enum: ['ringing', 'connecting', 'connected', 'ended', 'missed', 'rejected'],
      required: true,
      default: 'ringing',
    },
    initiatedBy: { type: String, required: true },
    participantIds: [{ type: String, required: true }],
    timeoutAt: { type: Date },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number },
    endedReason: { type: String },
  },
  { timestamps: true },
);

callSessionSchema.index({ initiatedBy: 1, createdAt: -1 });
callSessionSchema.index({ participantIds: 1, status: 1, createdAt: -1 });
callSessionSchema.index({ conversationId: 1, createdAt: -1 });

const callParticipantSchema = new Schema<ICallParticipant>(
  {
    sessionId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: ['caller', 'callee', 'participant'], required: true },
    status: {
      type: String,
      enum: ['invited', 'joined', 'rejected', 'busy', 'left', 'missed'],
      required: true,
      default: 'invited',
    },
    joinedAt: { type: Date },
    leftAt: { type: Date },
  },
  { timestamps: true },
);

callParticipantSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
callParticipantSchema.index({ userId: 1, status: 1, updatedAt: -1 });

const callEventSchema = new Schema<ICallEvent>(
  {
    sessionId: { type: String, required: true },
    actorUserId: { type: String },
    type: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

callEventSchema.index({ sessionId: 1, createdAt: -1 });

const userCallStateSchema = new Schema<IUserCallState>(
  {
    userId: { type: String, required: true, unique: true },
    activeCallSessionId: { type: String },
  },
  { timestamps: true },
);

userCallStateSchema.index({ activeCallSessionId: 1 });

export const CallSessionModel = model<ICallSession>('CallSession', callSessionSchema);
export const CallParticipantModel = model<ICallParticipant>('CallParticipant', callParticipantSchema);
export const CallEventModel = model<ICallEvent>('CallEvent', callEventSchema);
export const UserCallStateModel = model<IUserCallState>('UserCallState', userCallStateSchema);
