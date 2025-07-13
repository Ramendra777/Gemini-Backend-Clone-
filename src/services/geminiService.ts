import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/utils/logger';
import { prisma } from '@/config/database';

if (!process.env.GOOGLE_GEMINI_API_KEY) {
  throw new Error('GOOGLE_GEMINI_API_KEY is required');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);

export interface ChatResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export class GeminiService {
  private defaultModel = 'gemini-pro';
  
  async generateResponse(
    prompt: string,
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    try {
      const {
        model = this.defaultModel,
        temperature = 0.7,
        maxTokens = 2048,
        systemPrompt
      } = options;

      const geminiModel = genAI.getGenerativeModel({ model });
      
      // Prepare the full prompt with system message if provided
      const fullPrompt = systemPrompt 
        ? `${systemPrompt}\n\nUser: ${prompt}`
        : prompt;

      const result = await geminiModel.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      // Note: Gemini API doesn't provide token counts directly
      // These are estimates based on text length
      const promptTokens = Math.ceil(fullPrompt.length / 4);
      const completionTokens = Math.ceil(text.length / 4);

      logger.info('Gemini API response generated', {
        model,
        promptTokens,
        completionTokens,
        responseLength: text.length
      });

      return {
        content: text,
        promptTokens,
        completionTokens,
        model
      };

    } catch (error) {
      logger.error('Gemini API error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  async generateChatResponse(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    try {
      // Convert chat history to a single prompt
      const conversationHistory = messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop()?.content || '';
      
      const prompt = `${conversationHistory}\nUser: ${lastUserMessage}`;
      
      return await this.generateResponse(prompt, options);

    } catch (error) {
      logger.error('Chat response generation error:', error);
      throw new Error('Failed to generate chat response');
    }
  }

  async checkUsageQuota(userId: string): Promise<{ canUse: boolean; remaining: number }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });

      if (!user || !user.subscription) {
        return { canUse: false, remaining: 0 };
      }

      const { subscription } = user;
      const remaining = subscription.monthlyMessageLimit - subscription.messagesUsed;

      return {
        canUse: remaining > 0,
        remaining: Math.max(0, remaining)
      };

    } catch (error) {
      logger.error('Usage quota check error:', error);
      return { canUse: false, remaining: 0 };
    }
  }

  async incrementUsage(userId: string): Promise<void> {
    try {
      await prisma.subscription.update({
        where: { userId },
        data: {
          messagesUsed: {
            increment: 1
          }
        }
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          messageCount: {
            increment: 1
          }
        }
      });

    } catch (error) {
      logger.error('Usage increment error:', error);
      throw new Error('Failed to update usage statistics');
    }
  }

  async resetMonthlyUsage(): Promise<void> {
    try {
      await prisma.subscription.updateMany({
        data: {
          messagesUsed: 0
        }
      });

      logger.info('Monthly usage reset completed');

    } catch (error) {
      logger.error('Monthly usage reset error:', error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();