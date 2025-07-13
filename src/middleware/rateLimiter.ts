import rateLimit from 'express-rate-limit';
import { getRedis } from '@/config/redis';
import { logger } from '@/utils/logger';

// Create a Redis store for rate limiting
const createRedisStore = () => {
  const redis = getRedis();
  
  return {
    incr: async (key: string) => {
      const result = await redis.incr(key);
      if (result === 1) {
        await redis.expire(key, 900); // 15 minutes
      }
      return { totalHits: result, resetTime: new Date(Date.now() + 900000) };
    },
    decrement: async (key: string) => {
      await redis.decr(key);
    },
    resetKey: async (key: string) => {
      await redis.del(key);
    }
  };
};

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: async (req) => {
    // Get user from auth header if available
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        // Check if user has premium subscription
        // This would require decoding JWT and checking subscription
        // For now, return higher limit for authenticated users
        return parseInt(process.env.RATE_LIMIT_PREMIUM_MAX_REQUESTS || '1000');
      }
      
      return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    } catch (error) {
      return parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    }
  },
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore(),
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        // In a real implementation, decode JWT to get user ID
        return `rate_limit:${req.ip}:auth`;
      } catch (error) {
        return `rate_limit:${req.ip}`;
      }
    }
    return `rate_limit:${req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Specific rate limiter for AI chat endpoints
export const aiChatLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: async (req) => {
    // Implement subscription-based limits
    return 10; // Base limit
  },
  message: {
    success: false,
    message: 'AI chat rate limit exceeded. Please wait before sending another message.',
    retryAfter: '1 minute'
  }
});