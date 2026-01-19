import { Controller, Post, Body } from '@nestjs/common';
import { AiService, ChatMessage } from './ai.service';

@Controller('ai')
export class AppController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body('messages') messages: ChatMessage[]) {
    return this.aiService.getMedicalAdvice(messages);
  }
}