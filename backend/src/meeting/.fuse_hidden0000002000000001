/**
 * Meeting Sync Cron Service
 * Automatically syncs calendar meetings from Microsoft Graph for all users.
 *
 * Flow:
 *  1. Cron runs on a configurable interval (MEETING_SYNC_CRON_INTERVAL_MS env var)
 *  2. Iterates over all registered users with valid Microsoft tokens
 *  3. Fetches calendar events from Graph API (past 7 days + 1 day ahead)
 *  4. Creates new meetings or updates existing ones in MongoDB
 *  5. Handles token refresh automatically when access tokens expire
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Meeting,
  MeetingDocument,
  MeetingStatus,
} from './schemas/meeting.schema';
import { MeetingService } from './meeting.service';
import { UserService } from '../user/user.service';
import { MicrosoftService } from '../microsoft/microsoft.service';

@Injectable()
export class MeetingSyncCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingSyncCronService.name);
  private cronInterval: NodeJS.Timeout | null = null;

  private readonly cronIntervalMs: number;
  private readonly syncPastDays: number;
  private readonly syncFutureDays: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    private readonly meetingService: MeetingService,
    private readonly userService: UserService,
    private readonly microsoftService: MicrosoftService,
  ) {
    this.cronIntervalMs = Number(
      this.configService.get<string>('MEETING_SYNC_CRON_INTERVAL_MS', '60000'),
    );
    this.syncPastDays = Number(
      this.configService.get<string>('MEETING_SYNC_PAST_DAYS', '7'),
    );
    this.syncFutureDays = Number(
      this.configService.get<string>('MEETING_SYNC_FUTURE_DAYS', '1'),
    );
  }

  onModuleInit() {
    const enabled =
      this.configService.get<string>('MEETING_SYNC_ENABLED', 'true') === 'true';

    if (!enabled) {
      this.logger.warn('Meeting sync cron is DISABLED (MEETING_SYNC_ENABLED=false)');
      return;
    }

    this.logger.log(
      `Meeting sync cron started — every ${this.cronIntervalMs / 1000}s, ` +
      `range: past ${this.syncPastDays}d + future ${this.syncFutureDays}d`,
    );

    // Run once on startup after a short delay
    setTimeout(() => {
      this.syncAllUsers().catch((err) => {
        this.logger.error(`Initial sync error: ${err.message}`);
      });
    }, 10000);

    this.cronInterval = setInterval(() => {
      this.syncAllUsers().catch((err) => {
        this.logger.error(`Sync cron error: ${err.message}`);
      });
    }, this.cronIntervalMs);
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.logger.log('Meeting sync cron stopped');
    }
  }

  // ─── MAIN LOOP ───

  private async syncAllUsers(): Promise<void> {
    let users;
    try {
      users = await this.userService.findAll();
    } catch (err: any) {
      this.logger.error(`Failed to fetch users: ${err.message}`);
      return;
    }

    // Only sync users that have Microsoft tokens
    const eligibleUsers = users.filter(
      (u) => u.accessToken && u.refreshToken,
    );

    if (eligibleUsers.length === 0) return;

    this.logger.log(`Syncing meetings for ${eligibleUsers.length} user(s)...`);

    let totalSynced = 0;
    let totalEvents = 0;

    for (const user of eligibleUsers) {
      try {
        const result = await this.syncForUser(user);
        totalSynced += result.synced;
        totalEvents += result.total;
      } catch (err: any) {
        this.logger.warn(
          `Sync failed for user ${user.email || user._id}: ${err.message}`,
        );
      }
    }

    if (totalSynced > 0 || totalEvents > 0) {
      this.logger.log(
        `Sync complete: ${totalSynced} new meetings from ${totalEvents} events across ${eligibleUsers.length} user(s)`,
      );
    }
  }

  // ─── PER-USER SYNC ───

  private async syncForUser(
    user: any,
  ): Promise<{ synced: number; total: number }> {
    const userId = String(user._id);
    let msAccessToken = user.accessToken;

    // Build date range
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - this.syncPastDays);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + this.syncFutureDays);

    // Fetch calendar events
    let events;
    try {
      events = await this.microsoftService.getCalendarView(
        msAccessToken,
        startDate.toISOString(),
        endDate.toISOString(),
      );
    } catch (error: any) {
      // Token expired — try refreshing
      if (
        error.status === 401 ||
        error.message?.includes('expired') ||
        error.message?.includes('invalid')
      ) {
        try {
          const newToken = await this.microsoftService.handleTokenRefresh(
            user.refreshToken,
          );
          msAccessToken = newToken;
          await this.userService.updateTokens(
            userId,
            newToken,
            user.refreshToken,
          );
          events = await this.microsoftService.getCalendarView(
            newToken,
            startDate.toISOString(),
            endDate.toISOString(),
          );
        } catch {
          this.logger.warn(
            `Token refresh failed for user ${user.email || userId} — skipping`,
          );
          return { synced: 0, total: 0 };
        }
      } else {
        throw error;
      }
    }

    if (!events || events.length === 0) {
      return { synced: 0, total: 0 };
    }

    let synced = 0;

    const toDateString = (dt: any): string => {
      if (typeof dt === 'string') return dt;
      if (dt?.dateTime) return dt.dateTime;
      return new Date().toISOString();
    };

    for (const event of events) {
      const microsoftEventId = event.id;
      const startStr = toDateString(event.start);
      const endStr = toDateString(event.end);
      const participants = (event.attendees || []).map((a: any) => ({
        name: a.emailAddress?.name || a.emailAddress?.address || 'Unknown',
        email: a.emailAddress?.address || '',
      }));

      const onlineMeetingUrl =
        event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || null;
      const isOnline = !!event.isOnlineMeeting || !!onlineMeetingUrl;
      const location = event.location?.displayName || null;

      // Check if meeting already exists
      const existingMeeting =
        await this.meetingService.findByMicrosoftEventId(microsoftEventId);

      if (existingMeeting) {
        // Update existing meeting metadata
        existingMeeting.title = event.subject || 'Untitled Meeting';
        existingMeeting.startTime = new Date(startStr);
        existingMeeting.endTime = new Date(endStr);
        existingMeeting.participants = participants;
        if (onlineMeetingUrl)
          existingMeeting.onlineMeetingUrl = onlineMeetingUrl;
        existingMeeting.isOnline = isOnline;
        if (location) existingMeeting.location = location;
        await existingMeeting.save();
      } else {
        try {
          const newMeeting = new this.meetingModel({
            title: event.subject || 'Untitled Meeting',
            startTime: new Date(startStr),
            endTime: new Date(endStr),
            microsoftEventId,
            organizerId: new Types.ObjectId(userId),
            participants,
            onlineMeetingUrl,
            isOnline,
            location,
            status: MeetingStatus.PENDING,
          });
          await newMeeting.save();
          synced++;
        } catch (saveError: any) {
          // Skip duplicates silently
          if (saveError.code !== 11000) {
            this.logger.warn(
              `Failed to save meeting "${event.subject}": ${saveError.message}`,
            );
          }
        }
      }
    }

    return { synced, total: events.length };
  }
}
