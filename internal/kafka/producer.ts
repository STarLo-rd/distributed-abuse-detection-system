import { Kafka, Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { configManager } from '../config';
import { logger } from '../logger';
import { IContentEvent, KafkaError } from '../types';

/**
 * Kafka Producer Manager - Singleton Pattern
 * Handles message publishing to Kafka topics with reliability and observability
 */
export class KafkaProducerManager {
  private static instance: KafkaProducerManager;
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private isConnected = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    const kafkaConfig = configManager.getKafkaConfig();
    
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: kafkaConfig.ssl,
      sasl: kafkaConfig.sasl,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2,
        multiplier: 1.5,
        restartOnFailure: async (error: Error) => {
          logger.error('Kafka producer restart on failure', { error: error.message });
          return true;
        },
      },
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        retries: 5,
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Get singleton instance of KafkaProducerManager
   * @returns {KafkaProducerManager} The singleton instance
   */
  public static getInstance(): KafkaProducerManager {
    if (!KafkaProducerManager.instance) {
      KafkaProducerManager.instance = new KafkaProducerManager();
    }
    return KafkaProducerManager.instance;
  }

  /**
   * Connect to Kafka cluster
   * @returns {Promise<void>} Promise that resolves when connected
   */
  public async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.producer.connect();
      this.isConnected = true;
      logger.info('Kafka producer connected successfully');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', error as Error);
      throw new KafkaError('Failed to connect to Kafka cluster');
    }
  }

  /**
   * Disconnect from Kafka cluster
   * @returns {Promise<void>} Promise that resolves when disconnected
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.producer.disconnect();
      this.isConnected = false;
      logger.info('Kafka producer disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect Kafka producer', error as Error);
    }
  }

  /**
   * Publish content event to raw content topic
   * @param {IContentEvent} contentEvent - Content event to publish
   * @returns {Promise<RecordMetadata[]>} Promise that resolves with record metadata
   */
  public async publishContentEvent(contentEvent: IContentEvent): Promise<RecordMetadata[]> {
    const kafkaConfig = configManager.getKafkaConfig();
    const messageId = uuidv4();

    const message = {
      key: contentEvent.userId,
      value: JSON.stringify({
        ...contentEvent,
        messageId,
        publishedAt: new Date().toISOString(),
      }),
      headers: {
        messageId,
        contentType: contentEvent.contentType,
        userId: contentEvent.userId,
        timestamp: contentEvent.timestamp.toISOString(),
      },
    };

    try {
      const result = await this.sendMessage(kafkaConfig.topics.rawContent, message);
      
      logger.info('Content event published successfully', {
        messageId,
        contentId: contentEvent.id,
        userId: contentEvent.userId,
        contentType: contentEvent.contentType,
        topic: kafkaConfig.topics.rawContent,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish content event', {
        messageId,
        contentId: contentEvent.id,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Publish moderation result
   * @param {object} moderationResult - Moderation result to publish
   * @returns {Promise<RecordMetadata[]>} Promise that resolves with record metadata
   */
  public async publishModerationResult(moderationResult: object): Promise<RecordMetadata[]> {
    const kafkaConfig = configManager.getKafkaConfig();
    const messageId = uuidv4();

    const message = {
      key: (moderationResult as { contentId: string }).contentId,
      value: JSON.stringify({
        ...moderationResult,
        messageId,
        publishedAt: new Date().toISOString(),
      }),
      headers: {
        messageId,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const result = await this.sendMessage(kafkaConfig.topics.moderationResults, message);
      
      logger.info('Moderation result published successfully', {
        messageId,
        contentId: (moderationResult as { contentId: string }).contentId,
        topic: kafkaConfig.topics.moderationResults,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish moderation result', {
        messageId,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Publish flagged content
   * @param {object} flaggedContent - Flagged content to publish
   * @returns {Promise<RecordMetadata[]>} Promise that resolves with record metadata
   */
  public async publishFlaggedContent(flaggedContent: object): Promise<RecordMetadata[]> {
    const kafkaConfig = configManager.getKafkaConfig();
    const messageId = uuidv4();

    const message = {
      key: (flaggedContent as { contentId: string }).contentId,
      value: JSON.stringify({
        ...flaggedContent,
        messageId,
        publishedAt: new Date().toISOString(),
      }),
      headers: {
        messageId,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const result = await this.sendMessage(kafkaConfig.topics.flaggedContent, message);
      
      logger.info('Flagged content published successfully', {
        messageId,
        contentId: (flaggedContent as { contentId: string }).contentId,
        topic: kafkaConfig.topics.flaggedContent,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish flagged content', {
        messageId,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Send message to dead letter queue
   * @param {object} originalMessage - Original message that failed processing
   * @param {Error} processingError - Error that occurred during processing
   * @returns {Promise<RecordMetadata[]>} Promise that resolves with record metadata
   */
  public async sendToDeadLetter(originalMessage: object, processingError: Error): Promise<RecordMetadata[]> {
    const kafkaConfig = configManager.getKafkaConfig();
    const messageId = uuidv4();

    const deadLetterMessage = {
      key: (originalMessage as { key?: string }).key || 'unknown',
      value: JSON.stringify({
        originalMessage,
        error: {
          message: processingError.message,
          stack: processingError.stack,
          name: processingError.name,
        },
        failedAt: new Date().toISOString(),
        messageId,
      }),
      headers: {
        messageId,
        originalTopic: 'unknown',
        failureReason: processingError.name,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const result = await this.sendMessage(kafkaConfig.topics.deadLetter, deadLetterMessage);
      
      logger.warn('Message sent to dead letter queue', {
        messageId,
        error: processingError.message,
        topic: kafkaConfig.topics.deadLetter,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send message to dead letter queue', {
        messageId,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Generic method to send message to any topic
   * @param {string} topic - Kafka topic name
   * @param {object} message - Message to send
   * @returns {Promise<RecordMetadata[]>} Promise that resolves with record metadata
   * @private
   */
  private async sendMessage(topic: string, message: object): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      throw new KafkaError('Producer is not connected to Kafka cluster');
    }

    const record: ProducerRecord = {
      topic,
      messages: [message],
    };

    try {
      const result = await this.producer.send(record);
      return result;
    } catch (error) {
      logger.error('Failed to send message to Kafka', {
        topic,
        error: error as Error,
      });
      throw new KafkaError(`Failed to send message to topic ${topic}`, topic);
    }
  }

  /**
   * Setup event handlers for producer
   * @private
   */
  private setupEventHandlers(): void {
    this.producer.on('producer.connect', () => {
      logger.info('Kafka producer connected');
    });

    this.producer.on('producer.disconnect', () => {
      logger.info('Kafka producer disconnected');
      this.isConnected = false;
    });

    this.producer.on('producer.network.request_timeout', (payload) => {
      logger.warn('Kafka producer request timeout', payload);
    });

    this.producer.on('producer.network.request_queue_size', (payload) => {
      logger.debug('Kafka producer request queue size', payload);
    });
  }

  /**
   * Get connection status
   * @returns {boolean} True if connected to Kafka cluster
   */
  public isProducerConnected(): boolean {
    return this.isConnected;
  }
}

/**
 * Export singleton instance
 */
export const kafkaProducer = KafkaProducerManager.getInstance(); 