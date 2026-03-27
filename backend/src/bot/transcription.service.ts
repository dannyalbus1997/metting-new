/**
 * Transcription Service
 * Converts audio recordings to text using OpenAI Whisper API
 * Supports both buffer-based (for manual uploads) and stream-based
 * (for Graph API recordings) transcription — no files saved to disk.
 */

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import * as path from 'path';
import { Readable } from 'stream';
import { TranscriptionResult } from './interfaces/bot.interfaces';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly openaiApiKey: string;
  private readonly openaiModel: string;

  constructor(private readonly configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.openaiModel = this.configService.get<string>('WHISPER_MODEL', 'whisper-1');
  }

  /**
   * Transcribe an audio buffer using OpenAI Whisper API.
   * Used for manual uploads where the buffer is already in memory.
   * Supports mp3, mp4, mpeg, mpga, m4a, wav, webm formats.
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    filename: string = 'recording.wav',
    language?: string,
  ): Promise<TranscriptionResult> {
    this.logger.log(`Transcribing audio buffer: ${filename} (${audioBuffer.length} bytes)`);

    // Convert buffer to a readable stream and pipe to Whisper
    const stream = Readable.from(audioBuffer);
    return this.transcribeFromStream(stream, filename, language);
  }

  /**
   * Transcribe audio from a readable stream — piped directly to OpenAI Whisper.
   * No file is saved to disk, no full buffer is held in memory.
   * The stream is piped into a multipart form upload to Whisper.
   *
   * This is the core method — used by both buffer-based and stream-based callers.
   */
  async transcribeFromStream(
    audioStream: Readable,
    filename: string = 'recording.mp4',
    language?: string,
  ): Promise<TranscriptionResult> {
    this.logger.log(`Transcribing from stream: ${filename}`);

    if (!this.openaiApiKey) {
      throw new InternalServerErrorException(
        'OpenAI API key not configured. Set OPENAI_API_KEY in .env',
      );
    }

    try {
      // Build multipart form data — the stream is piped directly, not buffered
      const formData = new FormData();
      formData.append('file', audioStream, {
        filename,
        contentType: this.getContentType(filename),
      });
      formData.append('model', this.openaiModel);
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      if (language) {
        formData.append('language', language);
      }

      // Call OpenAI Whisper API — stream is piped directly into the HTTP request
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            ...formData.getHeaders(),
          },
          // maxContentLength: 100 * 1024 * 1024, // 100MB max
          // maxBodyLength: 100 * 1024 * 1024,
          timeout: 300000, // 5 min timeout for large files
        },
      );

      const result: TranscriptionResult = {
        text: response.data.text || '',
        language: response.data.language || language || 'en',
        duration: response.data.duration || 0,
        segments: (response.data.segments || []).map((seg: any, idx: number) => ({
          id: seg.id || idx,
          start: seg.start || 0,
          end: seg.end || 0,
          text: seg.text || '',
          speaker: seg.speaker || undefined,
        })),
      };

      this.logger.log(
        `Transcription complete: ${result.text.length} chars, ${result.segments.length} segments, ${result.duration}s`,
      );

      return result;
    } catch (error: any) {
      const errMsg = error.response?.data?.error?.message || error.message;
      this.logger.error(`Transcription failed: ${errMsg}`);
      throw new InternalServerErrorException(`Transcription failed: ${errMsg}`);
    }
  }

  /**
   * Format transcript segments into readable text with timestamps
   */
  formatTranscript(result: TranscriptionResult): string {
    if (!result.segments || result.segments.length === 0) {
      return result.text;
    }

    return result.segments
      .map((seg) => {
        const startTime = this.formatTimestamp(seg.start);
        const endTime = this.formatTimestamp(seg.end);
        const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
        return `[${startTime} → ${endTime}] ${speaker}${seg.text.trim()}`;
      })
      .join('\n');
  }

  /**
   * Format seconds into HH:MM:SS
   */
  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Get content type from filename
   */
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.mp4': 'audio/mp4',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
    };
    return contentTypes[ext] || 'audio/wav';
  }
}
