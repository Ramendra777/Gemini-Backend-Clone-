import Redis from 'ioredis';
import { logger } from '@/utils/logger';

let redis: Redis;

export const connectRedis = async (): Promise<Redis> => {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    return redis;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

export const getRedis = (): Redis => {
  if (!redis) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redis;
};

export { redis };