/**
 * Jest Test Setup
 * Global configuration and setup for all tests
 */

import { configManager } from '../internal/config';
import { logger } from '../internal/logger';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock external dependencies for testing
jest.mock('../internal/kafka/producer', () => ({
  kafkaProducer: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    publishContentEvent: jest.fn().mockResolvedValue([]),
    publishModerationResult: jest.fn().mockResolvedValue([]),
    publishFlaggedContent: jest.fn().mockResolvedValue([]),
    sendToDeadLetter: jest.fn().mockResolvedValue([]),
    isProducerConnected: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../internal/kafka/consumer', () => ({
  kafkaConsumer: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    startConsuming: jest.fn().mockResolvedValue(undefined),
    stopConsuming: jest.fn().mockResolvedValue(undefined),
    isConsumerConnected: jest.fn().mockReturnValue(true),
    getConsumerLag: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../internal/db', () => ({
  database: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    queryOne: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn().mockImplementation(async (callback) => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      };
      return callback(mockClient);
    }),
    isDbConnected: jest.fn().mockReturnValue(true),
    getPoolStats: jest.fn().mockReturnValue({
      totalCount: 1,
      idleCount: 1,
      waitingCount: 0,
    }),
  },
}));

jest.mock('../internal/cache', () => ({
  cache: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(false),
    increment: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(true),
    rateLimitCheck: jest.fn().mockResolvedValue(true),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(true),
    isCacheConnected: jest.fn().mockReturnValue(true),
  },
}));

jest.mock('../internal/ml', () => ({
  mlInference: {
    initialize: jest.fn().mockResolvedValue(undefined),
    predict: jest.fn().mockResolvedValue({
      label: 'clean',
      confidence: 0.1,
      categories: [],
      rawScores: {},
    }),
    predictText: jest.fn().mockResolvedValue({
      label: 'clean',
      confidence: 0.1,
      categories: [],
      rawScores: {},
    }),
    predictImage: jest.fn().mockResolvedValue({
      label: 'safe',
      confidence: 0.1,
      categories: [],
      rawScores: {},
    }),
    predictAudio: jest.fn().mockResolvedValue({
      label: 'appropriate',
      confidence: 0.1,
      categories: [],
      rawScores: {},
    }),
    isMLInitialized: jest.fn().mockReturnValue(true),
    getModelStatus: jest.fn().mockReturnValue({
      initialized: true,
      models: {
        text: { enabled: true, loaded: true, threshold: 0.8 },
        image: { enabled: true, loaded: true, threshold: 0.7 },
        audio: { enabled: true, loaded: true, threshold: 0.75 },
      },
    }),
  },
}));

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockRequest: (overrides?: object) => object;
        createMockResponse: (overrides?: object) => object;
        createMockContentEvent: (overrides?: object) => object;
        createMockUser: (overrides?: object) => object;
        delay: (ms: number) => Promise<void>;
      };
    }
  }
}

// Test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    method: 'GET',
    url: '/test',
    headers: {},
    body: {},
    params: {},
    query: {},
    user: null,
    ...overrides,
  }),

  createMockResponse: (overrides = {}) => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      locals: {},
      headersSent: false,
      ...overrides,
    };
    return res;
  },

  createMockContentEvent: (overrides = {}) => ({
    id: 'test-content-id',
    userId: 'test-user-id',
    contentType: 'text',
    content: 'Test content',
    metadata: {
      size: 12,
      mimeType: 'text/plain',
      language: 'en',
      clientIp: '127.0.0.1',
      userAgent: 'test-agent',
      sessionId: 'test-session',
    },
    timestamp: new Date(),
    source: 'test',
    ...overrides,
  }),

  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    username: 'testuser',
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Setup and teardown
beforeAll(async () => {
  // Global test setup
  logger.info('Starting test suite');
});

afterAll(async () => {
  // Global test cleanup
  logger.info('Test suite completed');
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  jest.resetAllMocks();
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions in tests
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

export {}; 