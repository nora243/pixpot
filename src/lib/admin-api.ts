/**
 * Admin API helper with signature authentication
 */
import { signMessage } from "viem/accounts";
import { WalletClient } from "viem";

export interface AdminRequestOptions {
  walletAddress: string;
  signMessageFn: (args: { message: string }) => Promise<string>;
}

/**
 * Create authenticated headers for admin API requests
 */
export async function createAuthHeaders(
  options: AdminRequestOptions
): Promise<HeadersInit> {
  const timestamp = Date.now().toString();
  const message = `PixPot Admin Auth\nTimestamp: ${timestamp}`;
  
  try {
    const signature = await options.signMessageFn({ message });
    
    return {
      "Content-Type": "application/json",
      "x-wallet-address": options.walletAddress,
      "x-signature": signature,
      "x-timestamp": timestamp,
    };
  } catch (error) {
    console.error("[AuthHeaders] Failed to sign message:", error);
    throw new Error("Failed to authenticate. Please check your wallet connection.");
  }
}

/**
 * Make authenticated admin API request
 */
export async function adminFetch(
  url: string,
  options: RequestInit & { auth: AdminRequestOptions }
): Promise<Response> {
  const { auth, ...fetchOptions } = options;
  
  const headers = await createAuthHeaders(auth);
  
  return fetch(url, {
    ...fetchOptions,
    headers: {
      ...headers,
      ...fetchOptions.headers,
    },
  });
}
