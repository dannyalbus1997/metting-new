/**
 * Transcript Cron Service
 * Replaces the Bot module — automatically fetches transcripts & recordings
 * from Microsoft Graph for completed/ended meetings, then triggers AI processing.
 *
 * Flow:
 *  1. Cron finds meetings that have ended (endTime < now) with no transcript
 *  2. For each meeting, resolves the Microsoft organizer user ID
 *  3. Finds the online meeting in Graph via JoinWebUrl or threadId
 *  4. Attempts to fetch recording → pipe to Whisper for transcription
 *  5. Falls back to Online Meetings Transcripts API (VTT format)
 *  6. Saves transcript and triggers AI processing (summary, action items, productivity)
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Readable } from 'stream';
import {
  Meeting,
  MeetingDocument,
  MeetingStatus,
} from './schemas/meeting.schema';
import { MeetingService } from './meeting.service';
import { UserService } from '../user/user.service';
import { AiService } from '../ai/ai.service';
import { TranscriptionService } from '../bot/transcription.service';

@Injectable()
export class TranscriptCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscriptCronService.name);
  private cronInterval: NodeJS.Timeout | null = null;

  // Config
  private readonly cronIntervalMs: number;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    private readonly meetingService: MeetingService,
    private readonly userService: UserService,
    private readonly aiService: AiService,
    private readonly transcriptionService: TranscriptionService,
  ) {
    this.cronIntervalMs = Number(
      this.configService.get<string>('TRANSCRIPT_CRON_INTERVAL_MS', '60000'),
    );
    this.clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET', '');
    this.tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID', '');
  }

  onModuleInit() {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      this.logger.warn(
        'Transcript cron disabled — MICROSOFT_CLIENT_ID / CLIENT_SECRET / TENANT_ID not configured',
      );
      return;
    }

    this.logger.log(
      `Transcript cron started — checking every ${this.cronIntervalMs / 1000}s`,
    );
    this.cronInterval = setInterval(() => {
      this.processEndedMeetings().catch((err) => {
        this.logger.error(`Transcript cron error: ${err.message}`);
      });
    }, this.cronIntervalMs);
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.logger.log('Transcript cron stopped');
    }
  }

  // ─── PUBLIC: manual trigger for a single meeting ───

  async fetchTranscriptForMeeting(meetingId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const meeting = await this.meetingModel.findById(meetingId).exec();
    if (!meeting) {
      return { success: false, message: 'Meeting not found' };
    }
    return this.processSingleMeeting(meeting);
  }

  // ─── CRON LOOP ───

  private async processEndedMeetings(): Promise<void> {
    // Skip if no users with valid Microsoft tokens exist
    const users = await this.userService.findAll();
    const hasTokenUsers = users.some(u => u.accessToken && u.refreshToken);
    if (!hasTokenUsers) {
      this.logger.debug('No users with tokens in DB — skipping transcript cron tick');
      return;
    }

    const now = new Date();
    // Find online meetings that have ended, have no transcript, and haven't been fetched recently
    const meetings = await this.meetingModel
      .find({
        isOnline: true,
        endTime: { $lt: now },
        transcript: null,
        status: { $in: [MeetingStatus.PENDING, MeetingStatus.FAILED] },
        transcriptFetchStatus: { $in: ['idle', 'failed', null] },
        // Don't retry too aggressively — at least 5 minutes between attempts
        $or: [
          { lastTranscriptFetchAt: null },
          { lastTranscriptFetchAt: { $lt: new Date(now.getTime() - 5 * 60 * 1000) } },
        ],
      })
      .limit(5)
      .exec();

    if (meetings.length === 0) return;

    this.logger.log(`Found ${meetings.length} meeting(s) needing transcript fetch`);

    for (const meeting of meetings) {
      try {
        await this.processSingleMeeting(meeting);
      } catch (err: any) {
        this.logger.error(
          `Transcript fetch failed for meeting ${meeting._id}: ${err.message}`,
        );
      }
    }
  }

  // ─── SINGLE MEETING PROCESSING ───

  private async processSingleMeeting(
    meeting: MeetingDocument,
  ): Promise<{ success: boolean; message: string }> {
    const meetingId = String(meeting._id);
    this.logger.log(`Processing transcript for meeting: ${meeting.title} (${meetingId})`);

    // Mark as fetching
    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $set: {
        transcriptFetchStatus: 'fetching',
        lastTranscriptFetchAt: new Date(),
        transcriptFetchError: null,
      },
    }).exec();

    try {
      // Step 1: Resolve Microsoft user ID of the organizer
      const organizerMsId = await this.resolveOrganizerMicrosoftId(meeting);
      if (!organizerMsId) {
        return this.markFailed(meetingId, 'Could not resolve organizer Microsoft ID');
      }

      // Step 2: Find the online meeting in Graph
      const joinUrl = meeting.onlineMeetingUrl || '';
      const threadId = this.extractThreadId(joinUrl);
      const onlineMeetingId = await this.findOnlineMeetingId(
        organizerMsId,
        threadId,
        joinUrl,
      );

      if (!onlineMeetingId) {
        return this.markFailed(meetingId, 'Could not find online meeting in Microsoft Graph');
      }

      // Step 3: Try recording → Whisper transcription first
      let transcript = await this.tryRecordingTranscription(
        meetingId,
        organizerMsId,
        onlineMeetingId,
      );

      // Step 4: Fallback to Online Meetings Transcripts API (VTT)
      if (!transcript) {
        transcript = await this.fetchTranscriptFromOnlineMeeting(
          organizerMsId,
          onlineMeetingId,
        );
      }

      if (!transcript) {
        return this.markFailed(
          meetingId,
          'No transcript or recording available yet. Will retry automatically.',
        );
      }

      // Step 5: Save transcript
      await this.meetingService.updateTranscript(meetingId, transcript);
      this.logger.log(`Transcript saved for meeting ${meetingId} (${transcript.length} chars)`);

      // Step 6: Mark as transcribing (AI processing phase)
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $set: { transcriptFetchStatus: 'transcribing' },
      }).exec();

      // Step 7: Trigger AI processing in background
      this.processWithAi(meetingId, transcript).catch((err) => {
        this.logger.error(`AI processing failed for ${meetingId}: ${err.message}`);
      });

      // Mark done
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $set: { transcriptFetchStatus: 'done', transcriptFetchError: null },
      }).exec();

      return {
        success: true,
        message: `Transcript fetched (${transcript.length} chars). AI processing started.`,
      };
    } catch (err: any) {
      return this.markFailed(meetingId, err.message);
    }
  }

  // ─── GRAPH API HELPERS ───

  private async getAppAccessToken(): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.data?.access_token) {
      throw new Error('No access token in response');
    }
    return response.data.access_token;
  }

  private async resolveOrganizerMicrosoftId(
    meeting: MeetingDocument,
  ): Promise<string | null> {
    // Try user record first
    try {
      const user = await this.userService.findById(String(meeting.organizerId));
      if (user?.microsoftId) return user.microsoftId;
    } catch {
      // ignore
    }

    // Try extracting from join URL context
    const joinUrl = meeting.onlineMeetingUrl || '';
    if (joinUrl) {
      try {
        const decoded = decodeURIComponent(joinUrl);
        const contextMatch = decoded.match(/context=(\{[^}]+\})/);
        if (contextMatch) {
          const context = JSON.parse(contextMatch[1]);
          if (context.Oid) return context.Oid;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  private extractThreadId(joinUrl: string): string | undefined {
    if (!joinUrl) return undefined;
    try {
      const decoded = decodeURIComponent(joinUrl);
      const match = decoded.match(/19:meeting_[^/]+/);
      return match ? match[0] : undefined;
    } catch {
      return undefined;
    }
  }

  private async findOnlineMeetingId(
    organizerId: string,
    threadId?: string,
    joinUrl?: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.getAppAccessToken();

      // Strategy A: Filter by JoinWebUrl
      if (joinUrl) {
        const escapedUrl = joinUrl.replace(/'/g, "''");
        const filterUrl = `${this.graphBaseUrl}/users/${organizerId}/onlineMeetings?$filter=JoinWebUrl eq '${escapedUrl}'`;

        const resp = await axios.get(filterUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });

        if (resp.status === 200 && resp.data?.value?.length) {
          return resp.data.value[0].id;
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
          return resp.data.value[0].id;
        }
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`findOnlineMeetingId error: ${err.message}`);
      return null;
    }
  }

  // ─── RECORDING → WHISPER ───

  private async tryRecordingTranscription(
    meetingId: string,
    organizerId: string,
    onlineMeetingId: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.getAppAccessToken();
      const listUrl = `${this.graphBaseUrl}/users/${organizerId}/onlineMeetings/${onlineMeetingId}/recordings`;

      const listResp = await axios.get(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      if (listResp.status !== 200 || !listResp.data?.value?.length) {
        this.logger.log(`No recordings found for meeting ${onlineMeetingId}`);
        return null;
      }

      const recording = listResp.data.value[0];
      const recordingId = recording.id;
      const contentUrl = `${listUrl}/${recordingId}/content`;

      // Save recording metadata for on-demand playback later
      await this.meetingService.updateRecordingMeta(meetingId, {
        organizerId,
        onlineMeetingId,
        recordingId,
      });

      // Mark as transcribing
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $set: { transcriptFetchStatus: 'transcribing' },
      }).exec();

      // Stream recording directly to Whisper
      this.logger.log(`Opening recording stream for meeting ${meetingId}...`);
      const streamResp = await axios.get(contentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'stream',
        timeout: 300000,
        validateStatus: () => true,
      });

      if (streamResp.status !== 200) {
        this.logger.warn(`Recording stream failed (${streamResp.status})`);
        streamResp.data?.destroy?.();
        return null;
      }

      const transcription = await this.transcriptionService.transcribeFromStream(
        streamResp.data as Readable,
        `recording_${onlineMeetingId}.mp4`,
      );

      return this.transcriptionService.formatTranscript(transcription);
    } catch (err: any) {
      this.logger.warn(`Recording transcription failed: ${err.message}`);
      return null;
    }
  }

  // ─── ONLINE MEETINGS TRANSCRIPTS API (VTT) ───

  private async fetchTranscriptFromOnlineMeeting(
    organizerId: string,
    onlineMeetingId: string,
  ): Promise<string | null> {
    try {
      const accessToken = await this.getAppAccessToken();
      const transcriptsUrl = `${this.graphBaseUrl}/users/${organizerId}/onlineMeetings/${onlineMeetingId}/transcripts`;

      const listResp = await axios.get(transcriptsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      if (listResp.status !== 200 || !listResp.data?.value?.length) {
        this.logger.log('No transcripts found via Online Meetings API');
        return null;
      }

      const transcriptId = listResp.data.value[0].id;
      const contentUrl = `${transcriptsUrl}/${transcriptId}/content?$format=text/vtt`;

      const contentResp = await axios.get(contentUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'text/vtt',
        },
        validateStatus: () => true,
      });

      if (contentResp.status === 200 && contentResp.data) {
        const transcript = this.parseVttToText(String(contentResp.data));
        this.logger.log(`Got transcript from Online Meetings API: ${transcript.length} chars`);
        return transcript;
      }

      return null;
    } catch (err: any) {
      this.logger.warn(`fetchTranscriptFromOnlineMeeting error: ${err.message}`);
      return null;
    }
  }

  // ─── VTT PARSER ───

  private parseVttToText(vtt: string): string {
    const lines = vtt.split('\n');
    const parts: string[] = [];
    let currentSpeaker = '';
    let currentTime = '';

    for (const line of lines) {
      if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.trim() === '') continue;

      const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})\.\d+ --> (\d{2}:\d{2}:\d{2})\.\d+/);
      if (timeMatch) {
        currentTime = `[${timeMatch[1]} → ${timeMatch[2]}]`;
        continue;
      }

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

      const plainText = line.trim();
      if (plainText && !plainText.match(/^\d+$/)) {
        parts.push(`${currentTime} ${plainText}`);
      }
    }

    return parts.join('\n');
  }

  // ─── AI PROCESSING ───

  private async processWithAi(
    meetingId: string,
    transcript: string,
  ): Promise<void> {
    this.logger.log(`Starting AI processing for meeting ${meetingId}`);
    try {
      const [aiResults, translatedTranscript] = await Promise.all([
        this.aiService.processTranscript(transcript),
        this.aiService.translateTranscript(transcript, 'English').catch((err) => {
          this.logger.warn(`Auto-translation failed for meeting ${meetingId}: ${err.message}`);
          return null;
        }),
      ]);

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
        `AI processing complete for meeting ${meetingId} (productivity: ${aiResults.productivity?.score ?? 'N/A'}%)`,
      );
    } catch (error: any) {
      this.logger.error(`AI processing failed for meeting ${meetingId}: ${error.message}`);
      await this.meetingModel.findByIdAndUpdate(meetingId, {
        $set: {
          status: MeetingStatus.FAILED,
          errorMessage: error.message || 'AI processing failed',
        },
      }).exec();
    }
  }

  // ─── HELPERS ───

  private async markFailed(
    meetingId: string,
    error: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.warn(`Transcript fetch failed for ${meetingId}: ${error}`);
    await this.meetingModel.findByIdAndUpdate(meetingId, {
      $set: {
        transcriptFetchStatus: 'failed',
        transcriptFetchError: error,
      },
    }).exec();
    return { success: false, message: error };
  }
}
