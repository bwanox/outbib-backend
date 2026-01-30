import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MemoryService } from './memory/memory.service';

export interface ChatMessage {
  role: string;
  content: string;
}

export type AiAnswer = {
  answer: string;
  stage?: 'NEED_MORE' | 'ENOUGH';
  nextStep?: {
    prompt: string;
    options?: string[];
  } | null;
  keyPoints?: string[];
};

interface OpenRouterResponse {
  choices: { message: { content: string } }[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly models: string[];

  // Inject ConfigService to read .env safely
  constructor(private configService: ConfigService, private memoryService: MemoryService) {
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

  private readonly STYLE_PROMPT = `
Response style (strict):
- Start with a brief, reassuring summary (1–2 sentences). Do NOT diagnose.
- Provide 3–6 concrete self-care steps (bullets), tailored to the user’s symptoms.
- Include a "What to track today" mini-checklist (bullets).
- Include a "When to seek care" section with specific red flags.
- If any red flags are already present (e.g., fever + vision changes, severe/worst headache, confusion, neck stiffness, head injury), clearly recommend urgent care or emergency evaluation.
- Ask ONE next-step question only if more clarification is needed; otherwise set stage="ENOUGH".
`;

  private readonly JSON_INSTRUCTIONS = `
Respond with a JSON object and nothing else.
Schema:
{
  "answer": "string",
  "stage": "NEED_MORE | ENOUGH",
  "nextStep": {
    "prompt": "string",
    "options": ["string", "..."]
  } | null
  "keyPoints": ["string", "..."]
}
Rules:
- "answer" must be a single concise response with safety disclaimers when needed.
- "stage" must be "NEED_MORE" until you have enough clarifying info to give a complete response; use "ENOUGH" only when no more questions are needed.
- "nextStep.prompt" should ask one clear, specific question to guide the user step-by-step.
- "nextStep.options" is optional (0-4 short choices) and should be omitted if not helpful.
- If stage is "ENOUGH", set nextStep to the final check question: "Do you have any other questions for me right now?"
- "keyPoints" must be 1–6 short factual items provided by the user (symptoms, duration, severity, triggers, meds). If none, return [].
`;

  private readonly FINAL_CHECK_PROMPT = 'Do you have any other questions for me right now?';

  async getMedicalAdvice(history: ChatMessage[], userId?: string): Promise<AiAnswer> {
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
      { role: 'system', content: this.STYLE_PROMPT },
      { role: 'system', content: this.JSON_INSTRUCTIONS },
      ...sanitizedHistory,
    ];

    const context = this.parseContext(sanitizedHistory);
    if (context?.answeredNoToLastNextStep) {
      fullConversation.splice(3, 0, {
        role: 'system',
        content:
          'The user answered "no" to the previous next-step question. Do NOT repeat that question. Ask a different clarifying question or, if enough info, set stage="ENOUGH" and provide guidance.',
      });
    }

    if (context?.answeredNoToLastNextStep && context?.lastNextStepPrompt === this.FINAL_CHECK_PROMPT) {
      const summary = await this.generateSummary(sanitizedHistory);
      if (userId) {
        await this.memoryService.storeSummary(userId, summary);
        const title = await this.generateTitle(summary, sanitizedHistory);
        const transcript = this.buildChatTranscript(sanitizedHistory, summary);
        await this.memoryService.storeChat(userId, title, transcript);
      }
      return { answer: summary, stage: 'ENOUGH', nextStep: null, keyPoints: [] };
    }

    const chatId = context?.chatId;
    if (userId && chatId) {
      const chatMemory = await this.memoryService.getChatMemory(userId, chatId);
      if (chatMemory?.length) {
        fullConversation.splice(3, 0, {
          role: 'system',
          content: `Key points for this chat: ${chatMemory.map((m) => `- ${m}`).join('\n')}`,
        });
      }
    }

    if (userId) {
      const global = await this.memoryService.getMemoryDetail(userId);
      if (global.keypoints?.length) {
        fullConversation.splice(3, 0, {
          role: 'system',
          content: `Global user key points (reference only, with last update: ${
            global.updatedAt ?? 'unknown'
          }):\n${global.keypoints.map((m) => `- ${m}`).join('\n')}\nUse these ONLY if relevant to the current issue. Ignore unrelated or outdated points.`,
        });
      }
    }

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

        const content = response.data.choices[0].message.content ?? '';
        const parsed = this.safeParseJson(content);
        if (parsed?.answer) {
          const withKeyPoints = this.ensureKeyPoints(parsed, sanitizedHistory);
          const enforced = this.ensureNextStep(withKeyPoints, sanitizedHistory, context ?? undefined);
          if (userId && withKeyPoints.keyPoints?.length) {
            await this.memoryService.upsertMemory(userId, withKeyPoints.keyPoints);
            if (chatId) {
              await this.memoryService.upsertChatMemory(userId, chatId, withKeyPoints.keyPoints);
            }
          }
          return enforced;
        }
        const fallback = this.ensureKeyPoints({ answer: content.trim(), nextStep: null }, sanitizedHistory);
        if (userId && fallback.keyPoints?.length) {
          await this.memoryService.upsertMemory(userId, fallback.keyPoints);
          if (chatId) {
            await this.memoryService.upsertChatMemory(userId, chatId, fallback.keyPoints);
          }
        }
        return this.ensureNextStep(fallback, sanitizedHistory, context ?? undefined);
      } catch (error: any) {
        // FIX 2: Safe type casting to satisfy 'unsafe assignment' lint error
        const errorData = error.response as { status?: number; data?: any };
        const status = errorData?.status || 'Timeout/Network';

        this.logger.warn(`Skipping ${model} (${status})`);
      }
    }

