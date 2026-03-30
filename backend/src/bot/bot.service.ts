/**
 * Graph Recording Service (formerly BotService)
 * Provides Microsoft Graph API authentication and recording stream access.
 * Used by MeetingController (recording playback) and TranscriptCronService (Whisper transcription).
 */

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly httpClient: AxiosInstance;
  private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenantId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET', '');
    this.tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID', '');
    this.tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    this.httpClient = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Get an application-level access token (client credentials flow).
   * Used for Graph API calls that require app-level permissions.
   */
  async getAppAccessToken(): Promise<string> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      });

      const response = await this.httpClient.post(this.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.data?.access_token) {
        throw new Error('No access token in response');
      }

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(`Failed to get app access token: ${error.message}`);
      throw new InternalServerErrorException('Failed to authenticate with Microsoft');
    }
  }

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
}
