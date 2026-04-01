import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { EmailClient } from "@azure/communication-email";
import * as ejs from "ejs";
import * as path from "path";
import {
  Meeting,
  MeetingDocument,
  MeetingStatus,
} from "../meeting/schemas/meeting.schema";
import { User, UserDocument } from "../user/schemas/user.schema";

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private cronInterval: NodeJS.Timeout | null = null;
  private emailClient: EmailClient | null = null;

  // Config
  private readonly cronIntervalMs: number;
  private readonly appUrl: string;
  private readonly senderEmail: string;
  private readonly enabled: boolean;

  private readonly templatePath = path.join(
    __dirname,
    "templates",
    "meeting-summary.ejs",
  );

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    this.cronIntervalMs = Number(
      this.configService.get<string>("EMAIL_CRON_INTERVAL_MS", "60000"),
    );
    this.appUrl = this.configService.get<string>(
      "FRONTEND_URL",
      "http://localhost:3000",
    );
    this.senderEmail = this.configService.get<string>("ECS_SENDER_EMAIL", "");
    this.enabled =
      this.configService.get<string>("EMAIL_ENABLED", "false") === "true";

    // Initialize Azure Communication Services Email Client
    const connectionString = this.configService.get<string>(
      "ACS_CONNECTION_STRING",
      "",
    );

    if (connectionString) {
      try {
        this.emailClient = new EmailClient(connectionString);
        this.logger.log(
          "Azure Communication Services Email client initialized",
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to initialize ACS Email client: ${err.message}`,
        );
      }
    }
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn("Email cron job is DISABLED (EMAIL_ENABLED=false)");
      return;
    }

    if (!this.emailClient) {
      this.logger.warn(
        "Email cron job disabled — ACS_CONNECTION_STRING not configured",
      );
      return;
    }

    if (!this.senderEmail) {
      this.logger.warn(
        "Email cron job disabled — ECS_SENDER_EMAIL not configured",
      );
      return;
    }

    this.logger.log(
      `Email cron job started — checking every ${this.cronIntervalMs / 1000}s`,
    );
    this.cronInterval = setInterval(() => {
      this.processCompletedMeetings().catch((err) => {
        this.logger.error(`Cron job error: ${err.message}`);
      });
    }, this.cronIntervalMs);
  }

  onModuleDestroy() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.logger.log("Email cron job stopped");
    }
  }

  /**
   * Find completed meetings that haven't had emails sent, send summary emails.
   */
  async processCompletedMeetings(): Promise<void> {
    // Skip if no users with valid Microsoft tokens exist
    const hasTokenUsers = await this.userModel.exists({
      accessToken: { $ne: null, $exists: true },
      refreshToken: { $ne: null, $exists: true },
    });
    if (!hasTokenUsers) {
      this.logger.debug(
        "No users with tokens in DB — skipping email cron tick",
      );
      return;
    }

    const meetings = await this.meetingModel
      .find({
        status: MeetingStatus.COMPLETED,
        emailSent: { $ne: true },
        summary: { $ne: null, $exists: true },
      })
      .limit(10)
      .exec();

    if (meetings.length === 0) return;

    this.logger.log(
      `Found ${meetings.length} completed meeting(s) needing email`,
    );

    for (const meeting of meetings) {
      try {
        const user = await this.userModel.findById(meeting.organizerId).exec();

        if (!user || !user.email) {
          this.logger.warn(
            `No user/email for organizer ${meeting.organizerId} of meeting ${meeting._id}`,
          );
          meeting.emailSent = true;
          await meeting.save();
          continue;
        }

        const html = await this.buildEmailHtml(meeting);

        const recipients = [
          {
            name: user.name || user.email,
            email: "talha.wajdan@consultancyoutfit.co.uk",
          },
          {
            name: "azam altaf",
            email: "muhammadazam.altaf@consultancyoutfit.co.uk",
          },
        ];

        for (const recipient of recipients) {
          try {
            const message = {
              senderAddress: this.senderEmail,
              content: {
                subject: `Meeting Summary: ${meeting.title}`,
                html: html,
              },
              recipients: {
                to: [
                  {
                    address: recipient.email,
                    displayName: recipient.name || recipient.email,
                  },
                ],
              },
            };

            const poller = await this.emailClient!.beginSend(message);
            const result = await poller.pollUntilDone();

            if (result.status === "Succeeded") {
              this.logger.log(
                `Email sent to ${recipient.email} for meeting "${meeting.title}"`,
              );
            } else {
              this.logger.error(
                `Email send failed for ${recipient.email}, meeting ${meeting._id}: status=${result.status}`,
              );
            }
          } catch (recipientErr: any) {
            this.logger.error(
              `Failed to send email to ${recipient.email} for meeting ${meeting._id}: ${recipientErr.message}`,
            );
          }
        }

        meeting.emailSent = true;
        await meeting.save();
      } catch (err: any) {
        this.logger.error(
          `Failed to send email for meeting ${meeting._id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Build HTML email from EJS template.
   */
  private async buildEmailHtml(meeting: MeetingDocument): Promise<string> {
    const meetingUrl = `${this.appUrl}/meeting/${meeting._id}`;
    const startDate = new Date(meeting.startTime);
    const endDate = meeting.endTime ? new Date(meeting.endTime) : null;

    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Karachi",
    });
    const timeStr = startDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Karachi",
    });
    const endTimeStr = endDate
      ? endDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Karachi",
        })
      : "";
    const durationMs = endDate ? endDate.getTime() - startDate.getTime() : 0;
    const durationMin = durationMs > 0 ? Math.round(durationMs / 60000) : null;

    const participants = meeting.participants || [];
    const actionItems = meeting.actionItems || [];
    const decisions = meeting.decisions || [];
    const nextSteps = meeting.nextSteps || [];
    const productivity = (meeting as any).productivity;

    const timeDisplay =
      dateStr +
      (timeStr ? " &bull; " + timeStr : "") +
      (endTimeStr ? " - " + endTimeStr : "");

    return ejs.renderFile(this.templatePath, {
      title: meeting.title,
      timeDisplay,
      durationMin,
      participantCount: participants.length,
      actionItemCount: actionItems.length,
      decisionCount: decisions.length,
      participants,
      summary: meeting.summary,
      productivity,
      actionItems,
      decisions,
      nextSteps,
      meetingUrl,
    });
  }
}
