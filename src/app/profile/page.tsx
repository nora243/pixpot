"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import SecureImage from "@/components/SecureImage";
import { isAdmin } from "@/lib/admin";
import { PIXPOT_CONTRACT_ADDRESS, PIXPOT_CONTRACT_ABI } from "@/lib/contract";
import { formatEther } from "viem";
import sdk from "@farcaster/miniapp-sdk";

type ProfileStats = {
  totalPixelsRevealed: number;
  totalGuesses: number;
  correctGuesses: number;
  gamesWon: number;
  totalPrizesWon: string;
  totalPrizesClaimed: string;
  totalPrizesUnclaimed: string;
};

type ParticipatedImage = {
  id: number;
  filename: string;
  original_name: string;
  answer: string;
  status: string;
  pool_amount: string;
  winner_address: string | null;
  updated_at: string;
  user_pixels: number;
  user_guesses: number;
  user_correct_guesses: number;
};

type RecentGuess = {
  guess_text: string;
  is_correct: boolean;
  created_at: string;
  filename: string;
  original_name: string;
  image_id: number;
  answer: string;
};

type UnclaimedPrize = {
  gameId: bigint;
  onchain_game_id: number;
  answer: string;
  filename: string;
  original_name: string;
  poolAmount: string;
  winnerAmount: string;
  isClaimed: boolean;
};

type RevealerPrize = {
  gameId: bigint;
  onchain_game_id: number;
  filename: string;
  original_name: string;
  poolAmount: string;
  revealerAmount: string;
  isClaimed: boolean;
  isDistributed: boolean;
  userContribution: number;
};

type ToastMessage = {
  type: "success" | "error" | "info";
  title: string;
  message: string;
};

