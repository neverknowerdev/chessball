import { type Address } from 'viem';
import { publicClient } from './providers';



interface AuthSignature {
    signature: string;
    message: string;
    walletAddress: string;
    timestamp: number;
    expiresAt: number;
}

const AUTH_CACHE_KEY = 'chessball_auth_signature';
const AUTH_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Formats a timestamp to YYYY-MM-DD HH:mm format
 * @param timestamp - The timestamp to format
 * @returns string - The formatted timestamp
 */
export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Creates a standardized authentication message for TactiBall
 * @param walletAddress - The wallet address to include in the message
 * @returns string - The formatted authentication message
 */
export function createAuthMessage(walletAddress: string, timestamp: number): string {
    const formattedDate = formatTimestamp(timestamp);
    return `Authenticate with TactiBall\n\nWallet: ${walletAddress}\nTimestamp: ${formattedDate}\n\nThis signature is used to authenticate your wallet to perform game actions.\n\nValid for 24 hours.`;
}

/**
 * Authenticates user with signature and caches it for 24 hours
 * @param walletAddress - The user's wallet address
 * @param signMessageFn - Function to sign the message (from wagmi)
 * @returns Promise<AuthSignature> - The signature data
 */
export async function authUserWithSignature(
    walletAddress: string,
    signMessageFn: (params: { message: string }) => Promise<string>
): Promise<AuthSignature> {
    try {
        // Check if we have a valid cached signature
        const cached = getCachedAuthSignature(walletAddress);
        if (cached) {
            console.log('Using cached authentication signature');
            return cached;
        }

        console.log('Requesting new authentication signature');

        const now = Date.now();
        // Create authentication message
        const message = createAuthMessage(walletAddress, now);

        // Use the provided sign function (from wagmi)
        const signature = await signMessageFn({ message });

        if (!signature) {
            throw new Error('User rejected signature request');
        }

        // Create auth signature object

        const authSignature: AuthSignature = {
            signature,
            message,
            walletAddress,
            timestamp: now,
            expiresAt: now + AUTH_DURATION_MS
        };

        // Cache the signature
        cacheAuthSignature(authSignature);

        console.log('Authentication signature created and cached');
        return authSignature;

    } catch (error) {
        console.error('Error in authUserWithSignature:', error);
        throw error;
    }
}

/**
 * Gets cached authentication signature if valid
 * @param walletAddress - The wallet address to check
 * @returns AuthSignature | null - Cached signature or null if expired/invalid
 */
function getCachedAuthSignature(walletAddress: string): AuthSignature | null {
    try {
        const cached = localStorage.getItem(AUTH_CACHE_KEY);
        if (!cached) return null;

        const authSignature: AuthSignature = JSON.parse(cached);

        // Check if it's for the same wallet
        if (authSignature.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            console.log('Cached signature is for different wallet, clearing cache');
            clearCachedAuthSignature();
            return null;
        }

        // Check if it's expired
        if (Date.now() > authSignature.expiresAt) {
            console.log('Cached signature expired, clearing cache');
            clearCachedAuthSignature();
            return null;
        }

        // Check if it's still valid (within 24 hours)
        const timeUntilExpiry = authSignature.expiresAt - Date.now();
        const hoursUntilExpiry = Math.floor(timeUntilExpiry / (60 * 60 * 1000));
        console.log(`Cached signature valid for ${hoursUntilExpiry} more hours`);

        return authSignature;

    } catch (error) {
        console.error('Error reading cached auth signature:', error);
        clearCachedAuthSignature();
        return null;
    }
}

/**
 * Caches authentication signature in localStorage
 * @param authSignature - The authentication signature to cache
 */
function cacheAuthSignature(authSignature: AuthSignature): void {
    try {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authSignature));
        console.log('Authentication signature cached successfully');
    } catch (error) {
        console.error('Error caching auth signature:', error);
    }
}

/**
 * Clears cached authentication signature
 */
export function clearCachedAuthSignature(): void {
    try {
        localStorage.removeItem(AUTH_CACHE_KEY);
        console.log('Cached authentication signature cleared');
    } catch (error) {
        console.error('Error clearing cached auth signature:', error);
    }
}

