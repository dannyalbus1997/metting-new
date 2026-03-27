/**
 * Bot Controller
 * Handles bot commands (join/leave meeting) and Teams webhook callbacks
 * Endpoints:
 *   POST /bot/join           - Send bot to join a meeting
 *   POST /bot/leave/:callId  - Remove bot from a meeting
 *   GET  /bot/status/:meetingId - Get bot status for a meeting
 *   GET  /bot/active         - List all active bot calls
 *   POST /bot/callback       - Teams notification webhook (called by Microsoft)
 *   POST /bot/transcribe/:meetingId - Manually transcribe an uploaded recording
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BotService } from './bot.service';
import { TranscriptionService } from './transcription.service';
import { MeetingService } from '../meeting/meeting.service';
import { AiService } from '../ai/ai.service';
import { UserService } from '../user/user.service';
import {
  BotCallState,
  BotStatus,
  TeamsNotificationPayload,
  JoinMeetingRequest,
} from './interfaces/bot.interfaces';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
  };
}

@ApiTags('bot')
@Controller('bot')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(
    private readonly botService: BotService,
    private readonly transcriptionService: TranscriptionService,
    private readonly meetingService: MeetingService,
    private readonly aiService: AiService,
    private readonly userService: UserService,
  ) {}

  /**
   * Send the bot to join a Teams meeting
   * Requires: meeting join URL + meeting MongoDB ID
   */
  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send bot to join a Teams meeting' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bot joining meeting' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request' })
  async joinMeeting(
    @Req() req: RequestWithUser,
    @Body() body: { meetingId: string; meetingUrl: string; displayName?: string },
  ): Promise<{ success: boolean; callState: BotCallState; message: string }> {
    const { meetingId, meetingUrl, displayName } = body;

    if (!meetingId || !meetingUrl) {
      throw new BadRequestException('meetingId and meetingUrl are required');
    }

    this.logger.log(`User ${req.user.userId} requesting bot join for meeting ${meetingId}`);

    // Check if bot is already in this meeting
    const existingCall = this.botService.getCallStateByMeetingId(meetingId);
    if (
      existingCall &&
      existingCall.status !== BotStatus.COMPLETED &&
      existingCall.status !== BotStatus.FAILED
    ) {
      return {
        success: true,
        callState: existingCall,
        message: 'Bot is already in this meeting',
      };
    }

    const callState = await this.botService.joinMeeting({
      meetingUrl,
      meetingId,
      displayName,
    });

    if (callState.status === BotStatus.FAILED) {
      return {
        success: false,
        callState,
        message: `Failed to join meeting: ${callState.error}`,
      };
    }

    // Auto-start recording after a short delay to let the bot settle in
    setTimeout(async () => {
      try {
        await this.botService.startRecording(callState.callId);
      } catch (err: any) {
        this.logger.warn(`Auto-recording failed: ${err.message}`);
      }
    }, 5000);

    return {
      success: true,
      callState,
      message: 'Bot is joining the meeting and will start recording automatically',
    };
  }

  /**
   * Remove bot from a meeting
   */
  @Post('leave/:callId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove bot from a meeting' })
  @ApiParam({ name: 'callId', type: String })
  async leaveMeeting(
    @Param('callId') callId: string,
  ): Promise<{ success: boolean; message: string }> {
    const callState = this.botService.getCallState(callId);
    if (!callState) {
      throw new BadRequestException('No active call found with this ID');
    }

    await this.botService.leaveMeeting(callId);

    return {
      success: true,
      message: 'Bot is leaving the meeting',
    };
  }

  /**
   * Get bot status for a specific meeting
   */
  @Get('status/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bot status for a meeting' })
  @ApiParam({ name: 'meetingId', type: String })
  async getStatus(
    @Param('meetingId') meetingId: string,
  ): Promise<{ active: boolean; callState: BotCallState | null }> {
    const callState = this.botService.getCallStateByMeetingId(meetingId);
    return {
      active: !!callState && callState.status !== BotStatus.COMPLETED && callState.status !== BotStatus.FAILED,
      callState: callState || null,
    };
  }

  /**
   * List all active bot calls
   */
  @Get('active')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active bot calls' })
  async getActiveCalls(): Promise<{ calls: BotCallState[] }> {
    return { calls: this.botService.getActiveCalls() };
  }

  /**
   * Teams notification webhook endpoint
   * Microsoft sends call state updates here (established, terminated, recording ready, etc.)
   * This endpoint must be publicly accessible (use ngrok for local dev)
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Teams notification webhook (called by Microsoft)' })
  async handleTeamsCallback(
    @Body() payload: TeamsNotificationPayload,
  ): Promise<void> {
    this.logger.log(`Received Teams callback: ${JSON.stringify(payload).slice(0, 500)}`);

    if (!payload?.value || !Array.isArray(payload.value)) {
      return;
    }

    for (const notification of payload.value) {
      const resourceData = notification.resourceData;
      if (!resourceData) continue;

      // Extract callId from notification.resource or resourceUrl
      // Microsoft sends paths like "/app/calls/{callId}" or "/communications/calls/{callId}"
      let callId = resourceData.id;
      if (!callId) {
        const resourcePath = notification.resource || (notification as any).resourceUrl || '';
        const match = resourcePath.match(/\/calls\/([^/]+)/);
        if (match) {
          callId = match[1];
        }
      }
      const state = resourceData.state;

      this.logger.log(`Call ${callId}: state = ${state} (resource: ${notification.resource})`);

      if (!callId) {
        // Last resort: try to find the active call by matching the threadId from chatInfo
        const threadId = resourceData.chatInfo?.threadId;
        if (threadId) {
          const activeCalls = this.botService.getActiveCalls();
          const match = activeCalls.find((c) => c.joinUrl?.includes(encodeURIComponent(threadId)) || c.joinUrl?.includes(threadId));
          if (match) {
            callId = match.callId;
            this.logger.log(`Resolved callId ${callId} from threadId ${threadId}`);
          }
        }
      }

      if (!callId) {
        this.logger.warn(`No callId found in notification — skipping. resource=${notification.resource}`);
        continue;
      }

      switch (state) {
        case 'established':
          // Bot has joined the meeting.
          // The callId from the callback may differ from the one stored during joinMeeting().
          // Try to find the existing call state by callId OR by threadId match.
          {
            let existingState = this.botService.getCallState(callId);
            if (!existingState) {
              // Callback callId didn't match — find by threadId
              const threadId = resourceData.chatInfo?.threadId;
              if (threadId) {
                const activeCalls = this.botService.getActiveCalls();
                const match = activeCalls.find(
                  (c) =>
                    c.joinUrl?.includes(encodeURIComponent(threadId)) ||
                    c.joinUrl?.includes(threadId),
                );
                if (match) {
                  this.logger.log(
                    `Re-mapping call: old=${match.callId} → new=${callId}`,
                  );
                  // Remove old entry, re-add with the callback callId
                  this.botService.removeCall(match.callId);
                  match.callId = callId;
                  this.botService.updateCallState(callId, match);
                  existingState = match;
                }
              }
            }

            if (existingState) {
              this.botService.updateCallState(callId, {
                status: BotStatus.IN_MEETING,
              });
            } else {
              this.logger.warn(`No tracked call found for callId=${callId}`);
            }
            this.logger.log(`Bot is now in meeting (call ${callId})`);

            // Try to start compliance recording (works only for policy-based bots, 403 is fine)
            this.botService.startRecording(callId).catch(() => {});

            // Send a chat message reminding participants to start recording
            const threadId = resourceData.chatInfo?.threadId;
            if (threadId) {
              this.botService.sendMeetingChatMessage(
                threadId,
                `<b>🤖 Sumsy Bot has joined the meeting.</b><br/><br/>` +
                `To get a full transcript and AI summary, please <b>start recording</b> ` +
                `by clicking <b>⋯ (More) → Start recording</b> in the meeting controls.<br/><br/>` +
                `<em>If auto-recording is enabled in your tenant, you can ignore this message.</em>`,
              ).catch(() => {});
            }
          }
          break;

        case 'terminating':
          // Call is ending — log but wait for 'terminated'
          this.logger.log(`Call ${callId} is terminating...`);
          break;

        case 'terminated':
          // Call ended — try to get recording/transcript
          this.logger.log(
            `Call terminated. Full resourceData keys: ${Object.keys(resourceData).join(', ')}`,
          );
          // Find call state: try direct lookup, then threadId match
          let callState = this.botService.getCallState(callId);
          if (!callState) {
            const threadId = resourceData.chatInfo?.threadId;
            if (threadId) {
              const activeCalls = this.botService.getActiveCalls();
              const match = activeCalls.find(
                (c) =>
                  c.joinUrl?.includes(encodeURIComponent(threadId)) ||
                  c.joinUrl?.includes(threadId),
              );
              if (match) {
                callState = match;
                this.logger.log(
                  `Found call state via threadId: callId=${match.callId}, meetingId=${match.meetingId}`,
                );
              }
            }
          }
          if (!callState) {
            this.logger.warn(`No call state found for callId=${callId} — cannot process transcript`);
            break;
          }
          // Now process — try multiple approaches to get a transcript
          // Priority: 1) Download recording → Whisper transcribe
          //           2) Fetch transcript from Online Meetings API (if transcription was enabled)
          //           3) Graph call records API fallback
          {
            callState.status = BotStatus.PROCESSING;
            callState.endedAt = new Date();

            let transcriptSaved = false;
            const organizerId = resourceData.meetingInfo?.organizer?.user?.id;
            const threadId = resourceData.chatInfo?.threadId;
            const joinUrl = callState.joinUrl;

            // First, find the online meeting ID — we'll need it for both recordings and transcripts
            let onlineMeetingId: string | null = null;
            if (organizerId) {
              onlineMeetingId = await this.findOnlineMeetingId(organizerId, threadId, joinUrl);
            }

            // ── Approach 1: Stream recording from Graph → pipe to Whisper (no file/buffer stored) ──
            if (!transcriptSaved && organizerId && onlineMeetingId) {
              this.logger.log(
                `Trying to stream meeting recording → Whisper — organizer: ${organizerId}, meetingId: ${onlineMeetingId}`,
              );

              // Retry with delays — recording takes time to become available after meeting ends
              const delays = [20000, 40000, 60000];
              for (let attempt = 0; attempt < delays.length && !transcriptSaved; attempt++) {
                this.logger.log(
                  `Waiting ${delays[attempt] / 1000}s before recording stream attempt ${attempt + 1}...`,
                );
                await new Promise((r) => setTimeout(r, delays[attempt]));

                try {
                  // Step 1: Get recording metadata (recordingId) — no download
                  const recMeta = await this.botService.getRecordingMeta(
                    organizerId,
                    onlineMeetingId,
                  );

                  if (recMeta) {
                    // Save Graph metadata so frontend can stream playback on demand later
                    await this.meetingService.updateRecordingMeta(callState.meetingId, {
                      organizerId,
                      onlineMeetingId,
                      recordingId: recMeta.recordingId,
                    });

                    // Step 2: Open a stream from Graph and pipe directly to Whisper
                    const streamResult = await this.botService.getRecordingStream(
                      organizerId,
                      onlineMeetingId,
                      recMeta.recordingId,
                    );

                    if (streamResult) {
                      this.logger.log(
                        `Recording stream opened (${streamResult.contentLength ? (streamResult.contentLength / 1024 / 1024).toFixed(1) + ' MB' : 'unknown size'}) — piping to Whisper...`,
                      );

                      const transcription = await this.transcriptionService.transcribeFromStream(
                        streamResult.stream,
                        `recording_${onlineMeetingId}.mp4`,
                      );
                      const formattedTranscript =
                        this.transcriptionService.formatTranscript(transcription);

                      callState.transcript = formattedTranscript;
                      await this.saveMeetingTranscript(callState.meetingId, formattedTranscript);
                      transcriptSaved = true;
                      this.logger.log(
                        `Recording transcribed on attempt ${attempt + 1}: ${formattedTranscript.length} chars`,
                      );
                    }
                  }
                } catch (err: any) {
                  this.logger.warn(
                    `Recording stream/transcribe attempt ${attempt + 1} failed: ${err.message}`,
                  );
                }
              }
            }

            // ── Approach 2: Fetch transcript from Online Meetings Transcripts API ──
            // (if transcription was enabled in the meeting by a participant)
            if (!transcriptSaved && organizerId) {
              this.logger.log(
                `Trying Online Meetings Transcripts API — organizer: ${organizerId}, threadId: ${threadId}`,
              );

              const transcriptDelays = [15000, 30000, 60000];
              for (let attempt = 0; attempt < transcriptDelays.length && !transcriptSaved; attempt++) {
                this.logger.log(
                  `Waiting ${transcriptDelays[attempt] / 1000}s before transcript attempt ${attempt + 1}...`,
                );
                await new Promise((r) => setTimeout(r, transcriptDelays[attempt]));

                try {
                  const transcript = await this.fetchTranscriptFromOnlineMeeting(
                    organizerId,
                    threadId,
                    joinUrl,
                  );
                  if (transcript) {
                    callState.transcript = transcript;
                    await this.saveMeetingTranscript(callState.meetingId, transcript);
                    transcriptSaved = true;
                    this.logger.log(`Transcript fetched on attempt ${attempt + 1}`);
                  }
                } catch (err: any) {
                  this.logger.warn(
                    `Online Meeting transcript attempt ${attempt + 1} failed: ${err.message}`,
                  );
                }
              }
            }

            // ── Approach 3: Graph call records API (last resort) ──
            if (!transcriptSaved) {
              this.logger.log('Trying Graph call records API...');
              try {
                const transcript = await this.fetchTranscriptFromGraph(callId);
                if (transcript) {
                  callState.transcript = transcript;
                  await this.saveMeetingTranscript(callState.meetingId, transcript);
                  transcriptSaved = true;
                }
              } catch (err: any) {
                this.logger.warn(`Graph transcript fetch failed: ${err.message}`);
              }
            }

            if (transcriptSaved) {
              callState.status = BotStatus.COMPLETED;
            } else {
              this.logger.warn(
                `No recording or transcript available for meeting ${callState.meetingId}. ` +
                `Ensure recording was started in the meeting. ` +
                `Manual options: POST /api/bot/transcribe/${callState.meetingId} (audio upload) ` +
                `or POST /api/bot/transcript/${callState.meetingId} (paste text).`,
              );
              callState.status = BotStatus.COMPLETED;
              callState.error =
                'No recording found — make sure someone starts recording in the meeting, or upload manually';
            }

            this.botService.updateCallState(callId, callState);
          }
          break;

        default:
          this.logger.debug(`Unhandled call state: ${state}`);
      }
    }
  }

  /**
   * Manually upload and transcribe a recording for a meeting
   * Useful when recording was done externally
   */
  @Post('transcribe/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and transcribe an audio recording for a meeting' })
  @ApiParam({ name: 'meetingId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio: { type: 'string', format: 'binary' },
      },
    },
  })
  async transcribeUpload(
    @Req() req: RequestWithUser,
    @Param('meetingId') meetingId: string,
    @UploadedFile() file: any,
  ): Promise<{ success: boolean; transcript: string; message: string }> {
    if (!file) {
      throw new BadRequestException('No audio file uploaded');
    }

    this.logger.log(
      `User ${req.user.userId} uploading recording for meeting ${meetingId}: ${file.originalname} (${file.size} bytes)`,
    );

    // Transcribe in memory (no file saved to disk)
    const transcription = await this.transcriptionService.transcribeAudio(
      file.buffer,
      file.originalname,
    );

    const formattedTranscript =
      this.transcriptionService.formatTranscript(transcription);

    // Save transcript to meeting in MongoDB
    await this.saveMeetingTranscript(meetingId, formattedTranscript);

    return {
      success: true,
      transcript: formattedTranscript,
      message: `Transcription complete: ${transcription.segments.length} segments, ${Math.round(transcription.duration)}s of audio`,
    };
  }

  /**
   * Manually submit transcript text for a meeting
   * Useful when automatic transcript fetching fails but you have the text
   * (e.g. copied from Teams transcript panel, or from another source)
   */
  @Post('transcript/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit transcript text manually for a meeting' })
  @ApiParam({ name: 'meetingId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['transcript'],
      properties: {
        transcript: { type: 'string', description: 'The full transcript text' },
      },
    },
  })
  async submitTranscript(
    @Req() req: RequestWithUser,
    @Param('meetingId') meetingId: string,
    @Body() body: { transcript: string },
  ): Promise<{ success: boolean; message: string }> {
    const { transcript } = body;

    if (!transcript || transcript.trim().length === 0) {
      throw new BadRequestException('Transcript text is required');
    }

    this.logger.log(
      `User ${req.user.userId} submitting manual transcript for meeting ${meetingId} (${transcript.length} chars)`,
    );

    // Save transcript to meeting in MongoDB
    await this.saveMeetingTranscript(meetingId, transcript.trim());

    return {
      success: true,
      message: `Transcript saved (${transcript.trim().length} characters). AI processing started.`,
    };
  }

  /**
   * Retry fetching transcript from Microsoft Graph for a meeting
   * Useful when transcription wasn't ready immediately after the meeting ended
   */
  @Post('retry-transcript/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry fetching transcript from Microsoft Graph' })
  @ApiParam({ name: 'meetingId', type: String })
  async retryTranscriptFetch(
    @Req() req: RequestWithUser,
    @Param('meetingId') meetingId: string,
  ): Promise<{ success: boolean; transcript?: string; message: string }> {
    this.logger.log(
      `User ${req.user.userId} retrying transcript fetch for meeting ${meetingId}`,
    );

    // Find the meeting to get the joinUrl and organizer info
    const meeting = await this.meetingService.findById(meetingId);
    if (!meeting) {
      throw new BadRequestException('Meeting not found');
    }

    const joinUrl = (meeting as any).onlineMeetingUrl || (meeting as any).joinWebUrl || '';
    const mongoOrganizerId = meeting.organizerId || '';

    if (!mongoOrganizerId) {
      throw new BadRequestException(
        'Cannot retry — no organizer ID found for this meeting. Use manual transcript submission instead.',
      );
    }

    // Resolve the Microsoft user GUID from the MongoDB ObjectId
    // The Graph API requires the Microsoft GUID (e.g. 15ba2acd-...), not the MongoDB ObjectId
    let microsoftUserId = '';
    try {
      const user = await this.userService.findById(String(mongoOrganizerId));
      if (user?.microsoftId) {
        microsoftUserId = user.microsoftId;
      }
    } catch (err: any) {
      this.logger.warn(`Could not look up user for organizerId ${mongoOrganizerId}: ${err.message}`);
    }

    // Fallback: try to extract organizer Oid from the meeting join URL context param
    if (!microsoftUserId && joinUrl) {
      try {
        const decoded = decodeURIComponent(joinUrl);
        const contextMatch = decoded.match(/context=(\{[^}]+\})/);
        if (contextMatch) {
          const context = JSON.parse(contextMatch[1]);
          if (context.Oid) microsoftUserId = context.Oid;
        }
      } catch {
        // ignore
      }
    }

    if (!microsoftUserId) {
      throw new BadRequestException(
        'Cannot retry — could not resolve Microsoft user ID for the organizer. Use manual transcript submission instead.',
      );
    }

    // Extract threadId from the join URL
    let threadId = '';
    try {
      const decoded = decodeURIComponent(joinUrl);
      const threadMatch = decoded.match(/19:meeting_[^/]+/);
      if (threadMatch) threadId = threadMatch[0];
    } catch {
      // ignore
    }

    this.logger.log(
      `Retrying transcript fetch — microsoftUserId: ${microsoftUserId}, threadId: ${threadId}, joinUrl: ${joinUrl}`,
    );

    // Try the Online Meetings Transcripts API
    const transcript = await this.fetchTranscriptFromOnlineMeeting(
      microsoftUserId,
      threadId || undefined,
      joinUrl || undefined,
    );

    if (transcript) {
      await this.saveMeetingTranscript(meetingId, transcript);
      return {
        success: true,
        transcript,
        message: `Transcript fetched successfully (${transcript.length} characters). AI processing started.`,
      };
    }

    return {
      success: false,
      message:
        'No transcript found. Make sure transcription was enabled during the meeting, and try again in a few minutes.',
    };
  }

  /**
   * Retry downloading + transcribing the meeting recording from Microsoft Graph.
   * Useful when the recording wasn't ready immediately after the meeting ended.
   */
  @Post('retry-recording/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry downloading and transcribing meeting recording from Graph' })
  @ApiParam({ name: 'meetingId', type: String })
  async retryRecordingFetch(
    @Req() req: RequestWithUser,
    @Param('meetingId') meetingId: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(
      `User ${req.user.userId} retrying recording fetch for meeting ${meetingId}`,
    );

    const meeting = await this.meetingService.findById(meetingId);
    if (!meeting) {
      throw new BadRequestException('Meeting not found');
    }

    const joinUrl = (meeting as any).onlineMeetingUrl || (meeting as any).joinWebUrl || '';
    const mongoOrganizerId = meeting.organizerId || '';

    // Resolve the Microsoft user GUID
    let microsoftUserId = '';
    try {
      const user = await this.userService.findById(String(mongoOrganizerId));
      if (user?.microsoftId) microsoftUserId = user.microsoftId;
    } catch {
      // ignore
    }
    if (!microsoftUserId && joinUrl) {
      try {
        const decoded = decodeURIComponent(joinUrl);
        const contextMatch = decoded.match(/context=(\{[^}]+\})/);
        if (contextMatch) {
          const context = JSON.parse(contextMatch[1]);
          if (context.Oid) microsoftUserId = context.Oid;
        }
      } catch {
        // ignore
      }
    }
    if (!microsoftUserId) {
      throw new BadRequestException('Could not resolve Microsoft user ID for the organizer.');
    }

    // Extract threadId
    let threadId = '';
    try {
      const decoded = decodeURIComponent(joinUrl);
      const threadMatch = decoded.match(/19:meeting_[^/]+/);
      if (threadMatch) threadId = threadMatch[0];
    } catch {
      // ignore
    }

    // Find the online meeting
    const onlineMeetingId = await this.findOnlineMeetingId(
      microsoftUserId,
      threadId || undefined,
      joinUrl || undefined,
    );

    if (!onlineMeetingId) {
      return { success: false, message: 'Could not find the online meeting in Microsoft Graph.' };
    }

    // Step 1: Get recording metadata (no download)
    const recMeta = await this.botService.getRecordingMeta(microsoftUserId, onlineMeetingId);
    if (!recMeta) {
      return {
        success: false,
        message: 'No recording found. Make sure recording was started during the meeting and try again in a few minutes.',
      };
    }

    // Save Graph metadata so frontend can stream playback on demand later
    await this.meetingService.updateRecordingMeta(meetingId, {
      organizerId: microsoftUserId,
      onlineMeetingId,
      recordingId: recMeta.recordingId,
    });

    // Step 2: Open a stream and pipe directly to Whisper (no buffer/file)
    const streamResult = await this.botService.getRecordingStream(
      microsoftUserId,
      onlineMeetingId,
      recMeta.recordingId,
    );

    if (!streamResult) {
      return {
        success: false,
        message: 'Recording exists but could not be streamed from Microsoft Graph. Try again in a few minutes.',
      };
    }

    this.logger.log(
      `Recording stream opened (${streamResult.contentLength ? (streamResult.contentLength / 1024 / 1024).toFixed(1) + ' MB' : 'unknown size'}) — piping to Whisper...`,
    );

    const transcription = await this.transcriptionService.transcribeFromStream(
      streamResult.stream,
      `recording_${onlineMeetingId}.mp4`,
    );
    const formattedTranscript = this.transcriptionService.formatTranscript(transcription);

    // Save transcript + trigger AI
    await this.saveMeetingTranscript(meetingId, formattedTranscript);

    return {
      success: true,
      message: `Recording transcribed (${formattedTranscript.length} chars, ${Math.round(transcription.duration)}s of audio). AI processing started.`,
    };
  }

  /**
   * Stream the meeting recording from Microsoft Graph on demand.
   * No file is stored — pipes Graph API response directly to the client.
   * Memory usage: only a small streaming buffer (~64KB), not the entire file.
   */
  @Get('recording-stream/:meetingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream meeting recording from Microsoft Graph' })
  @ApiParam({ name: 'meetingId', type: String })
  async streamRecording(
    @Param('meetingId') meetingId: string,
    @Res() res: any,
  ): Promise<void> {
    const meta = await this.meetingService.getRecordingMeta(meetingId);
    if (!meta) {
      throw new NotFoundException('No recording available for this meeting');
    }

    const streamResult = await this.botService.getRecordingStream(
      meta.organizerId,
      meta.onlineMeetingId,
      meta.recordingId,
    );

    if (!streamResult) {
      throw new NotFoundException(
        'Recording could not be fetched from Microsoft Graph. It may have expired.',
      );
    }

    res.set({
      'Content-Type': 'video/mp4',
      ...(streamResult.contentLength ? { 'Content-Length': streamResult.contentLength } : {}),
      'Content-Disposition': `inline; filename="recording_${meetingId}.mp4"`,
      'Cache-Control': 'no-cache',
    });

    // Pipe Graph stream directly to client — no buffering
    streamResult.stream.pipe(res);
  }

  /**
   * Find the online meeting ID from the Graph API.
   * Tries JoinWebUrl filter first, then beta threadId filter.
   */
  private async findOnlineMeetingId(
    organizerId: string,
    threadId?: string,
    joinUrl?: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.botService.getAppAccessToken();
      const axios = (await import('axios')).default;
      const graphBase = 'https://graph.microsoft.com/v1.0';

      // Strategy A: Filter by JoinWebUrl
      if (joinUrl) {
        const escapedUrl = joinUrl.replace(/'/g, "''");
        const filterUrl = `${graphBase}/users/${organizerId}/onlineMeetings?$filter=JoinWebUrl eq '${escapedUrl}'`;
        this.logger.log(`findOnlineMeetingId: trying JoinWebUrl filter`);

        const resp = await axios.get(filterUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        if (resp.status === 200 && resp.data?.value?.length) {
          const id = resp.data.value[0].id;
          this.logger.log(`findOnlineMeetingId: found via JoinWebUrl — ${id}`);
          return id;
        }
      }

      // Strategy B: Beta API with chatInfo/threadId
      if (threadId) {
        const betaUrl = `https://graph.microsoft.com/beta/users/${organizerId}/onlineMeetings?$filter=chatInfo/threadId eq '${threadId}'`;
        const resp = await axios.get(betaUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        if (resp.status === 200 && resp.data?.value?.length) {
          const id = resp.data.value[0].id;
          this.logger.log(`findOnlineMeetingId: found via beta threadId — ${id}`);
          return id;
        }
      }

      this.logger.log('findOnlineMeetingId: could not find online meeting');
      return null;
    } catch (err: any) {
      this.logger.warn(`findOnlineMeetingId error: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch transcript from the Online Meetings Transcripts API.
   * Uses /users/{organizerId}/onlineMeetings to find the meeting (requires OnlineMeetings.Read.All Application).
   * Then fetches transcripts (requires OnlineMeetingTranscript.Read.All Application).
   */
  private async fetchTranscriptFromOnlineMeeting(
    organizerId: string,
    threadId?: string,
    joinUrl?: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.botService.getAppAccessToken();
      const axios = (await import('axios')).default;
      const graphBase = 'https://graph.microsoft.com/v1.0';

      // Step 1: Find the online meeting ID
      let onlineMeetingId: string | null = null;

      // Strategy A: Filter by JoinWebUrl (the only supported filter for this endpoint)
      if (joinUrl) {
        // Escape single quotes in the URL for OData filter
        const escapedUrl = joinUrl.replace(/'/g, "''");
        const filterUrl = `${graphBase}/users/${organizerId}/onlineMeetings?$filter=JoinWebUrl eq '${escapedUrl}'`;
        this.logger.log(`Looking up online meeting by JoinWebUrl: ${filterUrl}`);

        const meetingResponse = await axios.get(filterUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        this.logger.log(
          `Online meeting JoinWebUrl filter response (${meetingResponse.status}): ${JSON.stringify(meetingResponse.data).slice(0, 500)}`,
        );

        if (meetingResponse.status === 200 && meetingResponse.data?.value?.length) {
          onlineMeetingId = meetingResponse.data.value[0].id;
          this.logger.log(`Found online meeting via JoinWebUrl filter: ${onlineMeetingId}`);
        }
      }

      // Strategy B: Use beta API to filter by chatInfo/threadId
      if (!onlineMeetingId && threadId) {
        this.logger.log(`Trying beta API lookup by chatInfo/threadId: ${threadId}`);

        const betaFilterUrl = `https://graph.microsoft.com/beta/users/${organizerId}/onlineMeetings?$filter=chatInfo/threadId eq '${threadId}'`;
        const betaResponse = await axios.get(betaFilterUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        this.logger.log(
          `Beta chatInfo/threadId filter response (${betaResponse.status}): ${JSON.stringify(betaResponse.data).slice(0, 300)}`,
        );

        if (betaResponse.status === 200 && betaResponse.data?.value?.length) {
          onlineMeetingId = betaResponse.data.value[0].id;
          this.logger.log(`Found online meeting via beta threadId filter: ${onlineMeetingId}`);
        }
      }

      if (!onlineMeetingId) {
        this.logger.log('Could not find online meeting');
        return null;
      }

      // Step 2: List transcripts for this meeting
      const transcriptsUrl =
        `${graphBase}/users/${organizerId}/onlineMeetings/${onlineMeetingId}/transcripts`;

      this.logger.log(`Fetching transcripts: ${transcriptsUrl}`);
      const transcriptsResponse = await axios.get(transcriptsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      this.logger.log(
        `Transcripts list (${transcriptsResponse.status}): ${JSON.stringify(transcriptsResponse.data).slice(0, 500)}`,
      );

      if (
        transcriptsResponse.status !== 200 ||
        !transcriptsResponse.data?.value?.length
      ) {
        this.logger.log('No transcripts found for this meeting');
        return null;
      }

      // Step 3: Download the transcript content (VTT format)
      const transcriptId = transcriptsResponse.data.value[0].id;
      const contentUrl =
        `${transcriptsUrl}/${transcriptId}/content?$format=text/vtt`;

      this.logger.log(`Downloading transcript content: ${contentUrl}`);
      const contentResponse = await axios.get(contentUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'text/vtt',
        },
        validateStatus: () => true,
      });

      this.logger.log(
        `Transcript content (${contentResponse.status}): ${String(contentResponse.data).slice(0, 500)}`,
      );

      if (contentResponse.status === 200 && contentResponse.data) {
        const vttContent = String(contentResponse.data);
        const transcript = this.parseVttToText(vttContent);
        this.logger.log(`Got transcript from Online Meeting API: ${transcript.length} chars`);
        return transcript;
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`fetchTranscriptFromOnlineMeeting error: ${err.message}`);
      return null;
    }
  }

  /**
   * Parse WebVTT format transcript into readable text.
   * VTT format: timestamps + speaker labels + text
   */
  private parseVttToText(vtt: string): string {
    const lines = vtt.split('\n');
    const parts: string[] = [];
    let currentSpeaker = '';
    let currentTime = '';

    for (const line of lines) {
      // Skip WEBVTT header and empty lines
      if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.trim() === '') {
        continue;
      }

      // Timestamp line: 00:00:00.000 --> 00:00:05.000
      const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})\.\d+ --> (\d{2}:\d{2}:\d{2})\.\d+/);
      if (timeMatch) {
        currentTime = `[${timeMatch[1]} → ${timeMatch[2]}]`;
        continue;
      }

      // Speaker tag: <v Speaker Name>text</v>
      const speakerMatch = line.match(/<v ([^>]+)>(.+?)(?:<\/v>)?$/);
      if (speakerMatch) {
        const speaker = speakerMatch[1];
        const text = speakerMatch[2].replace(/<\/v>$/, '').trim();
        if (speaker !== currentSpeaker) {
          currentSpeaker = speaker;
          parts.push(`${currentTime} [${speaker}] ${text}`);
        } else {
          parts.push(`${currentTime} ${text}`);
        }
        continue;
      }

      // Plain text line (no speaker tag)
      const plainText = line.trim();
      if (plainText && !plainText.match(/^\d+$/)) {
        // Skip cue index numbers
        parts.push(`${currentTime} ${plainText}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Try to fetch a transcript from Microsoft Graph after a call ends.
   * Uses the app-level token to check call records and content.
   */
  private async fetchTranscriptFromGraph(callId: string): Promise<string | null> {
    try {
      const accessToken = await this.botService.getAppAccessToken();
      const axios = (await import('axios')).default;

      // Try call records API — /communications/callRecords/{callId}
      const callRecordUrl = `https://graph.microsoft.com/v1.0/communications/callRecords/${callId}`;
      this.logger.log(`Fetching call record: ${callRecordUrl}`);

      const recordResponse = await axios.get(callRecordUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      this.logger.log(
        `Call record response (${recordResponse.status}): ${JSON.stringify(recordResponse.data).slice(0, 500)}`,
      );

      if (recordResponse.status === 200 && recordResponse.data) {
        // Check if there are sessions with segments that have transcripts
        const sessionsUrl = `${callRecordUrl}/sessions`;
        const sessionsResponse = await axios.get(sessionsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        this.logger.log(
          `Sessions response (${sessionsResponse.status}): ${JSON.stringify(sessionsResponse.data).slice(0, 500)}`,
        );
      }

      return null; // Transcript not available via call records
    } catch (err: any) {
      this.logger.warn(`fetchTranscriptFromGraph error: ${err.message}`);
      return null;
    }
  }

  /**
   * Save transcript text to a meeting document in MongoDB,
   * then automatically run AI processing to generate summary, action items, etc.
   */
  private async saveMeetingTranscript(
    meetingId: string,
    transcript: string,
  ): Promise<void> {
    try {
      await this.meetingService.updateTranscript(meetingId, transcript);
      this.logger.log(`Transcript saved to meeting ${meetingId}`);
    } catch (error: any) {
      this.logger.error(`Failed to save transcript to meeting: ${error.message}`);
      return; // Can't process AI without a saved transcript
    }

    // Auto-trigger AI processing in the background
    this.processWithAi(meetingId, transcript).catch((err) => {
      this.logger.error(`Background AI processing failed for ${meetingId}: ${err.message}`);
    });
  }

  /**
   * Run AI analysis on a transcript and save results to the meeting.
   * Also auto-translates the transcript to English and saves it.
   */
  private async processWithAi(
    meetingId: string,
    transcript: string,
  ): Promise<void> {
    this.logger.log(`Starting AI processing for meeting ${meetingId}`);
    try {
      // Run AI analysis and translation in parallel
      const [aiResults, translatedTranscript] = await Promise.all([
        this.aiService.processTranscript(transcript),
        this.aiService.translateTranscript(transcript, 'English').catch((err) => {
          this.logger.warn(`Auto-translation failed for meeting ${meetingId}: ${err.message}`);
          return null;
        }),
      ]);

      // Bot-initiated AI processing — use updateAiResultsInternal to bypass user ownership check.
      await this.meetingService.updateAiResultsInternal(meetingId, {
        summary: aiResults.summary,
        actionItems: aiResults.actionItems.map((item) => ({
          ...item,
          completed: false,
        })),
        decisions: aiResults.decisions,
        nextSteps: aiResults.nextSteps,
        productivity: aiResults.productivity,
        translatedTranscript,
      });

      this.logger.log(
        `AI processing complete for meeting ${meetingId} (productivity: ${aiResults.productivity?.score ?? 'N/A'}%, translated: ${translatedTranscript ? 'yes' : 'no'})`,
      );
    } catch (error: any) {
      this.logger.error(`AI processing failed for meeting ${meetingId}: ${error.message}`);
    }
  }
}
