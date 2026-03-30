import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { TranscriptionService } from './transcription.service';

/**
 * Bot Module — provides Graph API recording access and Whisper transcription.
 * No longer contains a controller or meeting-join logic.
 * Used by MeetingModule for recording streaming and transcript fetching.
 */
@Module({
  providers: [BotService, TranscriptionService],
  exports: [BotService, TranscriptionService],
})
export class BotModule {}
