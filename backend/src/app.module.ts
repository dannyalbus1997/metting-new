import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { MeetingModule } from './meeting/meeting.module';
import { MicrosoftModule } from './microsoft/microsoft.module';
import { AiModule } from './ai/ai.module';
import { BotModule } from './bot/bot.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // MongoDB connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/sumsy',
        ),
      }),
    }),

    // Application modules
    AuthModule,
    UserModule,
    MeetingModule,
    MicrosoftModule,
    AiModule,
    BotModule,
    EmailModule,
  ],
})
export class AppModule {}
