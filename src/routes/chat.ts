import { Router } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '@/config/database';
import { authenticateToken, AuthRequest } from '@/middleware/auth';
import { aiChatLimiter } from '@/middleware/rateLimiter';
import { asyncHandler, createApiError } from '@/middleware/errorHandler';
import { 
  createChatRoomValidator, 
  sendMessageValidator, 
  chatRoomIdValidator,
  paginationValidator 
} from '@/utils/validators';
import { geminiService } from '@/services/geminiService';
import { logger } from '@/utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get user's chat rooms
router.get('/', paginationValidator, asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const chatRooms = await prisma.chatRoomMember.findMany({
    where: { userId: req.user!.id },
    include: {
      chatRoom: {
        include: {
          _count: {
            select: {
              members: true,
              messages: true
            }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      }
    },
    skip,
    take: limit,
    orderBy: { joinedAt: 'desc' }
  });

  const total = await prisma.chatRoomMember.count({
    where: { userId: req.user!.id }
  });

  res.json({
    success: true,
    data: {
      chatRooms: chatRooms.map(member => ({
        ...member.chatRoom,
        memberCount: member.chatRoom._count.members,
        messageCount: member.chatRoom._count.messages,
        lastMessage: member.chatRoom.messages[0] || null,
        memberRole: member.role,
        joinedAt: member.joinedAt
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Create a new chat room
router.post('/', createChatRoomValidator, asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, description, type = 'PRIVATE', maxMembers = 10 } = req.body;

  const chatRoom = await prisma.chatRoom.create({
    data: {
      name,
      description,
      type,
      maxMembers,
      members: {
        create: {
          userId: req.user!.id,
          role: 'OWNER'
        }
      }
    },
    include: {
      _count: {
        select: { members: true }
      }
    }
  });

  logger.info('Chat room created:', { chatRoomId: chatRoom.id, userId: req.user!.id });

  res.status(201).json({
    success: true,
    message: 'Chat room created successfully',
    data: { chatRoom }
  });
}));

// Get chat room details
router.get('/:chatRoomId', chatRoomIdValidator, asyncHandler(async (req: AuthRequest, res) => {
  const { chatRoomId } = req.params;

  // Verify user is a member
  const membership = await prisma.chatRoomMember.findFirst({
    where: {
      userId: req.user!.id,
      chatRoomId
    }
  });

  if (!membership) {
    throw createApiError('Chat room not found or access denied', 404);
  }

  const chatRoom = await prisma.chatRoom.findUnique({
    where: { id: chatRoomId },
    include: {
      members: {
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
      },
      _count: {
        select: { messages: true }
      }
    }
  });

  res.json({
    success: true,
    data: { chatRoom }
  });
}));

// Get chat room messages
router.get('/:chatRoomId/messages', 
  chatRoomIdValidator, 
  paginationValidator, 
  asyncHandler(async (req: AuthRequest, res) => {
    const { chatRoomId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    // Verify user is a member
    const membership = await prisma.chatRoomMember.findFirst({
      where: {
        userId: req.user!.id,
        chatRoomId
      }
    });

    if (!membership) {
      throw createApiError('Chat room not found or access denied', 404);
    }

    const messages = await prisma.message.findMany({
      where: { chatRoomId },
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
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    const total = await prisma.message.count({
      where: { chatRoomId }
    });

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Reverse to show oldest first
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

// Send a message
router.post('/:chatRoomId/messages', 
  chatRoomIdValidator,
  sendMessageValidator,
  asyncHandler(async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { chatRoomId } = req.params;
    const { content, type = 'TEXT' } = req.body;

    // Verify user is a member
    const membership = await prisma.chatRoomMember.findFirst({
      where: {
        userId: req.user!.id,
        chatRoomId
      }
    });

    if (!membership) {
      throw createApiError('Chat room not found or access denied', 404);
    }

    const message = await prisma.message.create({
      data: {
        content,
        type,
        sender: 'USER',
        userId: req.user!.id,
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

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message }
    });
  })
);

// AI Chat endpoint
router.post('/:chatRoomId/ai-chat', 
  chatRoomIdValidator,
  aiChatLimiter,
  asyncHandler(async (req: AuthRequest, res) => {
    const { chatRoomId } = req.params;
    const { message, context, model = 'gemini-pro' } = req.body;

    if (!message) {
      throw createApiError('Message content is required', 400);
    }

    // Verify user is a member and room allows AI
    const membership = await prisma.chatRoomMember.findFirst({
      where: {
        userId: req.user!.id,
        chatRoomId
      },
      include: {
        chatRoom: true
      }
    });

    if (!membership) {
      throw createApiError('Chat room not found or access denied', 404);
    }

    if (!membership.chatRoom.allowAI) {
      throw createApiError('AI is not enabled for this chat room', 403);
    }

    // Check usage quota
    const quota = await geminiService.checkUsageQuota(req.user!.id);
    if (!quota.canUse) {
      throw createApiError('AI usage quota exceeded. Please upgrade your subscription.', 429);
    }

    try {
      // Generate AI response
      let aiResponse;
      
      if (context && Array.isArray(context)) {
        aiResponse = await geminiService.generateChatResponse([
          ...context,
          { role: 'user', content: message }
        ], { model });
      } else {
        aiResponse = await geminiService.generateResponse(message, {
          model,
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
      await geminiService.incrementUsage(req.user!.id);

      res.json({
        success: true,
        data: {
          message: aiMessage,
          usage: {
            remaining: quota.remaining - 1,
            promptTokens: aiResponse.promptTokens,
            completionTokens: aiResponse.completionTokens
          }
        }
      });

    } catch (error) {
      logger.error('AI chat error:', error);
      throw createApiError('Failed to generate AI response', 500);
    }
  })
);

// Join a chat room
router.post('/:chatRoomId/join', chatRoomIdValidator, asyncHandler(async (req: AuthRequest, res) => {
  const { chatRoomId } = req.params;

  const chatRoom = await prisma.chatRoom.findUnique({
    where: { id: chatRoomId },
    include: {
      _count: {
        select: { members: true }
      }
    }
  });

  if (!chatRoom) {
    throw createApiError('Chat room not found', 404);
  }

  if (chatRoom.type === 'PRIVATE') {
    throw createApiError('Cannot join private chat room', 403);
  }

  if (chatRoom._count.members >= chatRoom.maxMembers) {
    throw createApiError('Chat room is full', 403);
  }

  // Check if already a member
  const existingMembership = await prisma.chatRoomMember.findFirst({
    where: {
      userId: req.user!.id,
      chatRoomId
    }
  });

  if (existingMembership) {
    throw createApiError('Already a member of this chat room', 400);
  }

  await prisma.chatRoomMember.create({
    data: {
      userId: req.user!.id,
      chatRoomId,
      role: 'MEMBER'
    }
  });

  res.json({
    success: true,
    message: 'Successfully joined chat room'
  });
}));

// Leave a chat room
router.post('/:chatRoomId/leave', chatRoomIdValidator, asyncHandler(async (req: AuthRequest, res) => {
  const { chatRoomId } = req.params;

  const membership = await prisma.chatRoomMember.findFirst({
    where: {
      userId: req.user!.id,
      chatRoomId
    }
  });

  if (!membership) {
    throw createApiError('Not a member of this chat room', 404);
  }

  if (membership.role === 'OWNER') {
    // Transfer ownership or delete room logic here
    throw createApiError('Room owner cannot leave. Please transfer ownership first.', 400);
  }

  await prisma.chatRoomMember.delete({
    where: { id: membership.id }
  });

  res.json({
    success: true,
    message: 'Successfully left chat room'
  });
}));

export default router;