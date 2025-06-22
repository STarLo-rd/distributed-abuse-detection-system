import { createClient, RedisClientType } from 'redis';
import { configManager } from '../config';
import { logger } from '../logger';
import { DatabaseError } from '../types';

/**
 * Cache Manager - Singleton Pattern
 * Manages Redis connections for caching, rate limiting, and distributed locking
 */
export class CacheManager {
  private static instance: CacheManager;
  private client: RedisClientType;
  private isConnected = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    const redisConfig = configManager.getRedisConfig();
    
    this.client = createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: 10000,
        lazyConnect: true,
      },
      password: redisConfig.password,
      database: redisConfig.db,
      name: 'abuse-detection-system',
    });

    this.setupEventHandlers();
  }

  /**
   * Get singleton instance of CacheManager
   * @returns {CacheManager} The singleton instance
   */
  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Connect to Redis server
   * @returns {Promise<void>} Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info('Redis cache connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis cache', error as Error);
      throw new DatabaseError('Failed to connect to Redis cache');
    }
  }

  /**
   * Disconnect from Redis server
   * @returns {Promise<void>} Promise that resolves when disconnected
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Redis cache disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from Redis cache', error as Error);
    }
  }

  /**
   * Set a value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {string} value - Cache value
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>} Promise that resolves when set
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;
    const ttl = ttlSeconds || redisConfig.ttl;

    try {
      if (ttl > 0) {
        await this.client.setEx(prefixedKey, ttl, value);
      } else {
        await this.client.set(prefixedKey, value);
      }
      
      logger.debug('Cache value set successfully', { key: prefixedKey, ttl });
    } catch (error) {
      logger.error('Failed to set cache value', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to set cache value for key ${key}`);
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<string | null>} Cache value or null if not found
   */
  public async get(key: string): Promise<string | null> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;

    try {
      const value = await this.client.get(prefixedKey);
      logger.debug('Cache value retrieved', { key: prefixedKey, found: !!value });
      return value;
    } catch (error) {
      logger.error('Failed to get cache value', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to get cache value for key ${key}`);
    }
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<number>} Number of keys deleted
   */
  public async delete(key: string): Promise<number> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;

    try {
      const result = await this.client.del(prefixedKey);
      logger.debug('Cache value deleted', { key: prefixedKey, deleted: result });
      return result;
    } catch (error) {
      logger.error('Failed to delete cache value', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to delete cache value for key ${key}`);
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  public async exists(key: string): Promise<boolean> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;

    try {
      const result = await this.client.exists(prefixedKey);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check cache key existence', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to check existence of cache key ${key}`);
    }
  }

  /**
   * Increment a numeric value in cache
   * @param {string} key - Cache key
   * @param {number} increment - Increment amount (default: 1)
   * @returns {Promise<number>} New value after increment
   */
  public async increment(key: string, increment = 1): Promise<number> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;

    try {
      const result = await this.client.incrBy(prefixedKey, increment);
      logger.debug('Cache value incremented', { key: prefixedKey, increment, newValue: result });
      return result;
    } catch (error) {
      logger.error('Failed to increment cache value', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to increment cache value for key ${key}`);
    }
  }

  /**
   * Set expiration time for a key
   * @param {string} key - Cache key
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<boolean>} True if expiration was set
   */
  public async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}${key}`;

    try {
      const result = await this.client.expire(prefixedKey, ttlSeconds);
      logger.debug('Cache key expiration set', { key: prefixedKey, ttl: ttlSeconds, success: result });
      return result;
    } catch (error) {
      logger.error('Failed to set cache key expiration', {
        key: prefixedKey,
        error: error as Error,
      });
      throw new DatabaseError(`Failed to set expiration for cache key ${key}`);
    }
  }

  /**
   * Implement token bucket rate limiting
   * @param {string} identifier - Rate limit identifier (e.g., user ID, IP)
   * @param {number} maxTokens - Maximum tokens in bucket
   * @param {number} refillRate - Tokens refilled per second
   * @param {number} tokensRequested - Tokens requested for this operation
   * @returns {Promise<boolean>} True if request is allowed
   */
  public async rateLimitCheck(
    identifier: string,
    maxTokens: number,
    refillRate: number,
    tokensRequested = 1
  ): Promise<boolean> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();

    try {
      const bucketData = await this.get(key);
      let tokens = maxTokens;
      let lastRefill = now;

      if (bucketData) {
        const parsed = JSON.parse(bucketData);
        tokens = parsed.tokens;
        lastRefill = parsed.lastRefill;

        // Calculate tokens to add based on time elapsed
        const timeElapsed = (now - lastRefill) / 1000;
        const tokensToAdd = Math.floor(timeElapsed * refillRate);
        tokens = Math.min(maxTokens, tokens + tokensToAdd);
      }

      // Check if enough tokens available
      if (tokens >= tokensRequested) {
        tokens -= tokensRequested;
        
        // Update bucket
        await this.set(
          key,
          JSON.stringify({ tokens, lastRefill: now }),
          Math.ceil(maxTokens / refillRate) * 2 // TTL: 2x time to fill bucket
        );

        logger.debug('Rate limit check passed', {
          identifier,
          tokensRemaining: tokens,
          tokensRequested,
        });

        return true;
      }

      logger.debug('Rate limit check failed', {
        identifier,
        tokensAvailable: tokens,
        tokensRequested,
      });

      return false;
    } catch (error) {
      logger.error('Rate limit check failed', {
        identifier,
        error: error as Error,
      });
      // Fail open - allow request if rate limiting fails
      return true;
    }
  }

  /**
   * Acquire distributed lock
   * @param {string} lockKey - Lock key
   * @param {number} ttlSeconds - Lock TTL in seconds
   * @param {string} lockValue - Unique lock value
   * @returns {Promise<boolean>} True if lock acquired
   */
  public async acquireLock(lockKey: string, ttlSeconds: number, lockValue: string): Promise<boolean> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}lock:${lockKey}`;

    try {
      const result = await this.client.set(prefixedKey, lockValue, {
        EX: ttlSeconds,
        NX: true,
      });

      const acquired = result === 'OK';
      logger.debug('Distributed lock acquisition attempt', {
        lockKey: prefixedKey,
        acquired,
        ttl: ttlSeconds,
      });

      return acquired;
    } catch (error) {
      logger.error('Failed to acquire distributed lock', {
        lockKey: prefixedKey,
        error: error as Error,
      });
      return false;
    }
  }

  /**
   * Release distributed lock
   * @param {string} lockKey - Lock key
   * @param {string} lockValue - Lock value to verify ownership
   * @returns {Promise<boolean>} True if lock released
   */
  public async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    const redisConfig = configManager.getRedisConfig();
    const prefixedKey = `${redisConfig.keyPrefix}lock:${lockKey}`;

    try {
      // Lua script to atomically check and delete lock
      const luaScript = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.client.eval(luaScript, {
        keys: [prefixedKey],
        arguments: [lockValue],
      }) as number;

      const released = result === 1;
      logger.debug('Distributed lock release attempt', {
        lockKey: prefixedKey,
        released,
      });

      return released;
    } catch (error) {
      logger.error('Failed to release distributed lock', {
        lockKey: prefixedKey,
        error: error as Error,
      });
      return false;
    }
  }

  /**
   * Get cache connection status
   * @returns {boolean} True if connected
   */
  public isCacheConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Setup event handlers for Redis client
   * @private
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis cache client connecting');
    });

    this.client.on('ready', () => {
      logger.info('Redis cache client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis cache client error', { error: error.message });
    });

    this.client.on('end', () => {
      logger.info('Redis cache client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis cache client reconnecting');
    });
  }
}

/**
 * Export singleton instance
 */
export const cache = CacheManager.getInstance(); 