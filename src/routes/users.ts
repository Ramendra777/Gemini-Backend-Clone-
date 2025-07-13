import { Router } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { prisma } from '@/config/database';
import { authenticateToken, AuthRequest } from '@/middleware/auth';
import { asyncHandler, createApiError } from '@/middleware/errorHandler';
import { updateProfileValidator } from '@/utils/validators';
import { logger } from '@/utils/logger';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get current user profile
router.get('/profile', asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      subscription: true
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      status: true,
      messageCount: true,
      lastLoginAt: true,
      createdAt: true,
      subscription: true
    }
  });

  if (!user) {
    throw createApiError('User not found', 404);
  }

  res.json({
    success: true,
    data: { user }
  });
}));

// Update user profile
router.put('/profile', updateProfileValidator, asyncHandler(async (req: AuthRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { firstName, lastName, username } = req.body;
  const updateData: any = {};

  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  
  if (username !== undefined) {
    // Check if username is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: req.user!.id }
      }
    });

    if (existingUser) {
      throw createApiError('Username already taken', 400);
    }

    updateData.username = username;
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
      updatedAt: true
    }
  });

  logger.info('User profile updated:', { userId: req.user!.id });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
}));

// Change password
router.put('/password', asyncHandler(async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw createApiError('Current password and new password are required', 400);
  }

  if (newPassword.length < 8) {
    throw createApiError('New password must be at least 8 characters long', 400);
  }

  // Get current user with password
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });

  if (!user) {
    throw createApiError('User not found', 404);
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password);
  if (!isValidPassword) {
    throw createApiError('Current password is incorrect', 400);
  }

  // Hash new password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { password: hashedPassword }
  });

  // Log out all sessions by deleting refresh tokens
  await prisma.refreshToken.deleteMany({
    where: { userId: req.user!.id }
  });

  logger.info('User password changed:', { userId: req.user!.id });

  res.json({
    success: true,
    message: 'Password changed successfully. Please log in again.'
  });
}));

// Get user statistics
router.get('/stats', asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      subscription: true,
      _count: {
        select: {
          messages: true,
          chatRooms: true
        }
      }
    }
  });

  if (!user) {
    throw createApiError('User not found', 404);
  }

  // Get additional stats
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const messagesThisMonth = await prisma.message.count({
    where: {
      userId: req.user!.id,
      createdAt: {
        gte: thisMonth
      }
    }
  });

  const aiMessagesCount = await prisma.message.count({
    where: {
      userId: req.user!.id,
      sender: 'AI'
    }
  });

  res.json({
    success: true,
    data: {
      totalMessages: user._count.messages,
      totalChatRooms: user._count.chatRooms,
      messagesThisMonth,
      aiMessagesGenerated: aiMessagesCount,
      subscription: {
        plan: user.subscription?.plan,
        status: user.subscription?.status,
        monthlyLimit: user.subscription?.monthlyMessageLimit,
        used: user.subscription?.messagesUsed,
        remaining: (user.subscription?.monthlyMessageLimit || 0) - (user.subscription?.messagesUsed || 0)
      }
    }
  });
}));

// Delete account
router.delete('/account', asyncHandler(async (req: AuthRequest, res) => {
  const { password } = req.body;

  if (!password) {
    throw createApiError('Password confirmation required', 400);
  }

  // Get current user with password
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id }
  });

  if (!user) {
    throw createApiError('User not found', 404);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw createApiError('Incorrect password', 400);
  }

  // Delete user (cascade will handle related records)
  await prisma.user.delete({
    where: { id: req.user!.id }
  });

  logger.info('User account deleted:', { userId: req.user!.id, email: user.email });

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
}));

export default router;