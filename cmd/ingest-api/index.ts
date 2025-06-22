#!/usr/bin/env node

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { configManager } from '../../internal/config';
import { logger } from '../../internal/logger';
import { database } from '../../internal/db';
import { cache } from '../../internal/cache';
import { kafkaProducer } from '../../internal/kafka/producer';
import { mlInference } from '../../internal/ml';
import { 
  IContentEvent, 
  ContentType, 
  IApiResponse, 
  IHealthCheckResponse,
  ValidationError,
  AuthenticationError,
  AuthorizationError
} from '../../internal/types';
import { setupRoutes } from './routes';
import { setupMiddleware } from './middleware';
import { gracefulShutdown } from './shutdown';

/**
 * Ingest API Server - Main Entry Point
 * Handles content ingestion and publishes to Kafka for processing
 */
class IngestApiServer {
  private readonly app: express.Application;
  private server?: import('http').Server;
  private readonly config = configManager.getConfig();

  constructor() {
    this.app = express();
    this.setupApplication();
  }

  /**
   * Setup Express application with middleware and routes
   * @private
   */
  private setupApplication(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.environment === 'production' 
        ? ['https://yourdomain.com'] 
        : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    setupMiddleware(this.app);

    // API routes
    setupRoutes(this.app);

    // Health check endpoint
    this.app.get('/health', this.healthCheck.bind(this));

    // Global error handler
    this.app.use(this.errorHandler.bind(this));

    // 404 handler
    this.app.use('*', (req, res) => {
      const response: IApiResponse = {
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date(),
        requestId: res.locals.requestId || uuidv4(),
      };
      res.status(404).json(response);
    });
  }

  /**
   * Health check endpoint handler
   * @param {express.Request} req - Express request
   * @param {express.Response} res - Express response
   * @private
   */
  private async healthCheck(req: express.Request, res: express.Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check all service connections
      const [dbStatus, cacheStatus, kafkaStatus, mlStatus] = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkCacheHealth(),
        this.checkKafkaHealth(),
        this.checkMLHealth(),
      ]);

      const services = {
        database: this.getServiceHealth(dbStatus),
        cache: this.getServiceHealth(cacheStatus),
        kafka: this.getServiceHealth(kafkaStatus),
        ml: this.getServiceHealth(mlStatus),
      };

      const allHealthy = Object.values(services).every(service => service.status === 'up');
      const responseTime = Date.now() - startTime;

      const healthResponse: IHealthCheckResponse = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        services,
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      };

      logger.info('Health check completed', {
        status: healthResponse.status,
        responseTime,
        services: Object.entries(services).map(([name, service]) => ({
          name,
          status: service.status,
        })),
      });

      res.status(allHealthy ? 200 : 503).json(healthResponse);
    } catch (error) {
      logger.error('Health check failed', error as Error);
      
      const healthResponse: IHealthCheckResponse = {
        status: 'unhealthy',
        services: {},
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      };

      res.status(503).json(healthResponse);
    }
  }

  /**
   * Check database health
   * @returns {Promise<void>} Promise that resolves if healthy
   * @private
   */
  private async checkDatabaseHealth(): Promise<void> {
    if (!database.isDbConnected()) {
      throw new Error('Database not connected');
    }
    await database.query('SELECT 1');
  }

  /**
   * Check cache health
   * @returns {Promise<void>} Promise that resolves if healthy
   * @private
   */
  private async checkCacheHealth(): Promise<void> {
    if (!cache.isCacheConnected()) {
      throw new Error('Cache not connected');
    }
    await cache.set('health_check', 'ok', 10);
    await cache.get('health_check');
  }

  /**
   * Check Kafka health
   * @returns {Promise<void>} Promise that resolves if healthy
   * @private
   */
  private async checkKafkaHealth(): Promise<void> {
    if (!kafkaProducer.isProducerConnected()) {
      throw new Error('Kafka producer not connected');
    }
  }

  /**
   * Check ML service health
   * @returns {Promise<void>} Promise that resolves if healthy
   * @private
   */
  private async checkMLHealth(): Promise<void> {
    if (!mlInference.isMLInitialized()) {
      throw new Error('ML inference engine not initialized');
    }
  }

  /**
   * Convert Promise.allSettled result to service health
   * @param {PromiseSettledResult<void>} result - Promise result
   * @returns {object} Service health object
   * @private
   */
  private getServiceHealth(result: PromiseSettledResult<void>): object {
    const now = new Date();
    
    if (result.status === 'fulfilled') {
      return {
        status: 'up',
        lastCheck: now,
      };
    } else {
      return {
        status: 'down',
        error: result.reason?.message || 'Unknown error',
        lastCheck: now,
      };
    }
  }

  /**
   * Global error handler
   * @param {Error} error - Error object
   * @param {express.Request} req - Express request
   * @param {express.Response} res - Express response
   * @param {express.NextFunction} next - Express next function
   * @private
   */
  private errorHandler(
    error: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    if (res.headersSent) {
      return next(error);
    }

    const requestId = res.locals.requestId || uuidv4();
    
    logger.error('Request error', {
      requestId,
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack,
    });

    let statusCode = 500;
    let message = 'Internal server error';

    if (error instanceof ValidationError) {
      statusCode = 400;
      message = error.message;
    } else if (error instanceof AuthenticationError) {
      statusCode = 401;
      message = error.message;
    } else if (error instanceof AuthorizationError) {
      statusCode = 403;
      message = error.message;
    }

    const response: IApiResponse = {
      success: false,
      error: message,
      timestamp: new Date(),
      requestId,
    };

    res.status(statusCode).json(response);
  }

  /**
   * Initialize all services
   * @returns {Promise<void>} Promise that resolves when all services are initialized
   * @private
   */
  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    try {
      // Initialize services in parallel where possible
      await Promise.all([
        database.connect(),
        cache.connect(),
        kafkaProducer.connect(),
      ]);

      // Initialize ML models (can be slow, so do it last)
      await mlInference.initialize();

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services', error as Error);
      throw error;
    }
  }

  /**
   * Start the server
   * @returns {Promise<void>} Promise that resolves when server is started
   */
  public async start(): Promise<void> {
    try {
      // Initialize all services first
      await this.initializeServices();

      // Start HTTP server
      this.server = this.app.listen(this.config.port, () => {
        logger.info('Ingest API server started', {
          port: this.config.port,
          environment: this.config.environment,
          nodeVersion: process.version,
          pid: process.pid,
        });
      });

      // Setup graceful shutdown
      gracefulShutdown(this.server, async () => {
        logger.info('Shutting down services...');
        
        await Promise.allSettled([
          database.disconnect(),
          cache.disconnect(),
          kafkaProducer.disconnect(),
        ]);
        
        logger.info('All services shut down');
      });

    } catch (error) {
      logger.error('Failed to start server', error as Error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   * @returns {Promise<void>} Promise that resolves when server is stopped
   */
  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('Server stopped');
          resolve();
        });
      });
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new IngestApiServer();
  server.start().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
}

export { IngestApiServer }; 