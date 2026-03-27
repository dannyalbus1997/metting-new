/**
 * Bot Service
 * Handles joining Teams meetings, starting recording, and managing call lifecycle
 * Uses Microsoft Graph Communications API with application-level permissions
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  BotCallState,
  BotStatus,
  JoinMeetingRequest,
  GraphCallResponse,
} from './interfaces/bot.interfaces';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly httpClient: AxiosInstance;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;
  private readonly botCallbackUrl: string;
  private readonly botDisplayName: string;

  // In-memory store for active calls (use Redis in production)
  private activeCalls: Map<string, BotCallState> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET', '');
    this.tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID', '');

    // Acquire the token from the app's own tenant for Communications API calls.
    // The Communications API requires an enterprise tenant token (not botframework.com).
    this.tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    this.botCallbackUrl = this.configService.get<string>(
      'BOT_CALLBACK_URL',
      'https://your-domain.ngrok-free.app/api/bot/callback',
    );
    this.botDisplayName = this.configService.get<string>(
      'BOT_DISPLAY_NAME',
      'Sumsy Bot',
    );

    this.httpClient = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Get an application-level access token (client credentials flow)
   * This is different from user-delegated tokens — it uses app permissions
   */
  async getAppAccessToken(): Promise<string> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      });

      this.logger.log(`Acquiring token from: ${this.tokenUrl}`);
      const response = await this.httpClient.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.data?.access_token) {
        throw new Error('No access token in response');
      }

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(`Failed to get app access token: ${error.message}`);
      throw new InternalServerErrorException('Failed to authenticate bot with Microsoft');
    }
  }

  /**
   * Get an access token from a specific tenant (for cross-tenant meeting joins)
   */
  async getAppAccessTokenForTenant(tenantId: string): Promise<string> {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    this.logger.log(`Acquiring token from tenant: ${tenantId}`);
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      });

      const response = await this.httpClient.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.data?.access_token) {
        throw new Error('No access token in response');
      }

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(
        `Failed to get token from tenant ${tenantId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to authenticate bot with Microsoft',
      );
    }
  }

  /**
   * Join a Teams meeting using the meeting join URL
   * Uses the Graph Communications API: POST /communications/calls
   */
  async joinMeeting(request: JoinMeetingRequest): Promise<BotCallState> {
    const { meetingUrl, meetingId, displayName } = request;

    this.logger.log(`Bot joining meeting: ${meetingId} via ${meetingUrl}`);

    try {
      // Parse context first so we can acquire a token from the correct tenant.
      const { organizerTenantId, organizerUserId } =
        this.extractMeetingContext(meetingUrl);

      // If the meeting is in a different tenant, acquire token from that tenant.
      const accessToken =
        organizerTenantId && organizerTenantId !== this.tenantId
          ? await this.getAppAccessTokenForTenant(organizerTenantId)
          : await this.getAppAccessToken();

      const threadId = this.extractThreadIdFromUrl(meetingUrl);

      this.logger.log(
        `Parsed meeting: threadId=${threadId}, orgTenant=${organizerTenantId}, orgUser=${organizerUserId}`,
      );

      // Use organizerMeetingInfo (NOT "organizationMeetingInfo") with:
      // 1. tenantId at root level
      // 2. tenantId inside the organizer user object
      // Both are required — MS docs are incomplete on this.
      const joinBody = {
        '@odata.type': '#microsoft.graph.call',
        callbackUri: this.botCallbackUrl,
        tenantId: organizerTenantId,
        requestedModalities: ['audio'],
        mediaConfig: {
          '@odata.type': '#microsoft.graph.serviceHostedMediaConfig',
          preFetchMedia: [],
        },
        chatInfo: {
          '@odata.type': '#microsoft.graph.chatInfo',
          threadId: threadId,
          messageId: '0',
        },
        meetingInfo: {
          '@odata.type': '#microsoft.graph.organizerMeetingInfo',
          organizer: {
            '@odata.type': '#microsoft.graph.identitySet',
            user: {
              '@odata.type': '#microsoft.graph.identity',
              id: organizerUserId,
              tenantId: organizerTenantId,
            },
          },
        },
      };

      this.logger.log(`Join request body: ${JSON.stringify(joinBody, null, 2)}`);
      const response = await this.httpClient.post<GraphCallResponse>(
        `${this.graphBaseUrl}/communications/calls`,
        joinBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const callId = response.data.id;

      // Track the call state
      const callState: BotCallState = {
        callId,
        meetingId,
        joinUrl: meetingUrl,
        status: BotStatus.JOINING,
        startedAt: new Date(),
      };

      this.activeCalls.set(callId, callState);
      this.logger.log(`Bot joined call ${callId} for meeting ${meetingId}`);

      return callState;
    } catch (error: any) {
      const errMsg = error.response?.data?.error?.message || error.message;
      const errorCode = error.response?.data?.error?.code;

      // If the bot is already in this meeting, return the existing call state
      if (errMsg?.includes('already') || errorCode === '7502') {
        this.logger.warn(`Bot is already in meeting ${meetingId}`);
        const existingState = this.getCallStateByMeetingId(meetingId);
        if (existingState) {
          return existingState;
        }
        // If we don't have the state tracked, return an "already joined" state
        return {
          callId: '',
          meetingId,
          joinUrl: meetingUrl,
          status: BotStatus.JOINING,
          startedAt: new Date(),
        };
      }

      this.logger.error(`Failed to join meeting: ${errMsg}`);
      this.logger.error(`Full error: ${JSON.stringify(error.response?.data || {})}`);

      // Return a failed state so caller can handle it
      const failedState: BotCallState = {
        callId: '',
        meetingId,
        joinUrl: meetingUrl,
        status: BotStatus.FAILED,
        startedAt: new Date(),
        error: errMsg,
      };
      return failedState;
    }
  }

  /**
   * Notify Teams that the bot is recording the call.
   * POST /communications/calls/{callId}/updateRecordingStatus
   *
   * NOTE: This only works if the bot was invited via a Teams compliance recording
   * policy. For non-policy bots it will return 403 — that's okay, the bot still
   * attends the meeting and we can fetch the recording afterwards from OneDrive
   * (if someone in the meeting hits "Record") or from the Online Meetings API.
   */
  async startRecording(callId: string): Promise<void> {
    this.logger.log(`Notifying Teams of recording status for call ${callId}`);

    try {
      const accessToken = await this.getAppAccessToken();

     const res=  await this.httpClient.post(
        `${this.graphBaseUrl}/communications/calls/${callId}/updateRecordingStatus`,
        {
          clientContext: 'sumsy-recording',
          status: 'recording',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
        console.log(`this is the response: ${JSON.stringify(res.data)}`);    
      // Update call state
      const callState = this.activeCalls.get(callId);
      if (callState) {
        callState.status = BotStatus.RECORDING;
        this.activeCalls.set(callId, callState);
      }

      this.logger.log(`Recording status updated for call ${callId}`);
    } catch (error: any) {
      const errMsg =
        error.response?.data?.error?.message || error.message;
      const code = error.response?.status;

      if (code === 403) {
        this.logger.warn(
          `updateRecordingStatus returned 403 — bot is not a policy-based recorder. ` +
          `Recording must be started by a meeting participant. We'll fetch it after the meeting ends.`,
        );
      } else {
        this.logger.error(`Failed to update recording status: ${errMsg}`);
      }
      // Don't throw — recording is optional, the bot will try to
      // fetch the recording from Online Meetings API after the call ends.
    }
  }

  /**
   * Fetch the meeting recording (MP4) from the Online Meetings Recordings API.
   * GET /users/{organizerId}/onlineMeetings/{meetingId}/recordings
   * GET /users/{organizerId}/onlineMeetings/{meetingId}/recordings/{id}/content
   *
   * Returns the MP4 buffer and filename, or null if no recording is available.
   */
  /**
   * Look up recording metadata (recordingId) from Graph without downloading content.
   * Returns just the IDs needed for streaming and the content URL for Whisper piping.
   */
  async getRecordingMeta(
    organizerId: string,
    onlineMeetingId: string,
  ): Promise<{ recordingId: string; contentUrl: string } | null> {
    this.logger.log(
      `Listing recordings for meeting ${onlineMeetingId} (organizer: ${organizerId})`,
    );

    try {
      const accessToken = await this.getAppAccessToken();
      const listUrl = `${this.graphBaseUrl}/users/${organizerId}/onlineMeetings/${onlineMeetingId}/recordings`;

      const listResponse = await this.httpClient.get(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        validateStatus: () => true,
      });

      this.logger.log(
        `Recordings list (${listResponse.status}): ${JSON.stringify(listResponse.data).slice(0, 500)}`,
      );

      if (
        listResponse.status !== 200 ||
        !listResponse.data?.value?.length
      ) {
        this.logger.log('No recordings found for this meeting');
        return null;
      }

      const recording = listResponse.data.value[0];
      const recordingId = recording.id;
      const contentUrl = `${listUrl}/${recordingId}/content`;

      return { recordingId, contentUrl };
    } catch (error: any) {
      this.logger.error(`getRecordingMeta error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a readable stream of the recording from Graph API.
   * Used for piping directly to Whisper (transcription) or to an HTTP response (playback).
   * Memory usage: only a small streaming buffer (~64KB), not the entire file.
   */
  async getRecordingStream(
    organizerId: string,
    onlineMeetingId: string,
    recordingId: string,
  ): Promise<{ stream: import('stream').Readable; contentLength?: number } | null> {
    try {
      const accessToken = await this.getAppAccessToken();
      const contentUrl = `${this.graphBaseUrl}/users/${organizerId}/onlineMeetings/${onlineMeetingId}/recordings/${recordingId}/content`;

      this.logger.log(`Opening recording stream from Graph: ${contentUrl}`);

      const response = await this.httpClient.get(contentUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'stream',
        timeout: 300000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        this.logger.error(`Recording stream failed (${response.status})`);
        // Consume and discard the error stream to avoid memory leaks
        response.data?.destroy?.();
        return null;
      }

      const contentLength = parseInt(response.headers['content-length'] || '0', 10) || undefined;
      this.logger.log(`Recording stream opened (content-length: ${contentLength || 'unknown'})`);

      return { stream: response.data, contentLength };
    } catch (error: any) {
      this.logger.error(`getRecordingStream error: ${error.message}`);
      return null;
    }
  }

  /**
   * Leave a call / hang up
   * DELETE /communications/calls/{callId}
   */
  async leaveMeeting(callId: string): Promise<void> {
    this.logger.log(`Bot leaving call ${callId}`);

    try {
      const accessToken = await this.getAppAccessToken();

      await this.httpClient.delete(
        `${this.graphBaseUrl}/communications/calls/${callId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const callState = this.activeCalls.get(callId);
      if (callState) {
        callState.status = BotStatus.LEAVING;
        callState.endedAt = new Date();
        this.activeCalls.set(callId, callState);
      }

      this.logger.log(`Bot left call ${callId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to leave call: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  /**
   * Send a chat message in the meeting thread.
   * Uses POST /chats/{threadId}/messages with application permissions.
   * Requires: Chat.Create or Chat.ReadWrite.All (Application) permission.
   */
  async sendMeetingChatMessage(threadId: string, message: string): Promise<void> {
    this.logger.log(`Sending chat message to thread ${threadId}`);

    try {
      const accessToken = await this.getAppAccessToken();

      await this.httpClient.post(
        `${this.graphBaseUrl}/chats/${threadId}/messages`,
        {
          body: {
            contentType: 'html',
            content: message,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Chat message sent to thread ${threadId}`);
    } catch (error: any) {
      const errMsg = error.response?.data?.error?.message || error.message;
      const code = error.response?.status;
      // Don't throw — chat message is best-effort, the bot still works without it
      this.logger.warn(
        `Failed to send chat message (${code}): ${errMsg}. ` +
        `Ensure the app has Chat.Create or ChatMessage.Send permission.`,
      );
    }
  }

  /**
   * Download call recording from Microsoft Graph
   * GET /communications/callRecords/{callId}/content
   */
  async downloadRecording(callId: string, contentLocation: string): Promise<Buffer> {
    this.logger.log(`Downloading recording for call ${callId}`);

    try {
      const accessToken = await this.getAppAccessToken();

      const response = await this.httpClient.get(contentLocation, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        responseType: 'arraybuffer',
      });

      this.logger.log(`Recording downloaded: ${response.data.length} bytes`);
      return Buffer.from(response.data);
    } catch (error: any) {
      this.logger.error(`Failed to download recording: ${error.message}`);
      throw new InternalServerErrorException('Failed to download recording');
    }
  }

  /**
   * Get the current state of an active call
   */
  getCallState(callId: string): BotCallState | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get call state by meeting ID
   */
  getCallStateByMeetingId(meetingId: string): BotCallState | undefined {
    for (const [, state] of this.activeCalls) {
      if (state.meetingId === meetingId) {
        return state;
      }
    }
    return undefined;
  }

  /**
   * Update call state (used by webhook handler)
   */
  updateCallState(callId: string, updates: Partial<BotCallState>): void {
    const state = this.activeCalls.get(callId);
    if (state) {
      Object.assign(state, updates);
      this.activeCalls.set(callId, state);
    }
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): BotCallState[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Remove a completed call from active tracking
   */
  removeCall(callId: string): void {
    this.activeCalls.delete(callId);
  }

  /**
   * Extract the organizer's tenant ID and user ID from the meeting URL context parameter.
   * Teams join URLs contain ?context={"Tid":"...","Oid":"..."}
   */
  private extractMeetingContext(meetingUrl: string): {
    organizerTenantId: string;
    organizerUserId: string;
  } {
    try {
      const decoded = decodeURIComponent(meetingUrl);
      const contextMatch = decoded.match(/context=(\{[^}]+\})/);
      if (contextMatch) {
        const context = JSON.parse(contextMatch[1]);
        return {
          organizerTenantId: context.Tid || this.tenantId,
          organizerUserId: context.Oid || '',
        };
      }
    } catch (e) {
      this.logger.warn(`Failed to parse meeting URL context: ${e}`);
    }
    return {
      organizerTenantId: this.tenantId,
      organizerUserId: '',
    };
  }

  /**
   * Extract thread ID from a Teams meeting join URL
   */
  private extractThreadIdFromUrl(meetingUrl: string): string {
    try {
      // Teams join URL format:
      // https://teams.microsoft.com/l/meetup-join/19%3ameeting_xxx%40thread.v2/0?context=...
      const decoded = decodeURIComponent(meetingUrl);
      const threadMatch = decoded.match(/19:meeting_[^/]+/);
      if (threadMatch) {
        return threadMatch[0];
      }

      // Try alternate format
      const altMatch = decoded.match(/19%3a[^/]+/);
      if (altMatch) {
        return decodeURIComponent(altMatch[0]);
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Extract meeting ID from a Teams join URL
   */
  private extractMeetingIdFromUrl(meetingUrl: string): string {
    try {
      const decoded = decodeURIComponent(meetingUrl);
      // Look for the meetup-join segment
      const match = decoded.match(/meetup-join\/([^/]+)/);
      if (match) {
        return match[1];
      }
      return '';
    } catch {
      return '';
    }
  }
}
