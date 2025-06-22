module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/cmd', '<rootDir>/internal', '<rootDir>/services'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'cmd/**/*.ts',
    'internal/**/*.ts',
    'services/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  moduleNameMapping: {
    '^@internal/(.*)$': '<rootDir>/internal/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@cmd/(.*)$': '<rootDir>/cmd/$1'
  }
}; 