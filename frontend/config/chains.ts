// config/chains.ts
import { baseSepolia, basePreconf } from 'viem/chains';

// Define your chain type
export type AppChain = typeof basePreconf | typeof baseSepolia;

// Map environment to chains
const chainMap = {
  production: basePreconf,
  preview: baseSepolia,
  development: baseSepolia,
} as const;

// Get current environment
const env = (process.env.NEXT_PUBLIC_ENV ||
  process.env.NODE_ENV ||
  'development') as keyof typeof chainMap;

// Export the global chain
export const chain: AppChain = chainMap[env] || baseSepolia;

// Optional: Export chain ID for easy access
export const chainId = chain.id;

// Optional: Helper to check current environment
export const isProduction = env === 'production';
export const isPreview = env === 'preview';
export const isDevelopment = env === 'development';