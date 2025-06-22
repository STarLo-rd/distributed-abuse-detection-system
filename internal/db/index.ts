import { Pool, PoolClient, QueryResult } from 'pg';
import { configManager } from '../config';
import { logger } from '../logger';
import { DatabaseError } from '../types';

/**
 * Database Manager - Singleton Pattern
 * Manages PostgreSQL connections with pooling and transaction support
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private readonly pool: Pool;
  private isConnected = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    const dbConfig = configManager.getDatabaseConfig();
    
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.username,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
      max: dbConfig.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: dbConfig.connectionTimeout,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: 'abuse-detection-system',
    });

    this.setupEventHandlers();
  }

  /**
   * Get singleton instance of DatabaseManager
   * @returns {DatabaseManager} The singleton instance
   */
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize database connection and test connectivity
   * @returns {Promise<void>} Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database', error as Error);
      throw new DatabaseError('Failed to connect to database');
    }
  }

  /**
   * Close all database connections
   * @returns {Promise<void>} Promise that resolves when disconnected
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database', error as Error);
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} text - SQL query text
   * @param {unknown[]} params - Query parameters
   * @returns {Promise<QueryResult>} Query result
   */
  public async query(text: string, params: unknown[] = []): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Executing query', { query: text, params });
      
      const result = await this.pool.query(text, params);
      
      const duration = Date.now() - startTime;
      logger.debug('Query executed successfully', {
        query: text,
        duration,
        rowCount: result.rowCount,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Query execution failed', {
        query: text,
        params,
        duration,
        error: error as Error,
      });
      
      throw new DatabaseError(
        `Query execution failed: ${(error as Error).message}`,
        (error as { code?: string }).code
      );
    }
  }

  /**
   * Execute a query and return first row
   * @param {string} text - SQL query text
   * @param {unknown[]} params - Query parameters
   * @returns {Promise<unknown>} First row or undefined
   */
  public async queryOne(text: string, params: unknown[] = []): Promise<unknown> {
    const result = await this.query(text, params);
    return result.rows[0];
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Transaction callback function
   * @returns {Promise<T>} Transaction result
   */
  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      logger.debug('Transaction started');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      logger.debug('Transaction committed');
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction rolled back', error as Error);
      
      throw new DatabaseError(
        `Transaction failed: ${(error as Error).message}`,
        (error as { code?: string }).code
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get database connection status
   * @returns {boolean} True if connected
   */
  public isDbConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get pool statistics for monitoring
   * @returns {object} Pool statistics
   */
  public getPoolStats(): object {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Setup event handlers for pool
   * @private
   */
  private setupEventHandlers(): void {
    this.pool.on('connect', (client) => {
      logger.debug('Database client connected', {
        processID: client.processID,
      });
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Database client acquired', {
        processID: client.processID,
      });
    });

    this.pool.on('release', (client) => {
      logger.debug('Database client released', {
        processID: client.processID,
      });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Database client removed', {
        processID: client.processID,
      });
    });

    this.pool.on('error', (error, client) => {
      logger.error('Database pool error', {
        error: error.message,
        processID: client?.processID,
      });
    });
  }
}

/**
 * Export singleton instance
 */
export const database = DatabaseManager.getInstance(); 