import { verifyMessage } from "viem";
import { isAdmin } from "./admin";

/**
 * Verify admin authentication using wallet signature
 * Prevents header spoofing attacks
 */
export async function verifyAdminAuth(
  walletAddress: string | null,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  if (!walletAddress || !signature || !timestamp) {
    return false;
  }

  // Check if wallet is admin
  if (!isAdmin(walletAddress)) {
    return false;
  }

  // Verify timestamp is recent (prevent replay attacks)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = now - requestTime;

  // Allow 5 minutes window
  if (timeDiff < 0 || timeDiff > 300000) {
    console.log(`[Auth] Timestamp expired or invalid: ${timeDiff}ms`);
    return false;
  }

  // Verify signature
  try {
    const message = `PixPot Admin Auth\nTimestamp: ${timestamp}`;
    const isValid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    return isValid;
  } catch (error) {
    console.error("[Auth] Signature verification failed:", error);
    return false;
  }
}
