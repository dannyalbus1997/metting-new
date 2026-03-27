import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Meeting, MeetingSchema } from './schemas/meeting.schema';
import { MeetingService } from './meeting.service';
import { MeetingController } from './meeting.controller';
import { MicrosoftModule } from '../microsoft/microsoft.module';
import { UserModule } from '../user/user.module';
import { AiModule } from '../ai/ai.module';
import { AiService } from '../ai/ai.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Meeting.name, schema: MeetingSchema }]),
    MicrosoftModule,
    UserModule,
    AiModule,
  ],
  controllers: [MeetingController],
  providers: [
    MeetingService,
    {
      provide: 'AI_SERVICE',
      useExisting: AiService,
    },
  ],
  exports: [MeetingService],
})
export class MeetingModule {}
