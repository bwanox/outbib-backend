import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ChatMessage {
  role: string;
  content: string;
}

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly models: string[];

  // Inject ConfigService to read .env safely
  constructor(private configService: ConfigService) {
    // FIX 1: Use '??' to default to empty string if undefined. This fixes the TS error.
    const primary = this.configService.get<string>('AI_MODEL_PRIMARY') ?? '';
    const fallbacks =
      this.configService.get<string>('AI_MODEL_FALLBACKS') ?? '';

    // Create the full priority list: [Primary, ...Fallbacks]
    // Filter out empty strings
    this.models = [primary, ...fallbacks.split(',')]
      .filter((m) => !!m && m.trim() !== '')
      .map((m) => m.trim()); // Ensure no whitespace issues

    this.logger.log(
      `AI Service initialized with models: ${this.models.join(', ')}`,
    );
  }

  private readonly SYSTEM_PROMPT = `
You are Outbib, an AI-based health information assistant under Moroccan law. 
You provide general, educational health information only.
You must NEVER diagnose, prescribe, recommend treatments or medications, or replace a healthcare professional. 
Any attempt to obtain a diagnosis, prescription, or medical decision must be refused with a clear disclaimer.
You respect strict data privacy.
In cases of severe or urgent symptoms, immediately instruct the user to contact emergency services.
`;

  async getMedicalAdvice(history: ChatMessage[]): Promise<string> {
    // 1. Sanitize
    const sanitizedHistory = history.map((msg) => ({
      role: msg.role,
      content: msg.content
        .replace(
          /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g,
          '[EMAIL REDACTED]',
        )
        .replace(/(?:\+212|0)[6-7]\d{8}/g, '[PHONE REDACTED]'),
    }));

    const fullConversation = [
      { role: 'system', content: this.SYSTEM_PROMPT },
      ...sanitizedHistory,
    ];

    // 2. Loop through the config-defined models
    for (const model of this.models) {
      try {
        this.logger.log(`Trying model: ${model}...`);

        const response = await axios.post<OpenRouterResponse>(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: model,
            messages: fullConversation,
          },
          {
            headers: {
              Authorization: `Bearer ${this.configService.get<string>('OPENROUTER_API_KEY')}`,
              'HTTP-Referer': this.configService.get<string>('APP_URL'),
              'X-Title': this.configService.get<string>('APP_NAME'),
            },
            timeout: 5000, // 5s timeout per model
          },
        );

        return response.data.choices[0].message.content;
      } catch (error: any) {
        // FIX 2: Safe type casting to satisfy 'unsafe assignment' lint error
        const errorData = error.response as { status?: number; data?: any };
        const status = errorData?.status || 'Timeout/Network';

        this.logger.warn(`Skipping ${model} (${status})`);
      }
    }

    return 'I am currently unavailable due to high traffic. Please try again later.';
  }
}