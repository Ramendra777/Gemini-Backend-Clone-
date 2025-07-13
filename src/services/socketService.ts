import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { logger } from '@/utils/logger';
import { geminiService } from './geminiService';

interface SocketUser {
  id: string;
  email: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

interface Socket {
  id: string;
  handshake: {
    auth: {
      token?: string;
    };
  };
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, data: any) => void;
  to: (room: string) => any;
  broadcast: any;
  on: (event: string, handler: (data: any) => void) => void;
  disconnect: () => void;
}

const connectedUsers = new Map<string, string>(); // userId -> socketId

export const socketHandler = (io: Server) => {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      const user = await prisma.user.findUnique({
        where: { 
          id: decoded.userId,
          status: 'ACTIVE'
        },
        select: {
          id: true,
          email: true,
          role: true
        }
      });

      if (!user) {
        return next(new Error('Invalid token'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    if (!socket.user) return;

    const userId = socket.user.id;
    connectedUsers.set(userId, socket.id);

    logger.info(`User connected: ${socket.user.email} (${socket.id})`);

    // Join user's chat rooms
    joinUserChatRooms(socket);

    // Handle joining a chat room
    socket.on('join_room', async (data: { chatRoomId: string }) => {
      try {
        const { chatRoomId } = data;
        
        // Verify user is a member of the chat room
        const membership = await prisma.chatRoomMember.findFirst({
          where: {
            userId: socket.user!.id,
            chatRoomId
          }
        });

        if (!membership) {
          socket.emit('error', { message: 'Not authorized to join this room' });
          return;
        }

        socket.join(chatRoomId);
        socket.emit('joined_room', { chatRoomId });
        
      } catch (error) {
        logger.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Handle leaving a chat room
    socket.on('leave_room', (data: { chatRoomId: string }) => {
      const { chatRoomId } = data;
      socket.leave(chatRoomId);
      socket.emit('left_room', { chatRoomId });
    });

    // Handle sending a message
    socket.on('send_message', async (data: {
      chatRoomId: string;
      content: string;
      type?: string;
    }) => {
      try {
        const { chatRoomId, content, type = 'TEXT' } = data;

        // Verify user is a member of the chat room
        const membership = await prisma.chatRoomMember.findFirst({
          where: {
            userId: socket.user!.id,
            chatRoomId
          }
        });

        if (!membership) {
          socket.emit('error', { message: 'Not authorized to send messages to this room' });
          return;
        }

        // Create the message
        const message = await prisma.message.create({
          data: {
            content,
            type: type as any,
            sender: 'USER',
            userId: socket.user!.id,
            chatRoomId
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true
              }
            }
          }
        });

        // Broadcast message to all room members
        io.to(chatRoomId).emit('new_message', {
          id: message.id,
          content: message.content,
          type: message.type,
          sender: message.sender,
          user: message.user,
          createdAt: message.createdAt
        });

        // Check if AI should respond
        const chatRoom = await prisma.chatRoom.findUnique({
          where: { id: chatRoomId }
        });

        if (chatRoom?.allowAI && content.toLowerCase().includes('@ai')) {
          await handleAIResponse(chatRoomId, content, socket.user!.id);
        }

      } catch (error) {
        logger.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data: { chatRoomId: string }) => {
      socket.to(data.chatRoomId).emit('user_typing', {
        userId: socket.user!.id,
        username: socket.user!.email.split('@')[0]
      });
    });

    socket.on('typing_stop', (data: { chatRoomId: string }) => {
      socket.to(data.chatRoomId).emit('user_stop_typing', {
        userId: socket.user!.id
      });
    });

    // Handle AI chat request
    socket.on('ai_chat', async (data: {
      chatRoomId: string;
      message: string;
      context?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => {
      try {
        await handleAIResponse(data.chatRoomId, data.message, socket.user!.id, data.context);
      } catch (error) {
        logger.error('AI chat error:', error);
        socket.emit('error', { message: 'AI response failed' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      logger.info(`User disconnected: ${socket.user!.email} (${socket.id})`);
    });
  });

  // Helper function to join user's chat rooms
  async function joinUserChatRooms(socket: AuthenticatedSocket) {
    try {
      const userRooms = await prisma.chatRoomMember.findMany({
        where: { userId: socket.user!.id },
        select: { chatRoomId: true }
      });

      userRooms.forEach(room => {
        socket.join(room.chatRoomId);
      });

    } catch (error) {
      logger.error('Failed to join user chat rooms:', error);
    }
  }

  // Helper function to handle AI responses
  async function handleAIResponse(
    chatRoomId: string,
    userMessage: string,
    userId: string,
    context?: Array<{ role: 'user' | 'assistant'; content: string }>
  ) {
    try {
      // Check usage quota
      const quota = await geminiService.checkUsageQuota(userId);
      if (!quota.canUse) {
        io.to(chatRoomId).emit('ai_error', {
          message: 'AI usage quota exceeded. Please upgrade your subscription.'
        });
        return;
      }

      // Generate AI response
      let aiResponse;
      
      if (context && context.length > 0) {
        // Use conversation context
        aiResponse = await geminiService.generateChatResponse([
          ...context,
          { role: 'user', content: userMessage }
        ]);
      } else {
        // Single message response
        aiResponse = await geminiService.generateResponse(userMessage, {
          systemPrompt: 'You are a helpful AI assistant in a chat room. Be concise and friendly.'
        });
      }

      // Save AI message to database
      const aiMessage = await prisma.message.create({
        data: {
          content: aiResponse.content,
          type: 'TEXT',
          sender: 'AI',
          chatRoomId,
          aiModel: aiResponse.model,
          promptTokens: aiResponse.promptTokens,
          completionTokens: aiResponse.completionTokens
        }
      });

      // Increment usage
      await geminiService.incrementUsage(userId);

      // Broadcast AI response
      io.to(chatRoomId).emit('new_message', {
        id: aiMessage.id,
        content: aiMessage.content,
        type: aiMessage.type,
        sender: aiMessage.sender,
        aiModel: aiMessage.aiModel,
        createdAt: aiMessage.createdAt
      });

    } catch (error) {
      logger.error('AI response error:', error);
      io.to(chatRoomId).emit('ai_error', {
        message: 'Failed to generate AI response'
      });
    }
  }
};

export { connectedUsers };