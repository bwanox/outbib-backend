import { Controller, Post, Body, BadRequestException, Get, Req, UseGuards, UnauthorizedException, Param } from '@nestjs/common';
import { AiService, ChatMessage } from './ai.service';
import { OptionalJwtAuthGuard } from './auth/optional-jwt-auth.guard';
import { MemoryService } from './memory/memory.service';

@Controller('ai')
export class AppController {
  constructor(private readonly aiService: AiService, private readonly memoryService: MemoryService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Post('chat')
  @UseGuards(OptionalJwtAuthGuard)
  async chat(@Req() req: any, @Body('messages') messages: ChatMessage[]) {
    const userId = req.user?.sub as string | undefined;
    return this.aiService.getMedicalAdvice(messages ?? [], userId);
  }

  @Post('query')
  @UseGuards(OptionalJwtAuthGuard)
  async query(
    @Body()
    body: {
      question?: string;
      messages?: ChatMessage[];
      language?: 'fr' | 'en' | 'ar';
      context?: Record<string, any>;
    },
    @Req() req: any
  ) {
    const userId = req.user?.sub as string | undefined;
    if (Array.isArray(body?.messages) && body.messages.length) {
      const messages: ChatMessage[] = body.messages;
      if (body.context) {
        messages.unshift({ role: 'system', content: `Context: ${JSON.stringify(body.context)}` });
      }
      return this.aiService.getMedicalAdvice(messages, userId);
    }

    const question = body?.question?.trim();
    if (!question) throw new BadRequestException('Missing question');

    const messages: ChatMessage[] = [];
    if (body?.context) {
      messages.push({ role: 'system', content: `Context: ${JSON.stringify(body.context)}` });
    }
    messages.push({ role: 'user', content: question });

    return this.aiService.getMedicalAdvice(messages, userId);
  }

  @Get('memory')
  @UseGuards(OptionalJwtAuthGuard)
  async memory(@Req() req: any) {
    const userId = req.user?.sub as string | undefined;
    if (!userId) return { keyPoints: [] };
    const keyPoints = await this.memoryService.getMemory(userId);
    return { userId, keyPoints };
  }

  @Get('chats')
  @UseGuards(OptionalJwtAuthGuard)
  async chats(@Req() req: any) {
    const userId = req.user?.sub as string | undefined;
    if (!userId) throw new UnauthorizedException('Missing user');
    const chats = await this.memoryService.listChats(userId);
    return { userId, chats };
  }

  @Get('chats/:id')
  @UseGuards(OptionalJwtAuthGuard)
  async chatById(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.sub as string | undefined;
    if (!userId) throw new UnauthorizedException('Missing user');
    const chatId = Number(id);
    if (!Number.isFinite(chatId)) throw new BadRequestException('Invalid chat id');
    const chat = await this.memoryService.getChat(userId, chatId);
    if (!chat) throw new BadRequestException('Chat not found');
    return { userId, chat };
  }
}
