import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Exclude } from 'class-transformer';

export type MeetingDocument = Meeting &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

export enum MeetingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ timestamps: true })
export class Meeting {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ required: true, unique: true, sparse: true })
  microsoftEventId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  organizerId: Types.ObjectId;

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        email: { type: String, required: true },
      },
    ],
    default: [],
  })
  participants: Array<{
    name: string;
    email: string;
  }>;

  @Prop({ default: null })
  transcript: string;

  @Prop({ default: null })
  summary: string;

  @Prop({
    type: [
      {
        task: { type: String, required: true },
        owner: { type: String, required: true },
        dueDate: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
    default: [],
  })
  actionItems: Array<{
    task: string;
    owner: string;
    dueDate: string;
    completed: boolean;
  }>;

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ type: [String], default: [] })
  nextSteps: string[];

  @Prop({ default: null })
  onlineMeetingUrl: string;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ default: null })
  location: string;

  @Prop({
    type: String,
    enum: MeetingStatus,
    default: MeetingStatus.PENDING,
  })
  status: MeetingStatus;

  @Prop({ default: null })
  processedAt: Date;

  @Prop({ default: null })
  errorMessage: string;

  @Prop({
    type: {
      organizerId: { type: String },
      onlineMeetingId: { type: String },
      recordingId: { type: String },
    },
    default: null,
  })
  recordingMeta: {
    organizerId: string;
    onlineMeetingId: string;
    recordingId: string;
  } | null;

  @Prop({ default: null })
  translatedTranscript: string;

  @Prop({
    type: {
      score: { type: Number },
      label: { type: String },
      breakdown: {
        type: {
          onTopicScore: { type: Number },
          decisionsScore: { type: Number },
          actionItemsScore: { type: Number },
          participationScore: { type: Number },
          timeEfficiency: { type: Number },
        },
      },
      highlights: { type: [String], default: [] },
      improvements: { type: [String], default: [] },
    },
    default: null,
  })
  productivity: {
    score: number;
    label: string;
    breakdown: {
      onTopicScore: number;
      decisionsScore: number;
      actionItemsScore: number;
      participationScore: number;
      timeEfficiency: number;
    };
    highlights: string[];
    improvements: string[];
  } | null;

  @Prop({ default: false })
  emailSent: boolean;

  @Prop({
    type: String,
    enum: ['idle', 'fetching', 'transcribing', 'done', 'failed'],
    default: 'idle',
  })
  transcriptFetchStatus: string;

  @Prop({ default: null })
  transcriptFetchError: string;

  @Prop({ default: null })
  lastTranscriptFetchAt: Date;

  @Exclude()
  __v: number;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);

MeetingSchema.index({ organizerId: 1, createdAt: -1 });
MeetingSchema.index({ title: 'text', summary: 'text' });
MeetingSchema.index({ microsoftEventId: 1 });
MeetingSchema.index({ status: 1, emailSent: 1 });
