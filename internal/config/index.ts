/// <reference types="node" />
import { config } from 'dotenv';
import { IAppConfig, IKafkaConfig, IDatabaseConfig, IRedisConfig, IMLConfig, ISecurityConfig } from '../types';

// Load environment variables
config();

/**
 * Configuration Manager - Singleton Pattern
 * Manages all application configuration with type safety and validation
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private readonly appConfig: IAppConfig;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.appConfig = this.loadConfiguration();
    this.validateConfiguration();
  }

  /**
   * Get singleton instance of ConfigManager
   * @returns {ConfigManager} The singleton instance
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get application configuration
   * @returns {IAppConfig} Complete application configuration
   */
  public getConfig(): IAppConfig {
    return this.appConfig;
  }

  /**
   * Get Kafka configuration
   * @returns {IKafkaConfig} Kafka configuration
   */
  public getKafkaConfig(): IKafkaConfig {
    return this.appConfig.kafka;
  }

  /**
   * Get database configuration
   * @returns {IDatabaseConfig} Database configuration
   */
  public getDatabaseConfig(): IDatabaseConfig {
    return this.appConfig.database;
  }

  /**
   * Get Redis configuration
   * @returns {IRedisConfig} Redis configuration
   */
  public getRedisConfig(): IRedisConfig {
    return this.appConfig.redis;
  }

  /**
   * Get ML configuration
   * @returns {IMLConfig} ML configuration
   */
  public getMLConfig(): IMLConfig {
    return this.appConfig.ml;
  }

  /**
   * Get security configuration
   * @returns {ISecurityConfig} Security configuration
   */
  public getSecurityConfig(): ISecurityConfig {
    return this.appConfig.security;
  }

  /**
   * Load configuration from environment variables
   * @returns {IAppConfig} Loaded configuration
   * @private
   */
  private loadConfiguration(): IAppConfig {
    return {
      port: this.getEnvAsNumber('PORT', 3000),
      environment: this.getEnvAsString('NODE_ENV', 'development'),
      logLevel: this.getEnvAsString('LOG_LEVEL', 'info'),
      kafka: this.loadKafkaConfig(),
      database: this.loadDatabaseConfig(),
      redis: this.loadRedisConfig(),
      ml: this.loadMLConfig(),
      security: this.loadSecurityConfig(),
    };
  }

  /**
   * Load Kafka configuration
   * @returns {IKafkaConfig} Kafka configuration
   * @private
   */
  private loadKafkaConfig(): IKafkaConfig {
    const brokers = this.getEnvAsString('KAFKA_BROKERS', 'localhost:9092').split(',');
    const sslEnabled = this.getEnvAsBoolean('KAFKA_SSL_ENABLED', false);
    const saslEnabled = this.getEnvAsBoolean('KAFKA_SASL_ENABLED', false);

         const kafkaConfig: IKafkaConfig = {
       brokers,
       clientId: this.getEnvAsString('KAFKA_CLIENT_ID', 'abuse-detection-system'),
       groupId: this.getEnvAsString('KAFKA_GROUP_ID', 'moderation-workers'),
       topics: {
         rawContent: this.getEnvAsString('KAFKA_TOPIC_RAW_CONTENT', 'raw-content'),
         moderationResults: this.getEnvAsString('KAFKA_TOPIC_MODERATION_RESULTS', 'moderation-results'),
         flaggedContent: this.getEnvAsString('KAFKA_TOPIC_FLAGGED_CONTENT', 'flagged-content'),
         deadLetter: this.getEnvAsString('KAFKA_TOPIC_DEAD_LETTER', 'dead-letter'),
       },
       ssl: sslEnabled,
     };

     if (saslEnabled) {
       (kafkaConfig as { sasl?: { mechanism: string; username: string; password: string } }).sasl = {
         mechanism: this.getEnvAsString('KAFKA_SASL_MECHANISM', 'plain'),
         username: this.getEnvAsString('KAFKA_SASL_USERNAME'),
         password: this.getEnvAsString('KAFKA_SASL_PASSWORD'),
       };
     }

    return kafkaConfig;
  }

  /**
   * Load database configuration
   * @returns {IDatabaseConfig} Database configuration
   * @private
   */
  private loadDatabaseConfig(): IDatabaseConfig {
    return {
      host: this.getEnvAsString('DB_HOST', 'localhost'),
      port: this.getEnvAsNumber('DB_PORT', 5432),
      database: this.getEnvAsString('DB_NAME', 'abuse_detection'),
      username: this.getEnvAsString('DB_USERNAME', 'postgres'),
      password: this.getEnvAsString('DB_PASSWORD', 'password'),
      ssl: this.getEnvAsBoolean('DB_SSL', false),
      maxConnections: this.getEnvAsNumber('DB_MAX_CONNECTIONS', 20),
      connectionTimeout: this.getEnvAsNumber('DB_CONNECTION_TIMEOUT', 30000),
    };
  }

  /**
   * Load Redis configuration
   * @returns {IRedisConfig} Redis configuration
   * @private
   */
  private loadRedisConfig(): IRedisConfig {
    return {
      host: this.getEnvAsString('REDIS_HOST', 'localhost'),
      port: this.getEnvAsNumber('REDIS_PORT', 6379),
      password: this.getEnvAsString('REDIS_PASSWORD'),
      db: this.getEnvAsNumber('REDIS_DB', 0),
      keyPrefix: this.getEnvAsString('REDIS_KEY_PREFIX', 'ads:'),
      ttl: this.getEnvAsNumber('REDIS_TTL', 3600),
    };
  }

  /**
   * Load ML configuration
   * @returns {IMLConfig} ML configuration
   * @private
   */
  private loadMLConfig(): IMLConfig {
    return {
      textModel: {
        path: this.getEnvAsString('ML_TEXT_MODEL_PATH', './models/text-toxicity.onnx'),
        version: this.getEnvAsString('ML_TEXT_MODEL_VERSION', '1.0.0'),
        threshold: this.getEnvAsNumber('ML_TEXT_THRESHOLD', 0.8),
        enabled: this.getEnvAsBoolean('ML_TEXT_ENABLED', true),
      },
      imageModel: {
        path: this.getEnvAsString('ML_IMAGE_MODEL_PATH', './models/image-nsfw.onnx'),
        version: this.getEnvAsString('ML_IMAGE_MODEL_VERSION', '1.0.0'),
        threshold: this.getEnvAsNumber('ML_IMAGE_THRESHOLD', 0.7),
        enabled: this.getEnvAsBoolean('ML_IMAGE_ENABLED', true),
      },
      audioModel: {
        path: this.getEnvAsString('ML_AUDIO_MODEL_PATH', './models/audio-classification.onnx'),
        version: this.getEnvAsString('ML_AUDIO_MODEL_VERSION', '1.0.0'),
        threshold: this.getEnvAsNumber('ML_AUDIO_THRESHOLD', 0.75),
        enabled: this.getEnvAsBoolean('ML_AUDIO_ENABLED', true),
      },
      batchSize: this.getEnvAsNumber('ML_BATCH_SIZE', 32),
      maxProcessingTime: this.getEnvAsNumber('ML_MAX_PROCESSING_TIME', 5000),
    };
  }

  /**
   * Load security configuration
   * @returns {ISecurityConfig} Security configuration
   * @private
   */
  private loadSecurityConfig(): ISecurityConfig {
    return {
      jwtSecret: this.getEnvAsString('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production'),
      jwtExpiration: this.getEnvAsString('JWT_EXPIRATION', '24h'),
      bcryptRounds: this.getEnvAsNumber('BCRYPT_ROUNDS', 12),
      rateLimits: {
        windowMs: this.getEnvAsNumber('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
        maxRequests: this.getEnvAsNumber('RATE_LIMIT_MAX_REQUESTS', 100),
        skipSuccessfulRequests: this.getEnvAsBoolean('RATE_LIMIT_SKIP_SUCCESS', false),
      },
    };
  }

  /**
   * Get environment variable as string
   * @param {string} key - Environment variable key
   * @param {string} defaultValue - Default value if not found
   * @returns {string} Environment variable value
   * @private
   */
  private getEnvAsString(key: string, defaultValue = ''): string {
    const value = process.env[key];
    if (!value && !defaultValue) {
      throw new Error(`Environment variable ${key} is required but not set`);
    }
    return value || defaultValue;
  }

  /**
   * Get environment variable as number
   * @param {string} key - Environment variable key
   * @param {number} defaultValue - Default value if not found
   * @returns {number} Environment variable value as number
   * @private
   */
  private getEnvAsNumber(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Environment variable ${key} is required but not set`);
      }
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid number`);
    }
    return parsed;
  }

  /**
   * Get environment variable as boolean
   * @param {string} key - Environment variable key
   * @param {boolean} defaultValue - Default value if not found
   * @returns {boolean} Environment variable value as boolean
   * @private
   */
  private getEnvAsBoolean(key: string, defaultValue = false): boolean {
    const value = process.env[key];
    if (!value) {
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Validate configuration values
   * @throws {Error} If configuration is invalid
   * @private
   */
  private validateConfiguration(): void {
    // Validate port range
    if (this.appConfig.port < 1 || this.appConfig.port > 65535) {
      throw new Error('Port must be between 1 and 65535');
    }

    // Validate Kafka brokers
    if (!this.appConfig.kafka.brokers.length) {
      throw new Error('At least one Kafka broker must be configured');
    }

    // Validate database connection parameters
    if (!this.appConfig.database.host) {
      throw new Error('Database host is required');
    }

    // Validate Redis connection parameters
    if (!this.appConfig.redis.host) {
      throw new Error('Redis host is required');
    }

    // Validate JWT secret in production
    if (this.appConfig.environment === 'production' && 
        this.appConfig.security.jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
      throw new Error('JWT secret must be changed in production environment');
    }

    // Validate ML thresholds
    const { textModel, imageModel, audioModel } = this.appConfig.ml;
    if (textModel.threshold < 0 || textModel.threshold > 1) {
      throw new Error('Text model threshold must be between 0 and 1');
    }
    if (imageModel.threshold < 0 || imageModel.threshold > 1) {
      throw new Error('Image model threshold must be between 0 and 1');
    }
    if (audioModel.threshold < 0 || audioModel.threshold > 1) {
      throw new Error('Audio model threshold must be between 0 and 1');
    }
  }
}

/**
 * Export singleton instance
 */
export const configManager = ConfigManager.getInstance(); 