import { Router } from 'express';
import { prisma } from '@/config/database';
import { authenticateToken, requireAdmin, AuthRequest } from '@/middleware/auth';
import { asyncHandler, createApiError } from '@/middleware/errorHandler';
import { paginationValidator } from '@/utils/validators';
import { logger } from '@/utils/logger';

const router = Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

// Get dashboard statistics
router.get('/dashboard', asyncHandler(async (req: AuthRequest, res) => {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalChatRooms,
    totalMessages,
    activeSubscriptions,
    newUsers,
    newUsersThisWeek,
    messagesThisMonth,
    aiMessagesThisMonth
  ] = await Promise.all([
    prisma.user.count(),
    prisma.chatRoom.count(),
    prisma.message.count(),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.message.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.message.count({ 
      where: { 
        createdAt: { gte: thirtyDaysAgo },
        sender: 'AI'
      }
    })
  ]);

  // Get subscription breakdown
  const subscriptionBreakdown = await prisma.subscription.groupBy({
    by: ['plan'],
    _count: { plan: true },
    where: { status: 'ACTIVE' }
  });

  // Get top active users
  const topUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      messageCount: true,
      lastLoginAt: true,
      subscription: {
        select: { plan: true }
      }
    },
    orderBy: { messageCount: 'desc' },
    take: 10
  });

  res.json({
    success: true,
    data: {
      overview: {
        totalUsers,
        totalChatRooms,
        totalMessages,
        activeSubscriptions
      },
      growth: {
        newUsers,
        newUsersThisWeek,
        messagesThisMonth,
        aiMessagesThisMonth
      },
      subscriptions: subscriptionBreakdown.map(sub => ({
        plan: sub.plan,
        count: sub._count.plan
      })),
      topUsers
    }
  });
}));

// Get all users with pagination
router.get('/users', paginationValidator, asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search as string;

  const whereClause = search ? {
    OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } }
    ]
  } as any : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      include: {
        subscription: true,
        _count: {
          select: {
            messages: true,
            chatRooms: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count({ where: whereClause })
  ]);

  res.json({
    success: true,
    data: {
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        messageCount: user.messageCount,
        chatRoomCount: user._count.chatRooms,
        subscription: user.subscription,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
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

// Update user status
router.put('/users/:userId/status', asyncHandler(async (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'];
  if (!validStatuses.includes(status)) {
    throw createApiError('Invalid status', 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      email: true,
      username: true,
      status: true
    }
  });

  logger.info('User status updated by admin:', { 
    adminId: req.user!.id, 
    userId, 
    newStatus: status 
  });

  res.json({
    success: true,
    message: 'User status updated successfully',
    data: { user }
  });
}));

// Update user role
router.put('/users/:userId/role', asyncHandler(async (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  const validRoles = ['USER', 'MODERATOR', 'ADMIN'];
  if (!validRoles.includes(role)) {
    throw createApiError('Invalid role', 400);
  }

  // Prevent self-demotion from admin
  if (userId === req.user!.id && role !== 'ADMIN') {
    throw createApiError('Cannot change your own admin role', 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      email: true,
      username: true,
      role: true
    }
  });

  logger.info('User role updated by admin:', { 
    adminId: req.user!.id, 
    userId, 
    newRole: role 
  });

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: { user }
  });
}));

// Get all chat rooms
router.get('/chat-rooms', paginationValidator, asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [chatRooms, total] = await Promise.all([
    prisma.chatRoom.findMany({
      include: {
        _count: {
          select: {
            members: true,
            messages: true
          }
        },
        members: {
          where: { role: 'OWNER' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          },
          take: 1
        }
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.chatRoom.count()
  ]);

  res.json({
    success: true,
    data: {
      chatRooms: chatRooms.map(room => ({
        ...room,
        memberCount: room._count.members,
        messageCount: room._count.messages,
        owner: room.members[0]?.user || null
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

// Deactivate chat room
router.put('/chat-rooms/:chatRoomId/deactivate', asyncHandler(async (req: AuthRequest, res) => {
  const { chatRoomId } = req.params;

  const chatRoom = await prisma.chatRoom.update({
    where: { id: chatRoomId },
    data: { isActive: false },
    select: {
      id: true,
      name: true,
      isActive: true
    }
  });

  logger.info('Chat room deactivated by admin:', { 
    adminId: req.user!.id, 
    chatRoomId 
  });

  res.json({
    success: true,
    message: 'Chat room deactivated successfully',
    data: { chatRoom }
  });
}));

// Get system logs
router.get('/logs', paginationValidator, asyncHandler(async (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;
  const level = req.query.level as string;

  const [logs, total] = await Promise.all([
    prisma.apiUsage.findMany({
      skip,
      take: limit,
      orderBy: { timestamp: 'desc' }
    }),
    prisma.apiUsage.count()
  ]);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Reset user's monthly usage
router.post('/users/:userId/reset-usage', asyncHandler(async (req: AuthRequest, res) => {
  const { userId } = req.params;

  await prisma.subscription.update({
    where: { userId },
    data: { messagesUsed: 0 }
  });

  logger.info('User usage reset by admin:', { 
    adminId: req.user!.id, 
    userId 
  });

  res.json({
    success: true,
    message: 'User usage reset successfully'
  });
}));

export default router;