// Toast Notification Component
function Toast({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: "from-green-500 via-emerald-400 to-green-600",
    error: "from-red-500 via-rose-400 to-red-600",
    info: "from-blue-500 via-cyan-400 to-blue-600",
  };

  const icons = {
    success: "✓",
    error: "✗",
    info: "ℹ",
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className={`relative p-[3px] rounded-xl bg-linear-to-br ${bgColors[toast.type]} shadow-lg shadow-${toast.type === 'success' ? 'green' : toast.type === 'error' ? 'red' : 'blue'}-500/30 min-w-[320px]`}>
        <div className="rounded-[11px] bg-zinc-900 p-4">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${toast.type === 'success' ? 'bg-green-500' :
                toast.type === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
              }`}>
              {icons[toast.type]}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm mb-1">{toast.title}</h4>
              <p className="text-xs text-zinc-400">{toast.message}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component to show unclaimed prizes
function UnclaimedPrizesTab({ address }: { address: string | undefined }) {
  const [prizes, setPrizes] = useState<UnclaimedPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (address) {
      loadPrizes();
    }
  }, [address]);

  async function loadPrizes() {
    if (!address || !publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    setLoading(true);
    try {
      // Get all games where user won from database
      const response = await fetch(`/api/claim-prize?address=${address}`);
      const data = await response.json();

      if (data.prizes && Array.isArray(data.prizes)) {
        const prizesWithStatus: UnclaimedPrize[] = [];

        for (const prize of data.prizes) {
          try {
            const gameId = BigInt(prize.onchain_game_id);

            // Get game info from contract
            const game = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'getGame',
              args: [gameId],
            }) as any;

            // Get prize info from contract
            const gamePrize = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'prizes',
              args: [gameId, '0x0000000000000000000000000000000000000000' as `0x${string}`],
            }) as any;

            const winnerClaimed = gamePrize[3] || false; // winnerClaimed is index 3
            const winnerAmount = gamePrize[0] || BigInt(0); // winnerAmount is index 0
            const poolAmount = game.poolAmount || BigInt(0); // poolAmount from game object

            prizesWithStatus.push({
              ...prize,
              gameId,
              poolAmount: formatEther(poolAmount),
              winnerAmount: formatEther(winnerAmount),
              isClaimed: winnerClaimed,
            });
          } catch (err) {
            console.error(`Error checking prize for game ${prize.onchain_game_id}:`, err);
          }
        }

        setPrizes(prizesWithStatus);
      }
    } catch (error) {
      console.error("Failed to load prizes:", error);
      setToast({
        type: "error",
        title: "Failed to Load Prizes",
        message: "Could not fetch your prize information. Please try again."
      });
    } finally {
      setLoading(false);
    }
  }

  async function claimPrize(prize: UnclaimedPrize) {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    if (prize.isClaimed) {
      setToast({
        type: "info",
        title: "Already Claimed",
        message: "This prize has already been claimed."
      });
      return;
    }

    setClaiming(prize.onchain_game_id);
    setToast({
      type: "info",
      title: "Claiming Prize...",
      message: "Please confirm the transaction in your wallet."
    });

    try {
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "claimWinnerPrize",
        args: [prize.gameId],
      });

      setToast({
        type: "info",
        title: "Transaction Sent",
        message: "Waiting for confirmation..."
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });

      setToast({
        type: "success",
        title: "Prize Claimed!",
        message: `You received ${prize.winnerAmount} ETH. Congratulations! 🎉`
      });

      // Reload prizes after 2 seconds
      setTimeout(() => loadPrizes(), 2000);
    } catch (error: any) {
      console.error("Error claiming prize:", error);

      let errorMessage = "Unknown error occurred";
      if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction was rejected";
      } else if (error.message?.includes("already claimed")) {
        errorMessage = "Prize already claimed";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setToast({
        type: "error",
        title: "Claim Failed",
        message: errorMessage
      });
    } finally {
      setClaiming(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
        <p className="mt-4 text-zinc-400">Loading prizes from blockchain...</p>
      </div>
    );
  }

  const unclaimedPrizes = prizes.filter(p => !p.isClaimed);
  const claimedPrizes = prizes.filter(p => p.isClaimed);

  return (
    <>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="space-y-6">
        {/* Unclaimed Prizes */}
        {unclaimedPrizes.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-yellow-400">🎁 Ready to Claim</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unclaimedPrizes.map((prize) => (
                <div
                  key={prize.onchain_game_id}
                  className="relative p-[3px] rounded-xl bg-linear-to-br from-yellow-500 via-orange-400 to-yellow-600 shadow-lg shadow-yellow-500/30"
                >
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">🏆</div>
                      <div className="text-sm text-zinc-400">Game #{prize.onchain_game_id}</div>
                    </div>

                    <SecureImage
                      filename={prize.filename}
                      alt={prize.original_name}
                      className="w-full aspect-square object-cover rounded mb-3"
                    />

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Winner Prize:</span>
                        <span className="font-bold text-yellow-400">{prize.winnerAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Total Pool:</span>
                        <span className="font-medium text-cyan-400">{prize.poolAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Status:</span>
                        <span className="font-medium text-yellow-400">⏳ Unclaimed</span>
                      </div>
                    </div>

                    <button
                      onClick={() => claimPrize(prize)}
                      disabled={claiming === prize.onchain_game_id}
                      className="w-full group relative overflow-hidden rounded-lg bg-linear-to-r from-yellow-500/90 via-orange-400/90 to-yellow-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-yellow-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-4 py-3 transition-all">
                        <span className="text-sm font-semibold text-white">
                          {claiming === prize.onchain_game_id ? "Claiming..." : "🎉 Claim Prize"}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claimed Prizes */}
        {claimedPrizes.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-green-400">✓ Already Claimed</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {claimedPrizes.map((prize) => (
                <div
                  key={prize.onchain_game_id}
                  className="relative p-[3px] rounded-xl bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-lg shadow-green-500/20 opacity-75"
                >
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">✅</div>
                      <div className="text-sm text-zinc-400">Game #{prize.onchain_game_id}</div>
                    </div>

                    <SecureImage
                      filename={prize.filename}
                      alt={prize.original_name}
                      className="w-full aspect-square object-cover rounded mb-3 grayscale"
                    />

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Winner Prize:</span>
                        <span className="font-bold text-green-400">{prize.winnerAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Total Pool:</span>
                        <span className="font-medium text-cyan-400">{prize.poolAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Status:</span>
                        <span className="font-medium text-green-400">✓ Claimed</span>
                      </div>
                    </div>

                    <div className="w-full rounded-lg bg-green-500/10 border border-green-400/20 px-4 py-3">
                      <span className="text-sm font-semibold text-green-400">
                        Already Claimed
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No prizes */}
        {prizes.length === 0 && (
          <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
            <div className="rounded-[11px] bg-zinc-900 p-8 text-center">
              <div className="text-6xl mb-4">🏆</div>
              <h3 className="text-xl font-bold mb-2">No Prizes Yet</h3>
              <p className="text-zinc-400">
                Win games to earn prizes!
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Component to show revealer prizes
function RevealerPrizesTab({ address }: { address: string | undefined }) {
  const [prizes, setPrizes] = useState<RevealerPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    if (address) {
      loadRevealerPrizes();
    }
  }, [address]);

  async function loadRevealerPrizes() {
    if (!address || !publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    setLoading(true);
    try {
      // Get all completed games where user revealed pixels
      const response = await fetch(`/api/profile?address=${address}`);
      const data = await response.json();

      if (data.participatedImages && Array.isArray(data.participatedImages)) {
        const revealerPrizes: RevealerPrize[] = [];

        for (const img of data.participatedImages) {
          // Only check completed games with onchain_game_id
          if (img.status !== 'completed' || !img.onchain_game_id) {
            continue;
          }

          try {
            const gameId = BigInt(img.onchain_game_id);

            // Check if user is the winner (winners can't claim revealer prizes)
            if (img.winner_address && img.winner_address.toLowerCase() === address.toLowerCase()) {
              continue;
            }

            // Get user's contribution from blockchain (don't rely on database user_pixels)
            const contribution = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'getUserContribution',
              args: [gameId, address as `0x${string}`],
            }) as bigint;

            if (contribution === BigInt(0)) {
              continue;
            }

            // Get user's prize info
            const userPrize = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'getUserPrize',
              args: [gameId, address as `0x${string}`],
            }) as [bigint, boolean];

            const [amount, claimed] = userPrize;

            // Get game prize info to check if distributed
            const gamePrize = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'prizes',
              args: [gameId, '0x0000000000000000000000000000000000000000' as `0x${string}`],
            }) as any;

            const revealsDistributed = gamePrize[4] || false; // revealsDistributed is index 4

            // Get game info for pool amount
            const game = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'getGame',
              args: [gameId],
            }) as any;

            const poolAmount = game.poolAmount || BigInt(0);

            // Show if user has contribution (revealed pixels)
            // Even if prizes not yet distributed, user should see pending status
            revealerPrizes.push({
              gameId,
              onchain_game_id: img.onchain_game_id,
              filename: img.filename,
              original_name: img.original_name,
              poolAmount: formatEther(poolAmount),
              revealerAmount: formatEther(amount),
              isClaimed: claimed,
              isDistributed: revealsDistributed,
              userContribution: Number(contribution),
            });
          } catch (err) {
            console.error(`[RevealerPrizes] Error checking revealer prize for game ${img.onchain_game_id}:`, err);
          }
        }

        setPrizes(revealerPrizes);
      }
    } catch (error) {
      console.error("Failed to load revealer prizes:", error);
      setToast({
        type: "error",
        title: "Failed to Load Prizes",
        message: "Could not fetch your revealer prize information."
      });
    } finally {
      setLoading(false);
    }
  }

  async function claimRevealerPrize(prize: RevealerPrize) {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    if (prize.isClaimed) {
      setToast({
        type: "info",
        title: "Already Claimed",
        message: "This revealer prize has already been claimed."
      });
      return;
    }

    if (!prize.isDistributed) {
      setToast({
        type: "info",
        title: "Not Distributed Yet",
        message: "The admin needs to distribute revealer prizes first."
      });
      return;
    }

    setClaiming(prize.onchain_game_id);
    setToast({
      type: "info",
      title: "Claiming Prize...",
      message: "Please confirm the transaction in your wallet."
    });

    try {
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "claimMyRevealerPrize",
        args: [prize.gameId],
      });

      setToast({
        type: "info",
        title: "Transaction Sent",
        message: "Waiting for confirmation..."
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });

      setToast({
        type: "success",
        title: "Prize Claimed!",
        message: `You received ${prize.revealerAmount} ETH for revealing pixels! 🎉`
      });

      setTimeout(() => loadRevealerPrizes(), 2000);
    } catch (error: any) {
      console.error("Error claiming revealer prize:", error);

      let errorMessage = "Unknown error occurred";
      if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction was rejected";
      } else if (error.message?.includes("already claimed")) {
        errorMessage = "Prize already claimed";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setToast({
        type: "error",
        title: "Claim Failed",
        message: errorMessage
      });
    } finally {
      setClaiming(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
        <p className="mt-4 text-zinc-400">Loading revealer prizes...</p>
      </div>
    );
  }

  const unclaimedPrizes = prizes.filter(p => !p.isClaimed && p.isDistributed);
  const pendingPrizes = prizes.filter(p => !p.isDistributed);
  const claimedPrizes = prizes.filter(p => p.isClaimed);

  return (
    <>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

      <div className="space-y-6">
        {/* Unclaimed Revealer Prizes */}
        {unclaimedPrizes.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-cyan-400">💎 Ready to Claim (Revealer Rewards)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unclaimedPrizes.map((prize) => (
                <div
                  key={prize.onchain_game_id}
                  className="relative p-[3px] rounded-xl bg-linear-to-br from-cyan-500 via-blue-400 to-cyan-600 shadow-lg shadow-cyan-500/30"
                >
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">💎</div>
                      <div className="text-sm text-zinc-400">Game #{prize.onchain_game_id}</div>
                    </div>

                    <SecureImage
                      filename={prize.filename}
                      alt={prize.original_name}
                      className="w-full aspect-square object-cover rounded mb-3"
                    />

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Your Reward:</span>
                        <span className="font-bold text-cyan-400">{prize.revealerAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Pixels Revealed:</span>
                        <span className="font-medium text-blue-400">{prize.userContribution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Status:</span>
                        <span className="font-medium text-cyan-400">⏳ Ready</span>
                      </div>
                    </div>

                    <button
                      onClick={() => claimRevealerPrize(prize)}
                      disabled={claiming === prize.onchain_game_id}
                      className="w-full group relative overflow-hidden rounded-lg bg-linear-to-r from-cyan-500/90 via-blue-400/90 to-cyan-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-4 py-3 transition-all">
                        <span className="text-sm font-semibold text-white">
                          {claiming === prize.onchain_game_id ? "Claiming..." : "💎 Claim Reward"}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Distribution */}
        {pendingPrizes.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-orange-400">⏳ Pending Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingPrizes.map((prize) => (
                <div
                  key={prize.onchain_game_id}
                  className="relative p-[3px] rounded-xl bg-linear-to-br from-orange-500 via-amber-400 to-orange-600 shadow-lg shadow-orange-500/20 opacity-75"
                >
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">⏳</div>
                      <div className="text-sm text-zinc-400">Game #{prize.onchain_game_id}</div>
                    </div>

                    <SecureImage
                      filename={prize.filename}
                      alt={prize.original_name}
                      className="w-full aspect-square object-cover rounded mb-3"
                    />

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Pool Amount:</span>
                        <span className="font-bold text-purple-400">{prize.poolAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Revealer Pool (30%):</span>
                        <span className="font-medium text-cyan-400">{(parseFloat(prize.poolAmount) * 0.3).toFixed(6)} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Pixels Revealed:</span>
                        <span className="font-medium text-blue-400">{prize.userContribution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Status:</span>
                        <span className="font-medium text-orange-400">Pending</span>
                      </div>
                    </div>

                    <div className="w-full rounded-lg bg-orange-500/10 border border-orange-400/20 px-4 py-3">
                      <div className="text-xs text-orange-400 mb-1">⏳ Waiting for Admin Distribution</div>
                      <div className="text-xs text-zinc-500">Your share will be based on your contribution</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claimed Prizes */}
        {claimedPrizes.length > 0 && (
          <div>
            <h3 className="text-lg font-bold mb-4 text-green-400">✓ Already Claimed</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {claimedPrizes.map((prize) => (
                <div
                  key={prize.onchain_game_id}
                  className="relative p-[3px] rounded-xl bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-lg shadow-green-500/20 opacity-75"
                >
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-center mb-3">
                      <div className="text-4xl mb-2">✅</div>
                      <div className="text-sm text-zinc-400">Game #{prize.onchain_game_id}</div>
                    </div>

                    <SecureImage
                      filename={prize.filename}
                      alt={prize.original_name}
                      className="w-full aspect-square object-cover rounded mb-3 grayscale"
                    />

                    <div className="space-y-2 text-sm mb-4">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Claimed:</span>
                        <span className="font-bold text-green-400">{prize.revealerAmount} ETH</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Pixels Revealed:</span>
                        <span className="font-medium text-blue-400">{prize.userContribution}</span>
                      </div>
                    </div>

                    <div className="w-full rounded-lg bg-green-500/10 border border-green-400/20 px-4 py-3">
                      <span className="text-sm font-semibold text-green-400">
                        Already Claimed
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No prizes */}
        {prizes.length === 0 && (
          <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
            <div className="rounded-[11px] bg-zinc-900 p-8 text-center">
              <div className="text-6xl mb-4">💎</div>
              <h3 className="text-xl font-bold mb-2">No Revealer Prizes</h3>
              <p className="text-zinc-400">
                Reveal pixels in games to earn rewards!
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [participatedImages, setParticipatedImages] = useState<ParticipatedImage[]>([]);
  const [recentGuesses, setRecentGuesses] = useState<RecentGuess[]>([]);
  const [activeTab, setActiveTab] = useState<"prizes" | "revealers" | "images" | "guesses">("prizes");
  const [user, setUser] = useState<any>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);

  useEffect(() => {
    if (address && publicClient) {
      loadProfile();
    }
  }, [address, publicClient]);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Check if we're in a Mini App
        const miniAppStatus = await sdk.isInMiniApp();
        setIsInMiniApp(miniAppStatus);

        if (miniAppStatus) {
          // Get context and extract user info
          const context = await sdk.context;
          setUser(context.user);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };

    loadUserData();
  }, []);

  async function loadProfile() {
    if (!address || !publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    setLoading(true);
    try {
      // Load off-chain data from database
      const res = await fetch(`/api/profile?address=${address}`);
      if (res.ok) {
        const data = await res.json();
        setParticipatedImages(data.participatedImages);
        setRecentGuesses(data.recentGuesses);

        // Calculate on-chain stats
        const wonGames = await fetch(`/api/claim-prize?address=${address}`);
        const wonData = await wonGames.json();

        let totalWon = BigInt(0);
        let totalClaimed = BigInt(0);
        let gamesWon = 0;

        if (wonData.prizes && Array.isArray(wonData.prizes)) {
          for (const prize of wonData.prizes) {
            try {
              const gameId = BigInt(prize.onchain_game_id);

              // Get prize info from contract
              const gamePrize = await publicClient.readContract({
                address: PIXPOT_CONTRACT_ADDRESS,
                abi: PIXPOT_CONTRACT_ABI,
                functionName: 'prizes',
                args: [gameId, '0x0000000000000000000000000000000000000000' as `0x${string}`],
              }) as any;

              const winnerAmount = gamePrize[0] || BigInt(0); // winnerAmount
              const winnerClaimed = gamePrize[3] || false; // winnerClaimed

              // Only count if winnerAmount is valid
              if (winnerAmount && winnerAmount > BigInt(0)) {
                totalWon += winnerAmount;
                if (winnerClaimed) {
                  totalClaimed += winnerAmount;
                }
                gamesWon++;
              }
            } catch (err) {
              console.error(`Error calculating stats for game ${prize.onchain_game_id}:`, err);
            }
          }
        }

        const totalUnclaimed = totalWon - totalClaimed;

        setStats({
          totalPixelsRevealed: data.stats?.totalPixelsRevealed || 0,
          totalGuesses: data.stats?.totalGuesses || 0,
          correctGuesses: data.stats?.correctGuesses || 0,
          gamesWon,
          totalPrizesWon: formatEther(totalWon),
          totalPrizesClaimed: formatEther(totalClaimed),
          totalPrizesUnclaimed: formatEther(totalUnclaimed),
        });
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-zinc-50">
        {/* Animated pixel grid background */}
        <div className="absolute inset-0 opacity-20">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
              animation: 'pixelShift 20s linear infinite'
            }}
          />
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10">
          <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <Link href="/" className="flex items-center gap-2 sm:gap-3">
                <img src="/logo.png" alt="PixPot Logo" className="h-7 w-7 sm:h-8 sm:w-8 rounded shadow-lg" />
                <span className="text-base sm:text-lg font-bold bg-linear-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">PixPot</span>
              </Link>
              <div className="scale-90 sm:scale-100 origin-right">
                <ConnectButton accountStatus="avatar" />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <div className="text-center">
              <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20 inline-block">
                <div className="rounded-[11px] bg-zinc-900 px-8 py-12">
                  <h1 className="text-2xl font-bold mb-4"> Profile</h1>
                  <p className="text-zinc-400 mb-6">
                    Please connect your wallet to view your profile
                  </p>
                  <ConnectButton accountStatus="avatar" />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-zinc-50">
      {/* Animated pixel grid background */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            animation: 'pixelShift 20s linear infinite'
          }}
        />
      </div>

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="relative z-10">
        <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <Link href="/" className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="PixPot Logo" className="h-7 w-7 sm:h-8 sm:w-8 rounded shadow-lg" />
              <span className="text-base sm:text-lg font-bold bg-linear-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">PixPot</span>
            </Link>
            <div className="scale-90 sm:scale-100 origin-right">
              <ConnectButton accountStatus="avatar" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div className="mb-8">
            {/* Farcaster Profile Section */}
            {isInMiniApp && user && (
              <div className="relative p-[3px] rounded-xl bg-linear-to-br from-purple-500 via-pink-400 to-purple-600 shadow-lg shadow-purple-500/30 mb-6">
                <div className="rounded-[11px] bg-zinc-900 p-6">
                  <div className="flex items-center gap-4">
                    {user.pfpUrl ? (
                      <img
                        src={user.pfpUrl}
                        alt={user.displayName || user.username}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-full ring-4 ring-purple-400/30"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold ring-4 ring-purple-400/30">
                        {user.displayName?.[0] || user.username?.[0] || 'F'}
                      </div>
                    )}

                    <div className="flex-1">
                      {user.displayName && (
                        <h2 className="text-xl sm:text-2xl font-bold mb-1">{user.displayName}</h2>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-purple-400 font-medium">@{user.username || `fid:${user.fid}`}</span>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-400">FID: {user.fid}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Info and Admin Button */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                  {isInMiniApp && user ? 'Game Stats' : 'Your Profile'}
                </h1>
                <p className="text-sm text-zinc-400 font-mono">
                  {address?.slice(0, 10)}...{address?.slice(-8)}
                </p>
              </div>
              {isAdmin(address) && (
                <Link
                  href="/admin"
                  className="group relative overflow-hidden rounded-lg bg-linear-to-r from-blue-500/90 via-cyan-400/90 to-blue-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/40"
                >
                  <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-4 py-2 transition-all">
                    <span className="text-sm font-semibold text-white">⚙️ Admin Panel</span>
                  </div>
                </Link>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
              <p className="mt-4 text-zinc-400">Loading profile...</p>
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Total Pixels Revealed</div>
                    <div className="text-2xl font-bold text-blue-400">{stats?.totalPixelsRevealed || 0}</div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Total Guesses</div>
                    <div className="text-2xl font-bold text-cyan-400">{stats?.totalGuesses || 0}</div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Correct Guesses</div>
                    <div className="text-2xl font-bold text-green-400">
                      {stats?.correctGuesses || 0}
                      <span className="text-sm text-zinc-500 ml-2">
                        ({stats?.totalGuesses ? ((stats.correctGuesses / stats.totalGuesses) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-yellow-500 via-orange-400 to-yellow-600 shadow-lg shadow-yellow-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Games Won</div>
                    <div className="text-2xl font-bold text-yellow-400">🏆 {stats?.gamesWon || 0}</div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-yellow-500 via-orange-400 to-yellow-600 shadow-lg shadow-yellow-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Total Prizes Won</div>
                    <div className="text-xl font-bold text-yellow-400">{stats?.totalPrizesWon || "0"} ETH</div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-lg shadow-green-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Prizes Claimed</div>
                    <div className="text-xl font-bold text-green-400">{stats?.totalPrizesClaimed || "0"} ETH</div>
                  </div>
                </div>

                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-orange-500 via-amber-400 to-orange-600 shadow-lg shadow-orange-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    <div className="text-sm text-zinc-400 mb-1">Unclaimed Prizes</div>
                    <div className="text-xl font-bold text-orange-400">{stats?.totalPrizesUnclaimed || "0"} ETH</div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-6">
                <div className="flex gap-2 border-b border-white/10">
                  <button
                    onClick={() => setActiveTab("prizes")}
                    className={`px-4 py-2 font-medium transition-colors ${activeTab === "prizes"
                        ? "text-cyan-400 border-b-2 border-cyan-400"
                        : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    🏆 Winner Prizes
                  </button>
                  <button
                    onClick={() => setActiveTab("revealers")}
                    className={`px-4 py-2 font-medium transition-colors ${activeTab === "revealers"
                        ? "text-cyan-400 border-b-2 border-cyan-400"
                        : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    💎 Revealer Prizes
                  </button>
                  <button
                    onClick={() => setActiveTab("images")}
                    className={`px-4 py-2 font-medium transition-colors ${activeTab === "images"
                        ? "text-cyan-400 border-b-2 border-cyan-400"
                        : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    Participated Images ({participatedImages.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("guesses")}
                    className={`px-4 py-2 font-medium transition-colors ${activeTab === "guesses"
                        ? "text-cyan-400 border-b-2 border-cyan-400"
                        : "text-zinc-400 hover:text-zinc-200"
                      }`}
                  >
                    Recent Guesses ({recentGuesses.length})
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === "prizes" && (
                <UnclaimedPrizesTab address={address} />
              )}

              {activeTab === "revealers" && (
                <RevealerPrizesTab address={address} />
              )}

              {activeTab === "images" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {participatedImages.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-zinc-400">
                      No participated images yet. Start playing to see your history!
                    </div>
                  ) : (
                    participatedImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20"
                      >
                        <div className="rounded-[11px] bg-zinc-900 p-4">
                          <SecureImage
                            filename={img.filename}
                            alt={img.original_name}
                            className="w-full aspect-square object-cover rounded mb-3"
                          />
                          <div className="space-y-2 text-sm">
                            <div className="font-medium">
                              <span className="text-zinc-400">Status: </span>
                              <span className={
                                img.status === 'completed' ? 'text-green-400' :
                                  img.status === 'active' ? 'text-blue-400' :
                                    img.status === 'suspended' ? 'text-orange-400' :
                                      'text-zinc-400'
                              }>
                                {img.status}
                              </span>
                            </div>
                            {img.status === 'completed' && (
                              <div className="text-green-400">
                                ✓ Answer: {img.answer}
                              </div>
                            )}
                            <div className="text-zinc-400">
                              Your pixels: <span className="font-medium text-blue-400">{img.user_pixels}</span>
                            </div>
                            <div className="text-zinc-400">
                              Your guesses: <span className="font-medium text-cyan-400">{img.user_guesses}</span>
                              {img.user_correct_guesses > 0 && (
                                <span className="text-green-400 ml-1">({img.user_correct_guesses} correct)</span>
                              )}
                            </div>
                            {img.winner_address === address && (
                              <div className="mt-2 p-2 rounded bg-yellow-400/10 border border-yellow-400/20">
                                <span className="text-yellow-400 font-medium">🏆 Winner! Prize: {(parseFloat(img.pool_amount) * 0.7).toFixed(8)} ETH (70%)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "guesses" && (
                <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
                  <div className="rounded-[11px] bg-zinc-900 p-4">
                    {recentGuesses.length === 0 ? (
                      <div className="text-center py-12 text-zinc-400">
                        No guesses yet. Try guessing an answer!
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {recentGuesses.map((guess, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded transition-colors ${guess.is_correct
                                ? "bg-green-100 dark:bg-green-900/20 border border-green-400/20"
                                : "bg-zinc-800"
                              }`}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">
                                {guess.original_name}
                              </div>
                              <div className="text-xs text-zinc-400 mt-1">
                                Your guess: <span className="font-mono">{guess.guess_text}</span>
                                {guess.is_correct ? (
                                  <span className="text-green-400 ml-2">✓ Correct!</span>
                                ) : (
                                  <span className="text-red-400 ml-2">✗ Incorrect</span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-zinc-500">
                              {new Date(guess.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
