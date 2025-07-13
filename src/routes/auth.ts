import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { prisma } from '@/config/database';
import { asyncHandler, createApiError } from '@/middleware/errorHandler';
import { registerValidator, loginValidator } from '@/utils/validators';
import { logger } from '@/utils/logger';

const router = Router();

// Register
router.post('/register', registerValidator, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, username, password, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { username }
      ]
    }
  });

  if (existingUser) {
    throw createApiError('User with this email or username already exists', 400);
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user and subscription
  const user = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      subscription: {
        create: {
          plan: 'FREE',
          status: 'ACTIVE',
          monthlyMessageLimit: 50,
          messagesUsed: 0
        }
      }
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true
    }
  });

  logger.info('New user registered:', { userId: user.id, email: user.email });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: { user }
  });
}));

// Login
router.post('/login', loginValidator, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      subscription: true
    }
  });

  if (!user || user.status !== 'ACTIVE') {
    throw createApiError('Invalid credentials', 401);
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw createApiError('Invalid credentials', 401);
  }

  // Generate tokens
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  // Store refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt
    }
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  logger.info('User logged in:', { userId: user.id, email: user.email });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        subscription: user.subscription
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw createApiError('Refresh token required', 400);
  }

  // Verify refresh token
  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

  // Check if token exists in database
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true }
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw createApiError('Invalid or expired refresh token', 401);
  }

  // Generate new access token
  const accessToken = jwt.sign(
    { userId: storedToken.userId, email: storedToken.user.email, role: storedToken.user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  res.json({
    success: true,
    data: { accessToken }
  });
}));

// Logout
router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    // Remove refresh token from database
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken }
    });
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

export default router;