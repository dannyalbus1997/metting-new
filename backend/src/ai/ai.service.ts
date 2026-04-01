import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  AiProcessingResult,
  ActionItem,
  ProductivityAnalysis,
} from "./interfaces/ai.interfaces";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: "openai" | "anthropic";
  private readonly openaiClient: OpenAI;
  private readonly anthropicClient: Anthropic;

  constructor(private readonly configService: ConfigService) {
    const aiProvider = this.configService
      .get<string>("AI_PROVIDER", "openai")
      .toLowerCase();

    if (!["openai", "anthropic"].includes(aiProvider)) {
      throw new Error(
        `Invalid AI_PROVIDER: ${aiProvider}. Must be 'openai' or 'anthropic'`,
      );
    }

    this.provider = aiProvider as "openai" | "anthropic";

    // Initialize clients based on configuration
    if (this.provider === "openai") {
      this.openaiClient = new OpenAI({
        apiKey: this.configService.get<string>("OPENAI_API_KEY"),
      });
    }

    if (this.provider === "anthropic") {
      this.anthropicClient = new Anthropic({
        apiKey: this.configService.get<string>("ANTHROPIC_API_KEY"),
      });
    }

    this.logger.log(`AI Service initialized with provider: ${this.provider}`);
  }

  /**
   * Main entry point for processing meeting transcripts
   * Delegates to the configured AI provider
   */
  async processTranscript(transcript: string): Promise<AiProcessingResult> {
    if (!transcript || transcript.trim().length === 0) {
      throw new BadRequestException("Transcript cannot be empty");
    }

    try {
      this.logger.debug(`Processing transcript with ${this.provider} provider`);

      if (this.provider === "openai") {
        return await this.processWithOpenAI(transcript);
      } else {
        return await this.processWithAnthropic(transcript);
      }
    } catch (error) {
      this.logger.error(
        `Error processing transcript: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        "Failed to process meeting transcript",
      );
    }
  }

  /**
   * Process transcript using OpenAI's GPT-4 Turbo
   */
  private async processWithOpenAI(
    transcript: string,
  ): Promise<AiProcessingResult> {
    const { systemPrompt, userPrompt } = this.buildPrompt(transcript);

    const response = await this.openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const responseText = response.choices[0]?.message?.content;
    console.log(responseText);
    if (!responseText) {
      throw new InternalServerErrorException(
        "No response received from OpenAI",
      );
    }

    return this.parseAiResponse(responseText);
  }

  /**
   * Process transcript using Anthropic's Claude Sonnet
   */
  private async processWithAnthropic(
    transcript: string,
  ): Promise<AiProcessingResult> {
    const { systemPrompt, userPrompt } = this.buildPrompt(transcript);

    const response = await this.anthropicClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const responseText =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!responseText) {
      throw new InternalServerErrorException(
        "No response received from Anthropic",
      );
    }

    return this.parseAiResponse(responseText);
  }

  /**
   * Translate a transcript to English using the configured AI provider
   */
  async translateTranscript(
    transcript: string,
    targetLanguage: string = "English",
  ): Promise<string> {
    if (!transcript || transcript.trim().length === 0) {
      throw new BadRequestException("Transcript cannot be empty");
    }

    try {
      this.logger.debug(
        `Translating transcript to ${targetLanguage} with ${this.provider}`,
      );

      const systemPrompt = `You are a professional translator. Translate the following meeting transcript into ${targetLanguage}.
Rules:
- Preserve the original speaker labels and formatting exactly (e.g., "Speaker 1:", timestamps, etc.)
- Translate ONLY the spoken content, not the labels or timestamps
- Maintain the meaning, tone, and context accurately
- If parts are already in ${targetLanguage}, keep them as-is
- Do NOT add any commentary, notes, or explanations
- Return ONLY the translated transcript`;

      const userPrompt = `Translate this transcript to ${targetLanguage}:\n\n${transcript}`;

      if (this.provider === "openai") {
        const response = await this.openaiClient.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        });
        return response.choices[0]?.message?.content?.trim() || "";
      } else {
        const response = await this.anthropicClient.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        return response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "";
      }
    } catch (error) {
      this.logger.error(`Translation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException("Failed to translate transcript");
    }
  }

  /**
   * Build the system and user prompts for meeting analysis
   */
  private buildPrompt(transcript: string): {
    systemPrompt: string;
    userPrompt: string;
  } {
  const systemPrompt = `
You are an expert meeting analyst. Your task is to evaluate a meeting transcript and return structured insights along with a fair productivity assessment.

You will be provided with a meeting transcript and must return a JSON object with the following structure:

{
  "summary": "15-20 sentence summary covering purpose, discussion, and outcomes",

  "actionItems": [
    {
      "task": "Clear action item",
      "owner": "Name/role or 'TBD'",
      "dueDate": "YYYY-MM-DD or 'Not specified'"
    }
  ],

  "decisions": [
    "Clear decisions made during the meeting"
  ],

  "nextSteps": [
    "Logical next steps based on discussion"
  ],

  "productivity": {
    "score": 0-100,
    "label": "Highly Productive | Productive | Moderate | Needs Improvement | Unproductive",

    "breakdown": {
      "onTopicScore": 0-100,
      "decisionsScore": 0-100,
      "actionItemsScore": 0-100,
      "participationScore": 0-100,
      "timeEfficiency": 0-100
    },

    "highlights": [
      "2-3 things done well"
    ],

    "improvements": [
      "2-3 specific improvements"
    ]
  }
}

SCORING RULES:

1. Do NOT default to 0 unless the transcript is empty or meaningless.

2. Use realistic baselines:
   - If people discussed relevant topics → minimum 50
   - If outcomes or alignment exist → 60–75
   - If clear decisions and actions exist → 75+

3. Score each area based on evidence:
   - productivity → focus and usefulness of discussion
   - decisions → clarity and number of decisions
   - actionItems → presence and quality of tasks
   - participation → involvement of multiple people
   - timeEfficiency → relevance vs wasted discussion

4. Partial credit is allowed:
   - If something is implied but not explicit, still give moderate score (50–70)

5. Missing details should NOT heavily penalize:
   - No owner or deadline ≠ zero
   - No formal agenda ≠ unproductive

6. Keep scores balanced:
   - Most meetings fall between 55–85

7. Label mapping:
   - 80–100 → Highly Productive
   - 60–79 → Productive
   - 40–59 → Moderate
   - 20–39 → Needs Improvement
   - 0–19 → Unproductive

FINAL INSTRUCTION:
Be fair and practical. If the meeting had useful discussion or progress, reflect that in the score.
`;

    const userPrompt = `Please analyze the following meeting transcript and return the structured JSON analysis:

---TRANSCRIPT START---
${transcript}
---TRANSCRIPT END---

Return the JSON object with the analysis. Ensure all JSON is valid and properly formatted.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Parse and validate the AI response
   * Includes fallback error handling for malformed JSON
   */
  private parseAiResponse(response: string): AiProcessingResult {
    try {
      // Handle potential markdown code blocks from response
      let jsonString = response.trim();

      if (jsonString.startsWith("```json")) {
        jsonString = jsonString
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
      } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(jsonString) as AiProcessingResult;

      // Validate required fields
      if (!parsed.summary || typeof parsed.summary !== "string") {
        throw new Error("Invalid or missing summary field");
      }

      if (!Array.isArray(parsed.actionItems)) {
        throw new Error("actionItems must be an array");
      }

      if (!Array.isArray(parsed.decisions)) {
        throw new Error("decisions must be an array");
      }

      if (!Array.isArray(parsed.nextSteps)) {
        throw new Error("nextSteps must be an array");
      }

      // Validate action items structure
      for (const item of parsed.actionItems) {
        if (!item.task || !item.owner || !item.dueDate) {
          throw new Error(
            "Each action item must have task, owner, and dueDate fields",
          );
        }
      }

      // Parse productivity analysis with safe defaults
      const rawProd = parsed.productivity || {};
      const breakdown = rawProd.breakdown || {};
      const productivity: ProductivityAnalysis = {
        score: Math.min(100, Math.max(0, Number(rawProd.score) || 0)),
        label: rawProd.label || "Moderate",
        breakdown: {
          onTopicScore: Math.min(
            100,
            Math.max(0, Number(breakdown.onTopicScore) || 0),
          ),
          decisionsScore: Math.min(
            100,
            Math.max(0, Number(breakdown.decisionsScore) || 0),
          ),
          actionItemsScore: Math.min(
            100,
            Math.max(0, Number(breakdown.actionItemsScore) || 0),
          ),
          participationScore: Math.min(
            100,
            Math.max(0, Number(breakdown.participationScore) || 0),
          ),
          timeEfficiency: Math.min(
            100,
            Math.max(0, Number(breakdown.timeEfficiency) || 0),
          ),
        },
        highlights: Array.isArray(rawProd.highlights) ? rawProd.highlights : [],
        improvements: Array.isArray(rawProd.improvements)
          ? rawProd.improvements
          : [],
      };

      return {
        summary: parsed.summary.trim(),
        actionItems: parsed.actionItems.map((item: ActionItem) => ({
          task: item.task.trim(),
          owner: item.owner.trim(),
          dueDate: item.dueDate.trim(),
        })),
        decisions: parsed.decisions.map((d: string) =>
          typeof d === "string" ? d.trim() : String(d),
        ),
        nextSteps: parsed.nextSteps.map((step: string) =>
          typeof step === "string" ? step.trim() : String(step),
        ),
        productivity,
      };
    } catch (error) {
      this.logger.error(
        `Failed to parse AI response: ${error.message}`,
        response,
      );
      throw new InternalServerErrorException(
        `Failed to parse AI response: ${error.message}. Please try again.`,
      );
    }
  }
}
