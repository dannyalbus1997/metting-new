import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Meeting, MeetingDocument, MeetingStatus } from './schemas/meeting.schema';
import {
  CreateMeetingDto,
  UpdateMeetingDto,
  ProcessMeetingDto,
  MeetingResponseDto,
  MeetingListResponseDto,
  PaginationQueryDto,
} from './dto/meeting.dto';

interface IAiService {
  processTranscript(transcript: string): Promise<{
    summary: string;
    actionItems: Array<{
      task: string;
      owner: string;
      dueDate: string;
    }>;
    decisions: string[];
    nextSteps: string[];
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
    };
  }>;
  translateTranscript(transcript: string, targetLanguage: string): Promise<string>;
}

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    @Inject('AI_SERVICE')
    private readonly aiService: IAiService,
  ) {}

  async findAllByUser(
    userId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<MeetingListResponseDto> {
    const { page = 1, limit = 10, search } = paginationQuery;
    const skip = (page - 1) * limit;

    try {
      const query = this.meetingModel.find({ organizerId: new Types.ObjectId(userId) });

      if (search) {
        query.find({
          $or: [
            { title: { $regex: search, $options: 'i' } },
            { summary: { $regex: search, $options: 'i' } },
          ],
        });
      }

      const total = await this.meetingModel.countDocuments(query.getFilter());
      const data = await query
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean()
        .exec();

      const pages = Math.ceil(total / limit);

      return {
        data: data as unknown as MeetingResponseDto[],
        total,
        page,
        limit,
        pages,
      };
    } catch (error: any) {
      this.logger.error(`Error finding meetings for user ${userId}:`, error);
      throw new BadRequestException('Failed to retrieve meetings');
    }
  }

  async findById(id: string, userId?: string): Promise<MeetingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    try {
      const meeting = await this.meetingModel
        .findById(id)
        .select('-__v')
        .lean()
        .exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      if (userId && meeting.organizerId?.toString() !== userId?.toString()) {
        this.logger.warn(
          `findById ownership mismatch: meeting ${id} organizerId=${meeting.organizerId}, userId=${userId}`,
        );
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      return meeting as unknown as MeetingResponseDto;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error finding meeting ${id}:`, error);
      throw new BadRequestException('Failed to retrieve meeting');
    }
  }

  async create(
    userId: string,
    createMeetingDto: CreateMeetingDto,
  ): Promise<MeetingResponseDto> {
    if (new Date(createMeetingDto.endTime) <= new Date(createMeetingDto.startTime)) {
      throw new BadRequestException('End time must be after start time');
    }

    try {
      const meeting = new this.meetingModel({
        ...createMeetingDto,
        organizerId: new Types.ObjectId(userId),
        status: MeetingStatus.PENDING,
      });

      const savedMeeting = await meeting.save();
      return this.mapToResponseDto(savedMeeting);
    } catch (error: any) {
      if (error.code === 11000) {
        throw new BadRequestException('A meeting with this Microsoft event ID already exists');
      }
      this.logger.error(`Error creating meeting for user ${userId}:`, error);
      throw new BadRequestException('Failed to create meeting');
    }
  }

  async update(
    id: string,
    userId: string,
    updateMeetingDto: UpdateMeetingDto,
  ): Promise<MeetingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    if (
      updateMeetingDto.startTime &&
      updateMeetingDto.endTime &&
      new Date(updateMeetingDto.endTime) <= new Date(updateMeetingDto.startTime)
    ) {
      throw new BadRequestException('End time must be after start time');
    }

    try {
      const meeting = await this.meetingModel.findById(id).exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      if (meeting.organizerId.toString() !== userId) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      Object.assign(meeting, updateMeetingDto);
      const updatedMeeting = await meeting.save();

      return this.mapToResponseDto(updatedMeeting);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error updating meeting ${id}:`, error);
      throw new BadRequestException('Failed to update meeting');
    }
  }

  /**
   * Update transcript for a meeting (internal use — no user auth check)
   */
  async updateTranscript(meetingId: string, transcript: string): Promise<void> {
    if (!Types.ObjectId.isValid(meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }
    const result = await this.meetingModel.findByIdAndUpdate(
      meetingId,
      { $set: { transcript } },
    ).exec();
    if (!result) {
      throw new NotFoundException(`Meeting with ID ${meetingId} not found`);
    }
  }

  async updateWithAiResults(
    id: string,
    userId: string,
    aiResults: {
      summary: string;
      actionItems: Array<{
        task: string;
        owner: string;
        dueDate: string;
        completed: boolean;
      }>;
      decisions: string[];
      nextSteps: string[];
    },
  ): Promise<MeetingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    try {
      const meeting = await this.meetingModel.findById(id).exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      const meetingOrgId = meeting.organizerId?.toString() || '';
      const requestUserId = userId?.toString() || '';
      if (meetingOrgId !== requestUserId) {
        this.logger.warn(
          `Ownership mismatch for meeting ${id}: organizerId=${meetingOrgId}, userId=${requestUserId}`,
        );
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      meeting.summary = aiResults.summary;
      meeting.actionItems = aiResults.actionItems;
      meeting.decisions = aiResults.decisions;
      meeting.nextSteps = aiResults.nextSteps;
      meeting.status = MeetingStatus.COMPLETED;
      meeting.processedAt = new Date();

      const updatedMeeting = await meeting.save();
      return this.mapToResponseDto(updatedMeeting);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating meeting ${id} with AI results:`, error);
      throw new BadRequestException('Failed to update meeting with AI results');
    }
  }

  /**
   * Update meeting with AI results — internal use only (no user ownership check).
   * Used by the bot controller after automatic AI processing.
   */
  async updateAiResultsInternal(
    id: string,
    aiResults: {
      summary: string;
      actionItems: Array<{
        task: string;
        owner: string;
        dueDate: string;
        completed: boolean;
      }>;
      decisions: string[];
      nextSteps: string[];
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
      };
      translatedTranscript?: string | null;
    },
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    const setFields: Record<string, any> = {
      summary: aiResults.summary,
      actionItems: aiResults.actionItems,
      decisions: aiResults.decisions,
      nextSteps: aiResults.nextSteps,
      status: MeetingStatus.COMPLETED,
      processedAt: new Date(),
    };
    if (aiResults.productivity) {
      setFields.productivity = aiResults.productivity;
    }
    if (aiResults.translatedTranscript) {
      setFields.translatedTranscript = aiResults.translatedTranscript;
    }

    const result = await this.meetingModel.findByIdAndUpdate(
      id,
      { $set: setFields },
      { new: true },
    ).exec();

    if (!result) {
      throw new NotFoundException(`Meeting with ID ${id} not found`);
    }

    this.logger.log(`AI results saved for meeting ${id} (productivity: ${aiResults.productivity?.score ?? 'N/A'}%, translated: ${aiResults.translatedTranscript ? 'yes' : 'no'})`);
  }

  /**
   * Save Graph API recording metadata so we can stream on demand later.
   * No actual file is stored — just the IDs needed to re-fetch from Graph.
   */
  async updateRecordingMeta(
    meetingId: string,
    meta: { organizerId: string; onlineMeetingId: string; recordingId: string },
  ): Promise<void> {
    const result = await this.meetingModel.findByIdAndUpdate(
      meetingId,
      { $set: { recordingMeta: meta } },
    ).exec();
    if (!result) {
      this.logger.warn(`Cannot save recording meta — meeting ${meetingId} not found`);
      return;
    }
    this.logger.log(`Recording meta saved for meeting ${meetingId}`);
  }

  /**
   * Get recording metadata for a meeting.
   */
  async getRecordingMeta(
    meetingId: string,
  ): Promise<{ organizerId: string; onlineMeetingId: string; recordingId: string } | null> {
    const meeting = await this.meetingModel.findById(meetingId).exec();
    return meeting?.recordingMeta || null;
  }

  async processMeeting(
    userId: string,
    processMeetingDto: ProcessMeetingDto,
  ): Promise<MeetingResponseDto> {
    const { meetingId, transcript } = processMeetingDto;

    if (!meetingId || !Types.ObjectId.isValid(meetingId)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    try {
      const meeting = await this.meetingModel.findById(meetingId).exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${meetingId} not found`);
      }

      // Ownership check: compare as strings, handling both ObjectId and plain string formats
      const meetingOrgId = meeting.organizerId?.toString() || '';
      const requestUserId = userId?.toString() || '';
      if (meetingOrgId !== requestUserId) {
        this.logger.warn(
          `Ownership mismatch for meeting ${meetingId}: organizerId=${meetingOrgId}, userId=${requestUserId}`,
        );
        throw new NotFoundException(`Meeting with ID ${meetingId} not found`);
      }

      const transcriptToProcess = transcript || meeting.transcript;

      if (!transcriptToProcess) {
        throw new BadRequestException('No transcript provided for processing');
      }

      meeting.status = MeetingStatus.PROCESSING;
      await meeting.save();

      try {
        // Run AI analysis and translation in parallel
        const [aiResults, translatedTranscript] = await Promise.all([
          this.aiService.processTranscript(transcriptToProcess),
          this.aiService.translateTranscript(transcriptToProcess, 'English').catch((err) => {
            this.logger.warn(`Auto-translation failed for meeting ${meetingId}: ${err.message}`);
            return null;
          }),
        ]);

        // Use atomic findOneAndUpdate to avoid VersionError from concurrent modifications
        const updateData: Record<string, any> = {
          summary: aiResults.summary,
          actionItems: aiResults.actionItems.map((item) => ({
            ...item,
            completed: false,
          })),
          decisions: aiResults.decisions,
          nextSteps: aiResults.nextSteps,
          status: MeetingStatus.COMPLETED,
          processedAt: new Date(),
          $unset: { errorMessage: 1 },
        };
        if (aiResults.productivity) {
          updateData.productivity = aiResults.productivity;
        }
        if (translatedTranscript) {
          updateData.translatedTranscript = translatedTranscript;
        }

        const { $unset, ...setFields } = updateData;
        const updatedMeeting = await this.meetingModel.findByIdAndUpdate(
          meetingId,
          { $set: setFields, $unset: $unset || {} },
          { new: true },
        ).exec();

        this.logger.log(`Successfully processed meeting ${meetingId} (productivity: ${aiResults.productivity?.score ?? 'N/A'}%)`);

        return this.mapToResponseDto(updatedMeeting!);
      } catch (aiError: any) {
        this.logger.error(`AI processing failed for meeting ${meetingId}:`, aiError);
        // Use atomic update for error status too
        await this.meetingModel.findByIdAndUpdate(meetingId, {
          $set: {
            status: MeetingStatus.FAILED,
            errorMessage: aiError.message || 'AI processing failed',
          },
        }).exec();

        throw new BadRequestException(
          `Failed to process meeting: ${aiError.message || 'Unknown error'}`,
        );
      }
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error processing meeting ${meetingId}:`, error);
      throw new BadRequestException('Failed to process meeting');
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    try {
      const meeting = await this.meetingModel.findById(id).exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      if (meeting.organizerId.toString() !== userId) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      await this.meetingModel.findByIdAndDelete(id).exec();
      this.logger.log(`Deleted meeting ${id} for user ${userId}`);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting meeting ${id}:`, error);
      throw new BadRequestException('Failed to delete meeting');
    }
  }

  async findByMicrosoftEventId(microsoftEventId: string): Promise<MeetingDocument | null> {
    try {
      return await this.meetingModel
        .findOne({ microsoftEventId })
        .exec();
    } catch (error: any) {
      this.logger.error(`Error finding meeting by Microsoft event ID:`, error);
      return null;
    }
  }

  async updateMicrosoftEventId(
    id: string,
    microsoftEventId: string,
  ): Promise<MeetingResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid meeting ID');
    }

    try {
      const meeting = await this.meetingModel.findById(id).exec();

      if (!meeting) {
        throw new NotFoundException(`Meeting with ID ${id} not found`);
      }

      meeting.microsoftEventId = microsoftEventId;
      const updatedMeeting = await meeting.save();

      return this.mapToResponseDto(updatedMeeting);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error.code === 11000) {
        throw new BadRequestException('A meeting with this Microsoft event ID already exists');
      }
      this.logger.error(`Error updating Microsoft event ID for meeting ${id}:`, error);
      throw new BadRequestException('Failed to update meeting');
    }
  }

  private mapToResponseDto(meeting: MeetingDocument): MeetingResponseDto {
    const obj = meeting.toObject ? meeting.toObject() : meeting;
    return {
      id: (obj._id || '').toString(),
      title: obj.title,
      startTime: obj.startTime,
      endTime: obj.endTime,
      microsoftEventId: obj.microsoftEventId,
      organizerId: obj.organizerId.toString(),
      participants: obj.participants,
      transcript: obj.transcript,
      translatedTranscript: obj.translatedTranscript || null,
      summary: obj.summary,
      actionItems: obj.actionItems,
      decisions: obj.decisions,
      nextSteps: obj.nextSteps,
      status: obj.status,
      processedAt: obj.processedAt,
      recordingMeta: obj.recordingMeta || null,
      productivity: obj.productivity || null,
      createdAt: obj.createdAt || new Date(),
      updatedAt: obj.updatedAt || new Date(),
    };
  }
}
