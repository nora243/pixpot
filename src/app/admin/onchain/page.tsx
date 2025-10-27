"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWriteContract, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { PIXPOT_CONTRACT_ADDRESS, PIXPOT_CONTRACT_ABI } from "@/lib/contract";

type OnchainGame = {
  gameId: number;
  imageHash: string;
  totalPixels: number;
  revealedPixels: number;
  poolAmount: string;
  poolClaimed: string;
  winner: string;
  isActive: boolean;
  isCompleted: boolean;
  revealsDistributed: boolean;
  createdAt: number;
  endedAt: number;
};

type ContractStats = {
  totalGames: number;
  activeGames: number;
  completedGames: number;
  totalPoolAmount: string;
  totalClaimedAmount: string;
  contractBalance: string;
  guessFee: string;
  winnerPercentage: number;
  revealerPercentage: number;
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
      <div className={`relative p-[3px] rounded-xl bg-linear-to-br ${bgColors[toast.type]} shadow-lg shadow-${toast.type === 'success' ? 'green' : toast.type === 'error' ? 'red' : 'blue'}-500/30 min-w-[320px] max-w-md`}>
        <div className="rounded-[11px] bg-zinc-900 p-4">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
              toast.type === 'success' ? 'bg-green-500' :
              toast.type === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            }`}>
              {icons[toast.type]}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm mb-1">{toast.title}</h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{toast.message}</p>
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

// Delete Confirmation Modal Component
function DeleteConfirmModal({ 
  gameId, 
  onConfirm, 
  onCancel 
}: { 
  gameId: number; 
  onConfirm: () => void; 
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative p-[3px] rounded-2xl bg-linear-to-br from-red-500 via-rose-400 to-red-600 shadow-2xl shadow-red-500/40 max-w-md w-full animate-scale-in">
        <div className="rounded-[14px] bg-zinc-900 p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-6">
            <div className="shrink-0 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">Delete Game #{gameId}?</h3>
              <p className="text-sm text-zinc-400">This action cannot be undone</p>
            </div>
          </div>

          {/* Warning Message */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-200 mb-3 font-semibold">This will permanently:</p>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0">●</span>
                <span>Remove game from blockchain contract</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0">●</span>
                <span>Return pool amount to owner wallet</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 shrink-0">●</span>
                <span>Delete all game data (cannot be recovered)</span>
              </li>
            </ul>
          </div>

          {/* Note */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
            <p className="text-xs text-yellow-200">
              <strong>Note:</strong> Only games without a winner can be deleted. This ensures player prize safety.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 rounded-lg bg-linear-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-bold transition-all hover:scale-105"
            >
              🗑️ Delete Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnchainInfoPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<OnchainGame[]>([]);
  const [stats, setStats] = useState<ContractStats | null>(null);
  const [syncingGame, setSyncingGame] = useState<number | null>(null);
  const [distributingGame, setDistributingGame] = useState<number | null>(null);
  const [deletingGame, setDeletingGame] = useState<number | null>(null);
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<number | null>(null);
  const [contractAddress, setContractAddress] = useState<string>("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmingGame, setConfirmingGame] = useState<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    if (isConnected && isAdmin(address || "")) {
      loadOnchainData();
    }
  }, [address, isConnected]);

  async function loadOnchainData() {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    setLoading(true);
    setContractAddress(PIXPOT_CONTRACT_ADDRESS);

    try {
      // Get all game IDs
      const gameIds = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'getAllGameIds',
      }) as bigint[];

      console.log("Game IDs from contract:", gameIds);

      // Load each game
      const gamesData: OnchainGame[] = [];
      let totalPool = BigInt(0);
      let totalClaimed = BigInt(0);
      let activeCount = 0;
      let completedCount = 0;

      for (const gameId of gameIds) {
        try {
          const game = await publicClient.readContract({
            address: PIXPOT_CONTRACT_ADDRESS,
            abi: PIXPOT_CONTRACT_ABI,
            functionName: 'getGame',
            args: [gameId],
          }) as any;

          const poolWei = game.poolAmount || BigInt(0);
          const poolClaimedWei = game.poolClaimed || BigInt(0);
          const isActive = game.isActive || false;
          const isCompleted = game.isCompleted || false;
          const winner = game.winner || '0x0000000000000000000000000000000000000000';

          // Check if revealer prizes have been distributed
          let revealsDistributed = false;
          try {
            const gamePrize = await publicClient.readContract({
              address: PIXPOT_CONTRACT_ADDRESS,
              abi: PIXPOT_CONTRACT_ABI,
              functionName: 'prizes',
              args: [gameId, '0x0000000000000000000000000000000000000000' as `0x${string}`],
            }) as any;
            revealsDistributed = gamePrize[4] || gamePrize.revealsDistributed || false;
          } catch (err) {
            // Prize may not exist yet
          }

          gamesData.push({
            gameId: Number(gameId),
            imageHash: game.imageHash || '',
            totalPixels: Number(game.totalPixels || 0),
            revealedPixels: Number(game.revealedPixels || 0),
            poolAmount: (Number(poolWei) / 1e18).toFixed(8),
            poolClaimed: (Number(poolClaimedWei) / 1e18).toFixed(8),
            winner: winner,
            isActive: isActive,
            isCompleted: isCompleted,
            revealsDistributed: revealsDistributed,
            createdAt: Number(game.createdAt || 0),
            endedAt: Number(game.endedAt || 0),
          });

          if (poolWei) totalPool = totalPool + BigInt(poolWei);
          if (poolClaimedWei) totalClaimed = totalClaimed + BigInt(poolClaimedWei);
          
          if (isActive) activeCount++;
          if (winner !== '0x0000000000000000000000000000000000000000') completedCount++;
        } catch (err) {
          console.error(`Error loading game ${gameId}:`, err);
        }
      }

      // Sort by gameId descending
      gamesData.sort((a, b) => b.gameId - a.gameId);
      setGames(gamesData);

      // Get contract stats
      const guessFee = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'guessFee',
      }) as bigint;

      const winnerPercentage = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'winnerPercentage',
      }) as bigint;

      const revealerPercentage = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'revealerPercentage',
      }) as bigint;

      // Get contract balance
      const balance = await publicClient.getBalance({
        address: PIXPOT_CONTRACT_ADDRESS,
      });

      setStats({
        totalGames: gamesData.length,
        activeGames: activeCount,
        completedGames: completedCount,
        totalPoolAmount: (Number(totalPool) / 1e18).toFixed(8),
        totalClaimedAmount: (Number(totalClaimed) / 1e18).toFixed(8),
        contractBalance: (Number(balance) / 1e18).toFixed(8),
        guessFee: (Number(guessFee) / 1e18).toFixed(8),
        winnerPercentage: Number(winnerPercentage),
        revealerPercentage: Number(revealerPercentage),
      });
    } catch (error) {
      console.error("Failed to load onchain data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function syncGameToDatabase(gameId: number) {
    setSyncingGame(gameId);
    try {
      // Find game data to get pool amount
      const game = games.find(g => g.gameId === gameId);
      const poolAmount = game?.poolAmount || "0";
      
      const response = await fetch("/api/admin/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          onchainGameId: gameId,
          autoActivate: true,
          poolAmount: poolAmount
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setToast({
          type: "success",
          title: "Sync Successful",
          message: `Game #${gameId} synced to database successfully! Pool: ${poolAmount} ETH`
        });
      } else {
        setToast({
          type: "error",
          title: "Sync Failed",
          message: result.error || "Unknown error occurred"
        });
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      setToast({
        type: "error",
        title: "Sync Error",
        message: error.message || "Failed to sync game to database"
      });
    } finally {
      setSyncingGame(null);
    }
  }

  async function distributeRevealerPrizes(gameId: number) {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    setDistributingGame(gameId);
    setToast({
      type: "info",
      title: "Transaction Sent",
      message: `Distributing revealer prizes for Game #${gameId}...`
    });

    try {
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "claimRevealerPrizes",
        args: [BigInt(gameId)],
      });

      setToast({
        type: "info",
        title: "Waiting for Confirmation",
        message: `Transaction hash: ${tx.slice(0, 10)}...${tx.slice(-8)}`
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });

      setToast({
        type: "success",
        title: "Prizes Distributed",
        message: `Revealer prizes for Game #${gameId} distributed successfully!`
      });
      
      // Reload data
      setTimeout(() => loadOnchainData(), 2000);
    } catch (error: any) {
      console.error("Distribution error:", error);
      
      let errorMessage = error.message || "Unknown error occurred";
      if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction was rejected";
      } else if (error.message?.includes("already distributed")) {
        errorMessage = "Prizes already distributed for this game";
      } else if (error.message?.includes("not completed")) {
        errorMessage = "Game is not completed yet";
      }
      
      setToast({
        type: "error",
        title: "Distribution Failed",
        message: errorMessage
      });
    } finally {
      setDistributingGame(null);
    }
  }

  async function deleteGame(gameId: number) {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS || !address) return;

    setDeletingGame(gameId);
    setConfirmDeleteGame(null); // Close modal
    setToast({
      type: "info",
      title: "Transaction Sent",
      message: `Deleting Game #${gameId}...`
    });

    try {
      // Step 1: Delete from blockchain
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "deleteGame",
        args: [BigInt(gameId)],
      });

      setToast({
        type: "info",
        title: "Waiting for Confirmation",
        message: `Transaction hash: ${tx.slice(0, 10)}...${tx.slice(-8)}`
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

      setToast({
        type: "info",
        title: "Blockchain Deleted",
        message: `Game #${gameId} removed from blockchain. Now deleting from database...`
      });

      // Step 2: Delete from database
      try {
        const timestamp = Date.now().toString();
        const message = `PixPot Admin Auth\nTimestamp: ${timestamp}`;
        const signature = await signMessageAsync({ message });

        const dbResponse = await fetch(
          `/api/admin/game/delete?onchainGameId=${gameId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": address,
              "x-signature": signature,
              "x-timestamp": timestamp,
            },
          }
        );

        const dbResult = await dbResponse.json();

        if (!dbResponse.ok) {
          console.error("Database deletion failed:", dbResult);
          setToast({
            type: "info",
            title: "Partial Success",
            message: `Game #${gameId} deleted from blockchain but database deletion failed: ${dbResult.error}`
          });
        } else {
          setToast({
            type: "success",
            title: "Game Deleted",
            message: `Game #${gameId} has been completely deleted from blockchain and database!`
          });
        }
      } catch (dbError: any) {
        console.error("Database deletion error:", dbError);
        setToast({
          type: "info",
          title: "Partial Success",
          message: `Game #${gameId} deleted from blockchain but database deletion failed.`
        });
      }
      
      // Reload data
      setTimeout(() => loadOnchainData(), 2000);
    } catch (error: any) {
      console.error("Delete error:", error);
      
      let errorMessage = error.message || "Unknown error occurred";
      if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction was rejected";
      } else if (error.message?.includes("game with a winner")) {
        errorMessage = "Cannot delete a game that has a winner";
      } else if (error.message?.includes("does not exist")) {
        errorMessage = "Game does not exist";
      }
      
      setToast({
        type: "error",
        title: "Delete Failed",
        message: errorMessage
      });
    } finally {
      setDeletingGame(null);
    }
  }

  async function handleWithdraw() {
    if (!publicClient || !PIXPOT_CONTRACT_ADDRESS || !withdrawAmount) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setToast({
        type: "error",
        title: "Invalid Amount",
        message: "Please enter a valid amount greater than 0"
      });
      return;
    }

    const contractBalance = parseFloat(stats?.contractBalance || "0");
    if (amount > contractBalance) {
      setToast({
        type: "error",
        title: "Insufficient Balance",
        message: `Cannot withdraw ${amount} ETH. Contract only has ${contractBalance} ETH`
      });
      return;
    }

    setIsWithdrawing(true);
    setToast({
      type: "info",
      title: "Transaction Sent",
      message: `Withdrawing ${amount} ETH...`
    });

    try {
      const amountWei = BigInt(Math.floor(amount * 1e18));

      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "withdraw",
        args: [amountWei],
      });

      setToast({
        type: "info",
        title: "Waiting for Confirmation",
        message: `Transaction hash: ${tx.slice(0, 10)}...${tx.slice(-8)}`
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

      setToast({
        type: "success",
        title: "Withdrawal Successful",
        message: `Successfully withdrew ${amount} ETH to your wallet!`
      });

      setWithdrawAmount("");
      
      // Reload data
      setTimeout(() => loadOnchainData(), 2000);
    } catch (error: any) {
      console.error("Withdraw error:", error);
      
      let errorMessage = error.message || "Unknown error occurred";
      if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction was rejected";
      } else if (error.message?.includes("Insufficient contract balance")) {
        errorMessage = "Contract doesn't have enough balance";
      }
      
      setToast({
        type: "error",
        title: "Withdrawal Failed",
        message: errorMessage
      });
    } finally {
      setIsWithdrawing(false);
    }
  }

  if (!isConnected || !isAdmin(address || "")) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">⛔ Access Denied</h1>
          <p className="mb-6">Admin access required</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 text-zinc-50">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-20">
        <div 
          className="absolute inset-0" 
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <Link href="/" className="flex items-center gap-2 sm:gap-3">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/50" />
              <span className="text-base sm:text-lg font-bold bg-linear-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">PixPot</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link 
                href="/admin"
                className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors"
              >
                ← Back to Admin
              </Link>
              <ConnectButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">⛓️ Onchain Info</h1>
            <p className="text-zinc-400">Real-time blockchain data from smart contract</p>
            <p className="text-xs text-zinc-500 font-mono mt-2">
              Contract: {contractAddress}
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
              <p className="mt-4 text-zinc-400">Loading blockchain data...</p>
            </div>
          ) : (
            <>
              {/* Contract Stats */}
              {stats && (
                <div className="mb-8">
                  <h2 className="text-xl font-bold mb-4">📊 Contract Statistics</h2>
                  
                  {/* Contract Balance - Featured */}
                  <div className="mb-4">
                    <div className="relative p-1 rounded-xl bg-linear-to-br from-yellow-500 via-amber-400 to-yellow-600 shadow-2xl shadow-yellow-500/40">
                      <div className="rounded-xl bg-zinc-900 p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">💰 Contract Balance</div>
                            <div className="text-4xl font-bold bg-linear-to-r from-yellow-500 via-amber-400 to-yellow-600 bg-clip-text text-transparent">
                              {stats.contractBalance} ETH
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">
                              Available funds in smart contract
                            </div>
                          </div>
                          <div className="text-6xl opacity-20">💎</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Withdraw Section */}
                  <div className="mb-6">
                    <div className="relative p-1 rounded-xl bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-xl shadow-green-500/30">
                      <div className="rounded-xl bg-zinc-900 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">💸</span>
                          <h3 className="text-lg font-bold">Withdraw ETH</h3>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              max={stats?.contractBalance || "0"}
                              value={withdrawAmount}
                              onChange={(e) => setWithdrawAmount(e.target.value)}
                              placeholder="Amount in ETH"
                              disabled={isWithdrawing}
                              className="w-full px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => setWithdrawAmount((parseFloat(stats?.contractBalance || "0") * 0.25).toFixed(4))}
                                disabled={isWithdrawing}
                                className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
                              >
                                25%
                              </button>
                              <button
                                onClick={() => setWithdrawAmount((parseFloat(stats?.contractBalance || "0") * 0.5).toFixed(4))}
                                disabled={isWithdrawing}
                                className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
                              >
                                50%
                              </button>
                              <button
                                onClick={() => setWithdrawAmount((parseFloat(stats?.contractBalance || "0") * 0.75).toFixed(4))}
                                disabled={isWithdrawing}
                                className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
                              >
                                75%
                              </button>
                              <button
                                onClick={() => setWithdrawAmount(stats?.contractBalance || "0")}
                                disabled={isWithdrawing}
                                className="text-xs px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors disabled:opacity-50"
                              >
                                MAX
                              </button>
                            </div>
                          </div>
                          
                          <button
                            onClick={handleWithdraw}
                            disabled={isWithdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                            className="px-6 py-2.5 rounded-lg bg-linear-to-r from-green-500 to-emerald-500 text-white font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            {isWithdrawing ? (
                              <span className="flex items-center gap-2">
                                ⏳ Withdrawing...
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                💸 Withdraw
                              </span>
                            )}
                          </button>
                        </div>
                        
                        <div className="mt-3 text-xs text-zinc-500">
                          <div className="flex items-center gap-1">
                            <span>ℹ️</span>
                            <span>Withdraw ETH from contract to your wallet. Available: <strong className="text-green-400">{stats?.contractBalance || "0"} ETH</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Games</div>
                        <div className="text-2xl font-bold text-blue-400">{stats.totalGames}</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-lg shadow-green-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Active Games</div>
                        <div className="text-2xl font-bold text-green-400">{stats.activeGames}</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-purple-500 via-pink-400 to-purple-600 shadow-lg shadow-purple-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Completed Games</div>
                        <div className="text-2xl font-bold text-purple-400">{stats.completedGames}</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-yellow-500 via-orange-400 to-yellow-600 shadow-lg shadow-yellow-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Guess Fee</div>
                        <div className="text-2xl font-bold text-yellow-400">{stats.guessFee} ETH</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-cyan-500 via-blue-400 to-cyan-600 shadow-lg shadow-cyan-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Pool</div>
                        <div className="text-2xl font-bold text-cyan-400">{stats.totalPoolAmount} ETH</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-orange-500 via-red-400 to-orange-600 shadow-lg shadow-orange-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Total Claimed</div>
                        <div className="text-2xl font-bold text-orange-400">{stats.totalClaimedAmount} ETH</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-indigo-500 via-violet-400 to-indigo-600 shadow-lg shadow-indigo-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Winner %</div>
                        <div className="text-2xl font-bold text-indigo-400">{stats.winnerPercentage}%</div>
                      </div>
                    </div>

                    <div className="relative p-[3px] rounded-xl bg-linear-to-br from-pink-500 via-rose-400 to-pink-600 shadow-lg shadow-pink-500/20">
                      <div className="rounded-[11px] bg-zinc-900 p-4">
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">Revealer %</div>
                        <div className="text-2xl font-bold text-pink-400">{stats.revealerPercentage}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Games List */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">🎮 All Games on Blockchain</h2>
                  <button
                    onClick={loadOnchainData}
                    className="px-4 py-2 rounded-lg bg-linear-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium hover:scale-105 transition-transform"
                  >
                    🔄 Refresh
                  </button>
                </div>

                {games.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    No games found on blockchain
                  </div>
                ) : (
                  <div className="space-y-4">
                    {games.map((game) => (
                      <div
                        key={game.gameId}
                        className={`relative p-[3px] rounded-xl shadow-lg ${
                          game.isActive
                            ? 'bg-linear-to-br from-green-500 via-emerald-400 to-green-600 shadow-green-500/30'
                            : game.winner !== '0x0000000000000000000000000000000000000000'
                            ? 'bg-linear-to-br from-purple-500 via-pink-400 to-purple-600 shadow-purple-500/20'
                            : 'bg-linear-to-br from-zinc-600 via-zinc-500 to-zinc-600 shadow-zinc-500/20'
                        }`}
                      >
                        <div className="rounded-[11px] bg-zinc-900 p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold">Game #{game.gameId}</h3>
                                {game.isActive && (
                                  <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-bold border border-green-500/30">
                                    ● ACTIVE
                                  </span>
                                )}
                                {!game.isActive && game.winner !== '0x0000000000000000000000000000000000000000' && (
                                  <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold border border-purple-500/30">
                                    ✓ COMPLETED
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-zinc-600 dark:text-zinc-400 font-mono">
                                IPFS: {game.imageHash}
                              </p>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => syncGameToDatabase(game.gameId)}
                                disabled={syncingGame === game.gameId}
                                className="px-4 py-2 rounded-lg bg-linear-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {syncingGame === game.gameId ? '⏳ Syncing...' : '🔄 Sync to DB'}
                              </button>

                              {/* Show Distribute button only for completed games */}
                              {game.isCompleted && game.winner !== '0x0000000000000000000000000000000000000000' && (
                                <button
                                  onClick={() => setConfirmingGame(game.gameId)}
                                  disabled={distributingGame === game.gameId || game.revealsDistributed}
                                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed ${
                                    game.revealsDistributed
                                      ? 'bg-linear-to-r from-green-500 to-emerald-500'
                                      : 'bg-linear-to-r from-orange-500 to-amber-500'
                                  }`}
                                >
                                  {distributingGame === game.gameId 
                                    ? '⏳ Distributing...' 
                                    : game.revealsDistributed 
                                    ? '✓ Already Distributed' 
                                    : '💎 Distribute Prizes'}
                                </button>
                              )}

                              {/* Show Delete button only for games without winner */}
                              {game.winner === '0x0000000000000000000000000000000000000000' && (
                                <button
                                  onClick={() => deleteGame(game.gameId)}
                                  disabled={deletingGame === game.gameId}
                                  className="px-4 py-2 rounded-lg bg-linear-to-r from-red-500 to-rose-500 text-white text-sm font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {deletingGame === game.gameId ? '⏳ Deleting...' : '🗑️ Delete Game'}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Pool Amount</div>
                              <div className="text-lg font-bold text-cyan-400">{game.poolAmount} ETH</div>
                            </div>

                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Pool Claimed</div>
                              <div className="text-lg font-bold text-orange-400">{game.poolClaimed} ETH</div>
                            </div>

                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Pixels</div>
                              <div className="text-lg font-bold text-blue-400">
                                {game.revealedPixels} / {game.totalPixels}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Progress</div>
                              <div className="text-lg font-bold text-green-400">
                                {((game.revealedPixels / game.totalPixels) * 100).toFixed(1)}%
                              </div>
                            </div>
                          </div>

                          {game.winner !== '0x0000000000000000000000000000000000000000' && (
                            <div className="pt-4 border-t border-white/10">
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">Winner</div>
                              <div className="text-sm font-mono text-yellow-400">{game.winner}</div>
                            </div>
                          )}

                          <div className="pt-4 border-t border-white/10 mt-4">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-zinc-600 dark:text-zinc-400">Created: </span>
                                <span className="font-mono">
                                  {game.createdAt > 0 ? new Date(game.createdAt * 1000).toLocaleString() : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-600 dark:text-zinc-400">Ended: </span>
                                <span className="font-mono">
                                  {game.endedAt > 0 ? new Date(game.endedAt * 1000).toLocaleString() : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Confirmation Modal */}
      {confirmingGame !== null && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full shadow-2xl border border-zinc-800">
            <h3 className="text-xl font-bold mb-4">Distribute Revealer Prizes</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Are you sure you want to distribute revealer prizes for <strong>Game #{confirmingGame}</strong>?
              <br /><br />
              This will distribute <strong>30% of the pool</strong> to all pixel revealers based on their contribution.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmingGame(null)}
                className="px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  distributeRevealerPrizes(confirmingGame);
                  setConfirmingGame(null);
                }}
                className="px-4 py-2 rounded-lg bg-linear-to-r from-orange-500 to-amber-500 text-white font-medium hover:scale-105 transition-transform"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteGame && (
        <DeleteConfirmModal
          gameId={confirmDeleteGame}
          onConfirm={() => deleteGame(confirmDeleteGame)}
          onCancel={() => setConfirmDeleteGame(null)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast toast={toast} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