/**
 * Checks if user has a valid cached authentication
 * @param walletAddress - The wallet address to check
 * @returns boolean - True if valid cached auth exists
 */
export function hasValidCachedAuth(walletAddress: string): boolean {
    return getCachedAuthSignature(walletAddress) !== null;
}

/**
 * Gets remaining time until authentication expires
 * @param walletAddress - The wallet address to check
 * @returns number - Milliseconds until expiry, or 0 if expired/not found
 */
export function getAuthTimeRemaining(walletAddress: string): number {
    const cached = getCachedAuthSignature(walletAddress);
    if (!cached) return 0;

    const remaining = cached.expiresAt - Date.now();
    return Math.max(0, remaining);
}

/**
 * Checks if a signature and message are valid for a given wallet address
 * @param signature - The signature to verify
 * @param message - The message that was signed
 * @param walletAddress - The wallet address that should have signed the message
 * @returns Promise<{ isValid: boolean; error?: string; timestamp?: number; expiresAt?: number }>
 */
export async function checkAuthSignatureAndMessage(
    signature: string,
    message: string,
    walletAddress: string
): Promise<{ isValid: boolean; error?: string; timestamp?: number; expiresAt?: number }> {
    try {
        // Validate input parameters
        if (!signature || !message || !walletAddress) {
            return {
                isValid: false,
                error: 'Missing required parameters: signature, message, or wallet address'
            };
        }

        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return {
                isValid: false,
                error: 'Invalid wallet address format'
            };
        }

        // Check if message contains expected format
        if (!message.includes('Authenticate with TactiBall')) {
            return {
                isValid: false,
                error: 'Invalid message format: must be TactiBall authentication message'
            };
        }

        // Extract timestamp from message
        const timestampMatch = message.match(/Timestamp: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
        if (!timestampMatch) {
            return {
                isValid: false,
                error: 'Message does not contain valid timestamp format (YYYY-MM-DD HH:mm)'
            };
        }

        const formattedTimestamp = timestampMatch[1];
        const timestamp = new Date(formattedTimestamp + ':00').getTime(); // Add seconds to make it a valid ISO string
        if (isNaN(timestamp)) {
            return {
                isValid: false,
                error: 'Invalid timestamp in message'
            };
        }

        // Check if timestamp is not too old (within 24 hours)
        const now = Date.now();
        const messageAge = now - timestamp;
        const maxAge = AUTH_DURATION_MS; // 24 hours

        if (messageAge > maxAge) {
            return {
                isValid: false,
                error: `Message is too old: ${Math.floor(messageAge / (60 * 60 * 1000))} hours old (max: 24 hours)`,
                timestamp,
                expiresAt: timestamp + maxAge
            };
        }

        // Check if timestamp is not in the future (within reasonable bounds)
        if (timestamp > now + (5 * 60 * 1000)) { // 5 minutes tolerance for clock skew
            return {
                isValid: false,
                error: 'Message timestamp is in the future (clock skew issue)',
                timestamp,
                expiresAt: timestamp + maxAge
            };
        }

        // Verify the signature using viem
        try {
            const isValid = await publicClient.verifyMessage({
                address: walletAddress as Address,
                message: message,
                signature: signature as `0x${string}`,
            });

            // Check if recovered address matches the claimed wallet address
            if (!isValid) {
                return {
                    isValid: false,
                    error: 'Signature verification failed',
                    timestamp,
                    expiresAt: timestamp + maxAge
                };
            }

            // Calculate when this signature expires
            const expiresAt = timestamp + maxAge;
            const timeRemaining = expiresAt - now;

            console.log(`Signature verification successful for ${walletAddress}`);
            console.log(`Message timestamp: ${formattedTimestamp}`);
            console.log(`Time remaining: ${Math.floor(timeRemaining / (60 * 60 * 1000))}h ${Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000))}m`);

            return {
                isValid: true,
                timestamp,
                expiresAt
            };

        } catch (signatureError) {
            return {
                isValid: false,
                error: `Signature verification failed: ${signatureError instanceof Error ? signatureError.message : 'Unknown error'}`,
                timestamp,
                expiresAt: timestamp + maxAge
            };
        }

    } catch (error) {
        console.error('Error in checkAuthSignatureAndMessage:', error);
        return {
            isValid: false,
            error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
