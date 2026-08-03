import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;

// Fallback in-memory map for environments without Redis (Note: Resets on serverless cold starts)
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();

export async function checkRateLimit(req: NextRequest, limit: number, windowMs: number): Promise<boolean> {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
  
  if (redis) {
    try {
      const key = `ratelimit:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      return count <= limit;
    } catch (err) {
      console.warn("Redis rate limit error, falling back to memory:", err);
    }
  }
  
  // In-memory fallback
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || record.resetTime < now) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}
