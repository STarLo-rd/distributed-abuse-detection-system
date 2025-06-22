/**
 * Core type definitions for the Abuse Detection System
 */

/// <reference types="node" />

/**
 * Content types supported by the moderation system
 */
export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

/**
 * Moderation result status
 */
export enum ModerationStatus {
  CLEAN = 'clean',
  FLAGGED = 'flagged',
  BLOCKED = 'blocked',
  NEEDS_REVIEW = 'needs_review',
  PENDING = 'pending',
}

/**
 * Severity levels for flagged content
 */
export enum SeverityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Base content event interface
 */
export interface IContentEvent {
  readonly id: string;
  readonly userId: string;
  readonly contentType: ContentType;
  readonly content: string | Buffer;
  readonly metadata: IContentMetadata;
  readonly timestamp: Date;
  readonly source: string;
}

/**
 * Content metadata interface
 */
export interface IContentMetadata {
  readonly size: number;
  readonly mimeType?: string;
  readonly language?: string;
  readonly clientIp?: string;
  readonly userAgent?: string;
  readonly sessionId?: string;
  readonly additionalData?: Record<string, unknown>;
}

/**
 * Moderation result interface
 */
export interface IModerationResult {
  readonly contentId: string;
  readonly status: ModerationStatus;
  readonly severity: SeverityLevel;
  readonly confidence: number;
  readonly reasons: string[];
  readonly processingTime: number;
  readonly modelVersion: string;
  readonly reviewRequired: boolean;
  readonly metadata?: Record<string, unknown>;
}

/**
 * ML model prediction interface
 */
export interface IModelPrediction {
  readonly label: string;
  readonly confidence: number;
  readonly categories: string[];
  readonly rawScores?: Record<string, number>;
}

/**
 * Database user interface
 */
export interface IUser {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * User roles enumeration
 */
export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

/**
 * User status enumeration
 */
export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
  PENDING = 'pending',
}

/**
 * Configuration interfaces
 */
export interface IKafkaConfig {
  readonly brokers: string[];
  readonly clientId: string;
  readonly groupId: string;
  readonly topics: IKafkaTopics;
  readonly ssl?: boolean;
  readonly sasl?: {
    readonly mechanism: string;
    readonly username: string;
    readonly password: string;
  };
}

/**
 * Kafka topics configuration
 */
export interface IKafkaTopics {
  readonly rawContent: string;
  readonly moderationResults: string;
  readonly flaggedContent: string;
  readonly deadLetter: string;
}

/**
 * Database configuration interface
 */
export interface IDatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  readonly ssl: boolean;
  readonly maxConnections: number;
  readonly connectionTimeout: number;
}

/**
 * Redis configuration interface
 */
export interface IRedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db: number;
  readonly keyPrefix: string;
  readonly ttl: number;
}

/**
 * Application configuration interface
 */
export interface IAppConfig {
  readonly port: number;
  readonly environment: string;
  readonly logLevel: string;
  readonly kafka: IKafkaConfig;
  readonly database: IDatabaseConfig;
  readonly redis: IRedisConfig;
  readonly ml: IMLConfig;
  readonly security: ISecurityConfig;
}

/**
 * ML model configuration interface
 */
export interface IMLConfig {
  readonly textModel: IModelConfig;
  readonly imageModel: IModelConfig;
  readonly audioModel: IModelConfig;
  readonly batchSize: number;
  readonly maxProcessingTime: number;
}

/**
 * Individual model configuration
 */
export interface IModelConfig {
  readonly path: string;
  readonly version: string;
  readonly threshold: number;
  readonly enabled: boolean;
}

/**
 * Security configuration interface
 */
export interface ISecurityConfig {
  readonly jwtSecret: string;
  readonly jwtExpiration: string;
  readonly bcryptRounds: number;
  readonly rateLimits: IRateLimitConfig;
}

/**
 * Rate limiting configuration
 */
export interface IRateLimitConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly skipSuccessfulRequests: boolean;
}

/**
 * API response interface
 */
export interface IApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: Date;
  readonly requestId: string;
}

/**
 * Health check response interface
 */
export interface IHealthCheckResponse {
  readonly status: 'healthy' | 'unhealthy';
  readonly services: Record<string, IServiceHealth>;
  readonly uptime: number;
  readonly version: string;
}

/**
 * Service health status interface
 */
export interface IServiceHealth {
  readonly status: 'up' | 'down';
  readonly responseTime?: number;
  readonly error?: string;
  readonly lastCheck: Date;
}

/**
 * Metrics interface for observability
 */
export interface IMetrics {
  readonly requestCount: number;
  readonly errorCount: number;
  readonly averageResponseTime: number;
  readonly activeConnections: number;
  readonly queueLength: number;
}

/**
 * Audit log interface
 */
export interface IAuditLog {
  readonly id: string;
  readonly userId: string;
  readonly action: string;
  readonly resource: string;
  readonly details: Record<string, unknown>;
  readonly timestamp: Date;
  readonly ipAddress: string;
  readonly userAgent: string;
}

/**
 * Error types for better error handling
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class KafkaError extends Error {
  constructor(message: string, public readonly topic?: string) {
    super(message);
    this.name = 'KafkaError';
  }
}

export class MLError extends Error {
  constructor(message: string, public readonly modelType?: string) {
    super(message);
    this.name = 'MLError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
} 