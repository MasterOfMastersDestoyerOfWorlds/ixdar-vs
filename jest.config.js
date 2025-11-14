module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/commands/(.*)$': '<rootDir>/build/webpack-debug/commands/$1.debug',
    '^@/(.*)$': '<rootDir>/build/webpack-debug/$1.debug',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'ES2022',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }
    }]
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/commands/**/*.ts',
    '!src/commands/**/*.test.ts',
  ],
};

