import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { configManager } from '../config';
import { logger } from '../logger';
import { KafkaError } from '../types';

/**
 * Kafka Consumer Manager - Singleton Pattern
 * Handles message consumption from Kafka topics with reliability and observability
 */
export class KafkaConsumerManager {
  private static instance: KafkaConsumerManager;
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private isConnected = false;
  private messageHandlers: Map<string, (payload: EachMessagePayload) => Promise<void>> = new Map();

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
          logger.error('Kafka consumer restart on failure', { error: error.message });
          return true;
        },
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.groupId,
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      minBytes: 1,
      maxBytes: 10485760, // 10MB
      maxWaitTimeInMs: 5000,
      retry: {
        retries: 5,
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Get singleton instance of KafkaConsumerManager
   * @returns {KafkaConsumerManager} The singleton instance
   */
  public static getInstance(): KafkaConsumerManager {
    if (!KafkaConsumerManager.instance) {
      KafkaConsumerManager.instance = new KafkaConsumerManager();
    }
    return KafkaConsumerManager.instance;
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
      await this.consumer.connect();
      this.isConnected = true;
      logger.info('Kafka consumer connected successfully');
    } catch (error) {
      logger.error('Failed to connect Kafka consumer', error as Error);
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
      await this.consumer.disconnect();
      this.isConnected = false;
      logger.info('Kafka consumer disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect Kafka consumer', error as Error);
    }
  }

  /**
   * Subscribe to a topic with message handler
   * @param {string} topic - Topic name to subscribe to
   * @param {Function} handler - Message handler function
   * @returns {Promise<void>} Promise that resolves when subscribed
   */
  public async subscribe(
    topic: string, 
    handler: (payload: EachMessagePayload) => Promise<void>
  ): Promise<void> {
    if (!this.isConnected) {
      throw new KafkaError('Consumer is not connected to Kafka cluster');
    }

    try {
      await this.consumer.subscribe({ topic, fromBeginning: false });
      this.messageHandlers.set(topic, handler);
      
      logger.info('Successfully subscribed to topic', { topic });
    } catch (error) {
      logger.error('Failed to subscribe to topic', { topic, error: error as Error });
      throw new KafkaError(`Failed to subscribe to topic ${topic}`, topic);
    }
  }

  /**
   * Start consuming messages
   * @returns {Promise<void>} Promise that resolves when consumer starts
   */
  public async startConsuming(): Promise<void> {
    if (!this.isConnected) {
      throw new KafkaError('Consumer is not connected to Kafka cluster');
    }

    try {
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          const { topic, partition, message } = payload;
          const handler = this.messageHandlers.get(topic);

          if (!handler) {
            logger.warn('No handler found for topic', { topic });
            return;
          }

          const startTime = Date.now();
          
          try {
            logger.debug('Processing message', {
              topic,
              partition,
              offset: message.offset,
              key: message.key?.toString(),
            });

            await handler(payload);

            const processingTime = Date.now() - startTime;
            logger.debug('Message processed successfully', {
              topic,
              partition,
              offset: message.offset,
              processingTime,
            });

          } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error('Failed to process message', {
              topic,
              partition,
              offset: message.offset,
              processingTime,
              error: error as Error,
            });

            // Optionally send to dead letter queue
            await this.handleFailedMessage(payload, error as Error);
          }
        },
      });

      logger.info('Kafka consumer started successfully');
    } catch (error) {
      logger.error('Failed to start Kafka consumer', error as Error);
      throw new KafkaError('Failed to start consuming messages');
    }
  }

  /**
   * Stop consuming messages
   * @returns {Promise<void>} Promise that resolves when consumer stops
   */
  public async stopConsuming(): Promise<void> {
    try {
      await this.consumer.stop();
      logger.info('Kafka consumer stopped successfully');
    } catch (error) {
      logger.error('Failed to stop Kafka consumer', error as Error);
    }
  }

  /**
   * Handle failed message processing
   * @param {EachMessagePayload} payload - Original message payload
   * @param {Error} error - Processing error
   * @returns {Promise<void>} Promise that resolves when handled
   * @private
   */
  private async handleFailedMessage(payload: EachMessagePayload, error: Error): Promise<void> {
    try {
      // Import producer to avoid circular dependency
      const { kafkaProducer } = await import('./producer');
      
      const originalMessage = {
        topic: payload.topic,
        partition: payload.partition,
        offset: payload.message.offset,
        key: payload.message.key?.toString(),
        value: payload.message.value?.toString(),
        headers: payload.message.headers,
      };

      await kafkaProducer.sendToDeadLetter(originalMessage, error);
    } catch (deadLetterError) {
      logger.error('Failed to send message to dead letter queue', {
        originalError: error.message,
        deadLetterError: deadLetterError as Error,
      });
    }
  }

  /**
   * Setup event handlers for consumer
   * @private
   */
  private setupEventHandlers(): void {
    this.consumer.on('consumer.connect', () => {
      logger.info('Kafka consumer connected');
    });

    this.consumer.on('consumer.disconnect', () => {
      logger.info('Kafka consumer disconnected');
      this.isConnected = false;
    });

    this.consumer.on('consumer.stop', () => {
      logger.info('Kafka consumer stopped');
    });

    this.consumer.on('consumer.crash', (payload) => {
      logger.error('Kafka consumer crashed', payload);
    });

    this.consumer.on('consumer.rebalancing', () => {
      logger.info('Kafka consumer rebalancing');
    });

    this.consumer.on('consumer.commit_offsets', (payload) => {
      logger.debug('Kafka consumer committed offsets', payload);
    });

    this.consumer.on('consumer.group_join', (payload) => {
      logger.info('Kafka consumer joined group', payload);
    });

    this.consumer.on('consumer.fetch', (payload) => {
      logger.debug('Kafka consumer fetch', {
        numberOfBatches: payload.numberOfBatches,
        duration: payload.duration,
      });
    });
  }

  /**
   * Get connection status
   * @returns {boolean} True if connected to Kafka cluster
   */
  public isConsumerConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get consumer lag for monitoring
   * @returns {Promise<object>} Consumer lag information
   */
  public async getConsumerLag(): Promise<object> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      // Get consumer group description
      const groupDescription = await admin.describeGroups([
        configManager.getKafkaConfig().groupId
      ]);

      await admin.disconnect();
      
      return groupDescription;
    } catch (error) {
      logger.error('Failed to get consumer lag', error as Error);
      throw new KafkaError('Failed to retrieve consumer lag information');
    }
  }
}

/**
 * Export singleton instance
 */
export const kafkaConsumer = KafkaConsumerManager.getInstance(); 