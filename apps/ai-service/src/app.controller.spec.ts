import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AiService } from './ai.service';

describe('AppController', () => {
  let appController: AppController;
  let aiService: AiService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AiService,
          useValue: {
            // Mock the service to return a fake string
            getMedicalAdvice: jest.fn().mockResolvedValue('Mock AI Response'),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    aiService = app.get<AiService>(AiService);
  });

  describe('chat', () => {
    it('should return AI advice', async () => {
      // 1. Create a fake chat history (Array)
      const mockMessages = [{ role: 'user', content: 'Hello' }];
      
      // 2. Call the controller
      const result = await appController.chat(mockMessages);
      
      // 3. Expect the result
      expect(result).toBe('Mock AI Response');
      // 4. Verify the service was called with our array
      expect(aiService.getMedicalAdvice).toHaveBeenCalledWith(mockMessages);
    });
  });
});