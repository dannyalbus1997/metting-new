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
      "APP_URL",
      "http://localhost:3000",
    );
    this.senderEmail = this.configService.get<string>(
      "ECS_SENDER_EMAIL",
      "",
    );
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
        this.logger.log("Azure Communication Services Email client initialized");
      } catch (err: any) {
        this.logger.error(`Failed to initialize ACS Email client: ${err.message}`);
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
   * Find completed meetings that haven't had emails sent, send summary emails, mark as sent.
   */
  async processCompletedMeetings(): Promise<void> {
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
        const user = await this.userModel
          .findById(meeting.organizerId)
          .exec();

        if (!user || !user.email) {
          this.logger.warn(
            `No user/email for organizer ${meeting.organizerId} of meeting ${meeting._id}`,
          );
          meeting.emailSent = true;
          await meeting.save();
          continue;
        }

        const html = this.buildEmailHtml(meeting);

        const message = {
          senderAddress: this.senderEmail,
          content: {
            subject: `Meeting Summary: ${meeting.title}`,
            html: html,
          },
          recipients: {
            to: [
              {
                address: user.email,
                displayName: user.name || user.email,
              },
            ],
          },
        };

        const poller = await this.emailClient!.beginSend(message);
        const result = await poller.pollUntilDone();

        if (result.status === "Succeeded") {
          meeting.emailSent = true;
          await meeting.save();
          this.logger.log(
            `Email sent to ${user.email} for meeting "${meeting.title}"`,
          );
        } else {
          this.logger.error(
            `Email send failed for meeting ${meeting._id}: status=${result.status}`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to send email for meeting ${meeting._id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Build a rich HTML email with meeting summary, action items, decisions, next steps, and productivity.
   */
  private buildEmailHtml(meeting: MeetingDocument): string {
    const meetingUrl = `${this.appUrl}/meeting/${meeting._id}`;
    const date = new Date(meeting.startTime).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Productivity section
    const prod = (meeting as any).productivity;
    let productivityHtml = "";
    if (prod && prod.score != null) {
      const color =
        prod.score >= 80
          ? "#22c55e"
          : prod.score >= 60
            ? "#3b82f6"
            : prod.score >= 40
              ? "#f59e0b"
              : "#ef4444";
      productivityHtml = `
        <div style="margin: 24px 0; padding: 16px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${color};">
          <h3 style="margin: 0 0 8px 0; color: #1e293b;">Productivity Score: <span style="color: ${color};">${prod.score}%</span> &mdash; ${this.esc(prod.label)}</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
            <tr>
              <td style="padding: 4px 8px; color: #64748b; font-size: 13px;">On-Topic Focus</td>
              <td style="padding: 4px 8px; font-weight: 600; color: #1e293b; text-align: right;">${prod.breakdown?.onTopicScore ?? "-"}%</td>
              <td style="padding: 4px 8px; color: #64748b; font-size: 13px;">Decisions Made</td>
              <td style="padding: 4px 8px; font-weight: 600; color: #1e293b; text-align: right;">${prod.breakdown?.decisionsScore ?? "-"}%</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px; color: #64748b; font-size: 13px;">Action Items</td>
              <td style="padding: 4px 8px; font-weight: 600; color: #1e293b; text-align: right;">${prod.breakdown?.actionItemsScore ?? "-"}%</td>
              <td style="padding: 4px 8px; color: #64748b; font-size: 13px;">Participation</td>
              <td style="padding: 4px 8px; font-weight: 600; color: #1e293b; text-align: right;">${prod.breakdown?.participationScore ?? "-"}%</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px; color: #64748b; font-size: 13px;">Time Efficiency</td>
              <td style="padding: 4px 8px; font-weight: 600; color: #1e293b; text-align: right;">${prod.breakdown?.timeEfficiency ?? "-"}%</td>
              <td colspan="2"></td>
            </tr>
          </table>
          ${
            prod.highlights?.length
              ? `
            <div style="margin-top: 12px;">
              <strong style="color: #16a34a; font-size: 13px;">Highlights:</strong>
              <ul style="margin: 4px 0 0; padding-left: 20px; color: #475569; font-size: 13px;">
                ${prod.highlights.map((h: string) => `<li>${this.esc(h)}</li>`).join("")}
              </ul>
            </div>`
              : ""
          }
          ${
            prod.improvements?.length
              ? `
            <div style="margin-top: 8px;">
              <strong style="color: #d97706; font-size: 13px;">Suggestions:</strong>
              <ul style="margin: 4px 0 0; padding-left: 20px; color: #475569; font-size: 13px;">
                ${prod.improvements.map((i: string) => `<li>${this.esc(i)}</li>`).join("")}
              </ul>
            </div>`
              : ""
          }
        </div>`;
    }

    // Action items table
    const actionItems = meeting.actionItems || [];
    let actionItemsHtml = "";
    if (actionItems.length > 0) {
      const rows = actionItems
        .map(
          (item: any) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${this.esc(item.task)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; white-space: nowrap;">${this.esc(item.owner)}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; white-space: nowrap;">${this.esc(item.dueDate)}</td>
        </tr>`,
        )
        .join("");

      actionItemsHtml = `
        <div style="margin: 24px 0;">
          <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 16px;">Action Items</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 10px 12px; text-align: left; color: #475569; font-weight: 600;">Task</th>
                <th style="padding: 10px 12px; text-align: left; color: #475569; font-weight: 600;">Owner</th>
                <th style="padding: 10px 12px; text-align: left; color: #475569; font-weight: 600;">Due Date</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    // Decisions
    const decisions = meeting.decisions || [];
    let decisionsHtml = "";
    if (decisions.length > 0) {
      decisionsHtml = `
        <div style="margin: 24px 0;">
          <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 16px;">Key Decisions</h3>
          <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
            ${decisions.map((d: string) => `<li>${this.esc(d)}</li>`).join("")}
          </ol>
        </div>`;
    }

    // Next steps
    const nextSteps = meeting.nextSteps || [];
    let nextStepsHtml = "";
    if (nextSteps.length > 0) {
      nextStepsHtml = `
        <div style="margin: 24px 0;">
          <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 16px;">Next Steps</h3>
          <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
            ${nextSteps.map((s: string) => `<li>${this.esc(s)}</li>`).join("")}
          </ol>
        </div>`;
    }

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9;">
  <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
    <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); border-radius: 12px 12px 0 0; padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Meeting Summary</h1>
      <p style="margin: 8px 0 0; color: #bfdbfe; font-size: 14px;">${this.esc(meeting.title)}</p>
      <p style="margin: 4px 0 0; color: #93bbfd; font-size: 13px;">${date}</p>
    </div>
    <div style="background: #ffffff; padding: 24px; border-radius: 0 0 12px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 16px;">Summary</h3>
        <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.7;">
          ${this.esc(meeting.summary || "No summary available.")}
        </p>
      </div>
      ${productivityHtml}
      ${actionItemsHtml}
      ${decisionsHtml}
      ${nextStepsHtml}
      <div style="text-align: center; margin: 32px 0 16px;">
        <a href="${meetingUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
          View Full Details
        </a>
      </div>
    </div>
    <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 12px;">
      <p style="margin: 0;">Sent automatically by Sumsy</p>
    </div>
  </div>
</body>
</html>`;
  }

  private esc(text: string): string {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
