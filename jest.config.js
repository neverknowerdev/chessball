module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
      '^.+\\.tsx?$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    testMatch: ['**/test/**/*.test.ts'],
    transformIgnorePatterns: [
      'node_modules/(?!(your-module|another-module)/)'
    ]
  };