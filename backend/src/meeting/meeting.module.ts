import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { MeetingService } from './meeting.service';
import { MeetingController } from './meeting.controller';
import { TranscriptCronService } from './transcript-cron.service';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { UserModule } from '../user/user.module';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    MicrosoftModule,
    UserModule,
    AiModule,
    forwardRef(() => BotModule),
  ],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    TranscriptCronService,
    {
      provide: 'AI_SERVICE',
      useExisting: AiService,
    },
  ],
  exports: [MeetingService, TranscriptCronService],
})
export class MeetingModule {}
