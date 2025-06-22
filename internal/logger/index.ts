import winston from 'winston';
import { trace, context } from '@opentelemetry/api';
import { configManager } from '../config';

/**
 * Logger Manager - Singleton Pattern
 * Provides structured logging with OpenTelemetry integration
 */
export class LoggerManager {
  private static instance: LoggerManager;
  private readonly logger: winston.Logger;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.logger = this.createLogger();
  }

  /**
   * Get singleton instance of LoggerManager
   * @returns {LoggerManager} The singleton instance
   */
  public static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  /**
   * Get the Winston logger instance
   * @returns {winston.Logger} Winston logger instance
   */
  public getLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Log info level message with trace context
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  public info(message: string, meta: object = {}): void {
    this.logger.info(message, this.enrichWithTrace(meta));
  }

  /**
   * Log error level message with trace context
   * @param {string} message - Log message
   * @param {Error | object} error - Error object or metadata
   */
  public error(message: string, error: Error | object = {}): void {
    const errorMeta = error instanceof Error 
      ? { error: error.message, stack: error.stack, name: error.name }
      : error;
    this.logger.error(message, this.enrichWithTrace(errorMeta));
  }

  /**
   * Log warn level message with trace context
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  public warn(message: string, meta: object = {}): void {
    this.logger.warn(message, this.enrichWithTrace(meta));
  }

  /**
   * Log debug level message with trace context
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  public debug(message: string, meta: object = {}): void {
    this.logger.debug(message, this.enrichWithTrace(meta));
  }

  /**
   * Create Winston logger instance with proper configuration
   * @returns {winston.Logger} Configured Winston logger
   * @private
   */
  private createLogger(): winston.Logger {
    const config = configManager.getConfig();
    const isProduction = config.environment === 'production';

    const formats = [
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    ];

    if (isProduction) {
      formats.push(winston.format.json());
    } else {
      formats.push(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, metadata }) => {
          const meta = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${meta}`;
        })
      );
    }

    const transports: winston.transport[] = [
      new winston.transports.Console({
        level: config.logLevel,
        handleExceptions: true,
        handleRejections: true,
      }),
    ];

    if (isProduction) {
      // Add file transports for production
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );
    }

    return winston.createLogger({
      level: config.logLevel,
      format: winston.format.combine(...formats),
      transports,
      exitOnError: false,
    });
  }

  /**
   * Enrich log metadata with OpenTelemetry trace context
   * @param {object} meta - Original metadata
   * @returns {object} Enriched metadata with trace context
   * @private
   */
  private enrichWithTrace(meta: object): object {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      return {
        ...meta,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
      };
    }
    return meta;
  }
}

/**
 * Export singleton instance
 */
export const logger = LoggerManager.getInstance(); 