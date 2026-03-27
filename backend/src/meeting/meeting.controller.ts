import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeetingService } from './meeting.service';
import { AiService } from '../ai/ai.service';
import { MicrosoftService } from '../microsoft/microsoft.service';
import { UserService } from '../user/user.service';
import { Meeting, MeetingDocument, MeetingStatus } from './schemas/meeting.schema';
import {
  CreateMeetingDto,
  UpdateMeetingDto,
  ProcessMeetingDto,
  MeetingResponseDto,
  MeetingListResponseDto,
  PaginationQueryDto,
} from './dto/meeting.dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
  };
}

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingController {
  private readonly logger = new Logger(MeetingController.name);

  constructor(
    private readonly meetingService: MeetingService,
    private readonly microsoftService: MicrosoftService,
    private readonly userService: UserService,
    @Inject('AI_SERVICE') private readonly aiService: AiService,
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all meetings for authenticated user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: HttpStatus.OK, type: MeetingListResponseDto })
  async findAll(
    @Req() req: RequestWithUser,
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<MeetingListResponseDto> {
    this.logger.log(`Getting meetings for user ${req.user.userId}`);
    return this.meetingService.findAllByUser(req.user.userId, paginationQuery);
  }

  /**
   * IMPORTANT: /sync must be declared BEFORE /:id
   * otherwise NestJS treats "sync" as an :id parameter
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync meetings from Microsoft Graph calendar' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Meetings synced successfully' })
  async syncMeetings(
    @Req() req: RequestWithUser,
    @Body() body: { days?: number } = {},
  ): Promise<{ message: string; synced: number; total: number }> {
    const userId = req.user.userId;
    this.logger.log(`Starting Microsoft Graph sync for user ${userId}`);

    try {
      // Get the user's stored Microsoft access token from DB
      const user = await this.userService.findById(userId);

      if (!user.accessToken) {
        throw new BadRequestException(
          'No Microsoft access token found. Please re-authenticate with Microsoft.',
        );
      }

      let msAccessToken = user.accessToken;

      // Fetch calendar events from Microsoft Graph
      const pastDays = body.days || 6;
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - pastDays);
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 1); // include today

      let events;
      try {
        events = await this.microsoftService.getCalendarView(
          msAccessToken,
          startDate.toISOString(),
          endDate.toISOString(),
        );
      } catch (error: any) {
        // If token expired, try refreshing it
        if (
          error.status === 401 ||
          error.message?.includes('expired') ||
          error.message?.includes('invalid')
        ) {
          this.logger.log('Access token expired, attempting refresh...');
          try {
            const newToken = await this.microsoftService.handleTokenRefresh(
              user.refreshToken,
            );
            msAccessToken = newToken;
            // Update stored token
            await this.userService.updateTokens(
              userId,
              newToken,
              user.refreshToken,
            );
            // Retry with new token
            events = await this.microsoftService.getCalendarView(
              newToken,
              startDate.toISOString(),
              endDate.toISOString(),
            );
          } catch (refreshError) {
            throw new BadRequestException(
              'Microsoft token expired and refresh failed. Please sign in again.',
            );
          }
        } else {
          throw error;
        }
      }

      this.logger.log(`Fetched ${events.length} events from Microsoft Graph`);

      let synced = 0;

      // Helper to safely extract a date string from Graph API event
      const toDateString = (dt: any): string => {
        if (typeof dt === 'string') return dt;
        if (dt?.dateTime) return dt.dateTime;
        return new Date().toISOString();
      };

      for (const event of events) {
        const microsoftEventId = event.id;
        const startStr = toDateString(event.start);
        const endStr = toDateString(event.end);
        const participants = (event.attendees || []).map((a: any) => ({
          name: a.emailAddress?.name || a.emailAddress?.address || 'Unknown',
          email: a.emailAddress?.address || '',
        }));

        // Check if meeting already exists in DB
        const existingMeeting =
          await this.meetingService.findByMicrosoftEventId(microsoftEventId);

        const onlineMeetingUrl =
          event.onlineMeeting?.joinUrl ||
          event.onlineMeetingUrl ||
          null;
        const isOnline = !!event.isOnlineMeeting || !!onlineMeetingUrl;
        const location = event.location?.displayName || null;

        if (existingMeeting) {
          existingMeeting.title = event.subject || 'Untitled Meeting';
          existingMeeting.startTime = new Date(startStr);
          existingMeeting.endTime = new Date(endStr);
          existingMeeting.participants = participants;
          if (onlineMeetingUrl) existingMeeting.onlineMeetingUrl = onlineMeetingUrl;
          existingMeeting.isOnline = isOnline;
          if (location) existingMeeting.location = location;
          await existingMeeting.save();
        } else {
          try {
            const newMeeting = new this.meetingModel({
              title: event.subject || 'Untitled Meeting',
              startTime: new Date(startStr),
              endTime: new Date(endStr),
              microsoftEventId,
              organizerId: new Types.ObjectId(userId),
              participants,
              onlineMeetingUrl,
              isOnline,
              location,
              status: MeetingStatus.PENDING,
            });
            await newMeeting.save();
            synced++;
          } catch (saveError: any) {
            // Skip duplicates silently (race condition or unique index)
            if (saveError.code !== 11000) {
              this.logger.warn(
                `Failed to save meeting "${event.subject}": ${saveError.message}`,
              );
            }
          }
        }
      }

      this.logger.log(`Sync complete: ${synced} new meetings synced out of ${events.length} events`);

      return {
        message: `Successfully synced ${synced} new meetings from Microsoft Calendar.`,
        synced,
        total: events.length,
      };
    } catch (error: any) {
      this.logger.error(`Sync failed for user ${userId}: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Sync failed: ${error.message}`);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single meeting by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: HttpStatus.OK, type: MeetingResponseDto })
  async findById(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<MeetingResponseDto> {
    this.logger.log(`Getting meeting ${id} for user ${req.user.userId}`);
    return this.meetingService.findById(id, req.user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new meeting' })
  @ApiResponse({ status: HttpStatus.CREATED, type: MeetingResponseDto })
  async create(
    @Req() req: RequestWithUser,
    @Body() createMeetingDto: CreateMeetingDto,
  ): Promise<MeetingResponseDto> {
    this.logger.log(`Creating meeting for user ${req.user.userId}`);
    return this.meetingService.create(req.user.userId, createMeetingDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a meeting' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: HttpStatus.OK, type: MeetingResponseDto })
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateMeetingDto: UpdateMeetingDto,
  ): Promise<MeetingResponseDto> {
    this.logger.log(`Updating meeting ${id} for user ${req.user.userId}`);
    return this.meetingService.update(id, req.user.userId, updateMeetingDto);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Trigger AI processing for a meeting' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: HttpStatus.OK, type: MeetingResponseDto })
  async processMeeting(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() processMeetingDto: ProcessMeetingDto,
  ): Promise<MeetingResponseDto> {
    this.logger.log(`Processing meeting ${id} for user ${req.user.userId}`);
    const dto = { ...processMeetingDto, meetingId: id };
    return this.meetingService.processMeeting(req.user.userId, dto);
  }

  @Post(':id/translate')
  @ApiOperation({ summary: 'Translate meeting transcript to a target language' })
  @ApiParam({ name: 'id', type: String })
  async translateTranscript(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: { targetLanguage?: string },
  ): Promise<{ translatedTranscript: string }> {
    this.logger.log(`Translating transcript for meeting ${id}`);

    const meeting = await this.meetingModel.findById(id).exec();
    if (!meeting) {
      throw new BadRequestException('Meeting not found');
    }

    // Return saved translation if it already exists
    if (meeting.translatedTranscript) {
      this.logger.log(`Returning cached translation for meeting ${id}`);
      return { translatedTranscript: meeting.translatedTranscript };
    }

    if (!meeting.transcript) {
      throw new BadRequestException('No transcript available to translate');
    }

    const targetLanguage = body.targetLanguage || 'English';
    const translatedTranscript = await this.aiService.translateTranscript(
      meeting.transcript,
      targetLanguage,
    );

    // Save to DB
    meeting.translatedTranscript = translatedTranscript;
    await meeting.save();
    this.logger.log(`Translation saved for meeting ${id}`);

    return { translatedTranscript };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a meeting' })
  @ApiParam({ name: 'id', type: String })
  async delete(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ): Promise<void> {
    this.logger.log(`Deleting meeting ${id} for user ${req.user.userId}`);
    await this.meetingService.delete(id, req.user.userId);
  }
}
