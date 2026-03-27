import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { TranscriptionService } from './transcription.service';
import { MeetingModule } from '../meeting/meeting.module';
import { AiModule } from '../ai/ai.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MeetingModule,
    AiModule,
    UserModule,
    MulterModule.register({
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max upload
      },
    }),
  ],
  controllers: [BotController],
  providers: [BotService, TranscriptionService],
  exports: [BotService, TranscriptionService],
})
export class BotModule {}
