import {
  IsString,
  IsDate,
  IsEmail,
  IsArray,
  IsEnum,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsMongoId,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type, Exclude, Expose } from 'class-transformer';
import { MeetingStatus } from '../schemas/meeting.schema';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActionItemDto {
  @ApiProperty({ description: 'Task description' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  task: string;

  @ApiProperty({ description: 'Owner of the task' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  owner: string;

  @ApiProperty({ description: 'Due date in ISO format' })
  @IsString()
  dueDate: string;

  @ApiPropertyOptional({ description: 'Completion status', default: false })
  @IsBoolean()
  @IsOptional()
  completed?: boolean = false;
}

export class ParticipantDto {
  @ApiProperty({ description: 'Participant name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Participant email' })
  @IsEmail()
  email: string;
}

export class CreateMeetingDto {
  @ApiProperty({ description: 'Meeting title' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Meeting start time', type: Date })
  @Type(() => Date)
  @IsDate()
  startTime: Date;

  @ApiProperty({ description: 'Meeting end time', type: Date })
  @Type(() => Date)
  @IsDate()
  endTime: Date;

  @ApiProperty({ description: 'Microsoft Graph event ID' })
  @IsString()
  @MinLength(1)
  microsoftEventId: string;

  @ApiPropertyOptional({ description: 'Meeting participants', type: [ParticipantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  @IsOptional()
  participants?: ParticipantDto[] = [];

  @ApiPropertyOptional({ description: 'Meeting transcript' })
  @IsString()
  @IsOptional()
  transcript?: string;
}

export class UpdateMeetingDto {
  @ApiPropertyOptional({ description: 'Meeting title' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Meeting start time', type: Date })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startTime?: Date;

  @ApiPropertyOptional({ description: 'Meeting end time', type: Date })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endTime?: Date;

  @ApiPropertyOptional({ description: 'Meeting participants', type: [ParticipantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  @IsOptional()
  participants?: ParticipantDto[];

  @ApiPropertyOptional({ description: 'Meeting transcript' })
  @IsString()
  @IsOptional()
  transcript?: string;
}

export class ProcessMeetingDto {
  @ApiPropertyOptional({ description: 'Meeting ID to process (optional — taken from URL param)' })
  @IsMongoId()
  @IsOptional()
  meetingId?: string;

  @ApiPropertyOptional({ description: 'Transcript to process' })
  @IsString()
  @IsOptional()
  transcript?: string;
}

export class ActionItemResponseDto {
  @ApiProperty()
  task: string;

  @ApiProperty()
  owner: string;

  @ApiProperty()
  dueDate: string;

  @ApiProperty()
  completed: boolean;
}

export class MeetingResponseDto {
  @ApiProperty()
  @Expose({ name: '_id' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: Date })
  startTime: Date;

  @ApiProperty({ type: Date })
  endTime: Date;

  @ApiProperty()
  microsoftEventId: string;

  @ApiProperty()
  organizerId: string;

  @ApiProperty({ type: [ParticipantDto] })
  participants: ParticipantDto[];

  @ApiPropertyOptional()
  transcript?: string;

  @ApiPropertyOptional()
  translatedTranscript?: string | null;

  @ApiPropertyOptional()
  summary?: string;

  @ApiProperty({ type: [ActionItemResponseDto] })
  actionItems: ActionItemResponseDto[];

  @ApiProperty({ type: [String] })
  decisions: string[];

  @ApiProperty({ type: [String] })
  nextSteps: string[];

  @ApiProperty({ enum: MeetingStatus })
  status: MeetingStatus;

  @ApiPropertyOptional({ type: Date })
  processedAt?: Date;

  @ApiPropertyOptional()
  recordingMeta?: {
    organizerId: string;
    onlineMeetingId: string;
    recordingId: string;
  } | null;

  @ApiPropertyOptional()
  productivity?: {
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

  @ApiPropertyOptional()
  transcriptFetchStatus?: string;

  @ApiPropertyOptional()
  transcriptFetchError?: string | null;

  @ApiPropertyOptional({ type: Date })
  lastTranscriptFetchAt?: Date | null;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;
}

export class MeetingListResponseDto {
  @ApiProperty({ type: [MeetingResponseDto] })
  data: MeetingResponseDto[];

  @ApiProperty({ description: 'Total number of meetings' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  pages: number;
}

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Search query' })
  @IsString()
  @IsOptional()
  search?: string;
}