    return {
      answer: 'I am currently unavailable due to high traffic. Please try again later.',
      stage: 'ENOUGH',
      nextStep: null,
    };
  }

  private safeParseJson(input: string): AiAnswer | null {
    try {
      const trimmed = input.trim();
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) return null;
      const slice = trimmed.slice(start, end + 1);
      const obj = JSON.parse(slice);
      if (typeof obj?.answer !== 'string') return null;
      const stage = obj.stage === 'ENOUGH' || obj.stage === 'NEED_MORE' ? obj.stage : undefined;
      if (obj.nextStep != null && typeof obj.nextStep !== 'object') return null;
      if (obj.nextStep?.prompt && typeof obj.nextStep.prompt !== 'string') return null;
      if (obj.nextStep?.options && !Array.isArray(obj.nextStep.options)) return null;
      const options = Array.isArray(obj.nextStep?.options)
        ? obj.nextStep.options.filter((s: any) => typeof s === 'string')
        : undefined;
      return {
        answer: obj.answer,
        stage,
        keyPoints: Array.isArray(obj.keyPoints) ? obj.keyPoints.filter((s: any) => typeof s === 'string') : [],
        nextStep: obj.nextStep?.prompt
          ? {
              prompt: obj.nextStep.prompt,
              options,
            }
          : null,
      };
    } catch {
      return null;
    }
  }

  private ensureNextStep(parsed: AiAnswer, history: ChatMessage[], context?: { answeredNoToLastNextStep?: boolean; lastNextStepPrompt?: string }): AiAnswer {
    if (parsed.stage === 'ENOUGH') {
      // Always ask final check question unless it was already asked and answered "no".
      if (context?.answeredNoToLastNextStep && context.lastNextStepPrompt === this.FINAL_CHECK_PROMPT) {
        return { ...parsed, nextStep: null };
      }
      return {
        ...parsed,
        nextStep: { prompt: this.FINAL_CHECK_PROMPT },
        stage: 'NEED_MORE',
      };
    }

    if (parsed.nextStep?.prompt) {
      return { ...parsed, stage: parsed.stage ?? 'NEED_MORE' };
    }

    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    const fallback = this.fallbackNextStep(lastUser);
    return {
      ...parsed,
      stage: 'NEED_MORE',
      nextStep: fallback,
    };
  }

  private ensureKeyPoints(parsed: AiAnswer, history: ChatMessage[]): AiAnswer {
    if (parsed.keyPoints && parsed.keyPoints.length) return parsed;

    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    const cleaned = lastUser.replace(/\s+/g, ' ').trim();
    const inferred = cleaned ? [cleaned.slice(0, 160)] : [];

    return {
      ...parsed,
      keyPoints: inferred,
    };
  }

  private fallbackNextStep(userText: string): { prompt: string; options?: string[] } {
    const t = userText.toLowerCase();
    if (t.includes('headache') || t.includes('head pain') || t.includes('migraine')) {
      return {
        prompt: 'How long has the headache been going on, and how severe is it from 0–10?',
        options: ['Just started', 'A few hours', '1–3 days', 'More than 3 days'],
      };
    }
    if (t.includes('stomach') || t.includes('nausea') || t.includes('diarr') || t.includes('vomit')) {
      return {
        prompt: 'Are you able to keep fluids down, and do you have fever or severe pain?',
        options: ['Can drink fluids', 'Hard to keep fluids', 'Fever present', 'Severe pain'],
      };
    }
    if (t.includes('cough') || t.includes('breath') || t.includes('chest')) {
      return {
        prompt: 'Any trouble breathing, chest pain, or fever right now?',
        options: ['No', 'Mild', 'Moderate', 'Severe'],
      };
    }
    return {
      prompt: 'How long has this been going on, and how severe is it from 0–10?',
      options: ['Just started', 'Hours', 'Days', 'Weeks+'],
    };
  }

  private parseContext(history: ChatMessage[]) {
    const contextMsg = history.find((m) => m.role === 'system' && m.content.startsWith('Context:'));
    if (!contextMsg) return null;
    try {
      const json = contextMsg.content.replace(/^Context:\s*/, '');
      return JSON.parse(json) as {
        answeredNoToLastNextStep?: boolean;
        lastNextStepPrompt?: string;
        resetMemory?: boolean;
        chatId?: string;
      };
    } catch {
      return null;
    }
  }

  private async generateSummary(history: ChatMessage[]): Promise<string> {
    const summaryPrompt = [
      { role: 'system', content: 'Summarize the user’s current state in 3–5 bullet points. No diagnosis. Include key symptoms, duration, severity, and any red flags mentioned.' },
      ...history.filter((m) => m.role !== 'system'),
    ];

    for (const model of this.models) {
      try {
        const response = await axios.post<OpenRouterResponse>(
          'https://openrouter.ai/api/v1/chat/completions',
          { model, messages: summaryPrompt },
          {
            headers: {
              Authorization: `Bearer ${this.configService.get<string>('OPENROUTER_API_KEY')}`,
              'HTTP-Referer': this.configService.get<string>('APP_URL'),
              'X-Title': this.configService.get<string>('APP_NAME'),
            },
            timeout: 5000,
          },
        );
        const content = response.data.choices[0].message.content ?? '';
        return content.trim() || 'Summary unavailable.';
      } catch {
        // try next model
      }
    }

    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    return lastUser ? `Summary: ${lastUser}` : 'Summary unavailable.';
  }

  private buildChatTranscript(history: ChatMessage[], summary: string) {
    const transcript = history.filter((m) => m.role !== 'system');
    if (summary) {
      transcript.push({ role: 'assistant', content: summary });
    }
    return transcript;
  }

  private async generateTitle(summary: string, history: ChatMessage[]): Promise<string> {
    const firstUser = history.find((m) => m.role === 'user')?.content ?? '';
    const prompt = [
      {
        role: 'system',
        content:
          'Create a short 3–6 word chat title that describes the user’s symptoms. No diagnosis. Respond with the title only.',
      },
      { role: 'user', content: `Symptoms summary:\n${summary}\n\nFirst user message:\n${firstUser}` },
    ];

    for (const model of this.models) {
      try {
        const response = await axios.post<OpenRouterResponse>(
          'https://openrouter.ai/api/v1/chat/completions',
          { model, messages: prompt },
          {
            headers: {
              Authorization: `Bearer ${this.configService.get<string>('OPENROUTER_API_KEY')}`,
              'HTTP-Referer': this.configService.get<string>('APP_URL'),
              'X-Title': this.configService.get<string>('APP_NAME'),
            },
            timeout: 4000,
          },
        );
        const content = response.data.choices[0].message.content ?? '';
        const title = content.trim().replace(/^["']|["']$/g, '').slice(0, 120);
        if (title) return title;
      } catch {
        // try next model
      }
    }

    const fallback = firstUser.replace(/\s+/g, ' ').trim().slice(0, 80);
    return fallback || 'Health chat';
  }
}
