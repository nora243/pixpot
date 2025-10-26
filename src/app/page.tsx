"use client";

import { useState, useEffect, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import Link from "next/link";
import PixelCanvas from "@/components/PixelCanvas";
import SecureImage from "@/components/SecureImage";
import WinnerModal from "@/components/WinnerModal";
import WrongGuessModal from "@/components/WrongGuessModal";
import TutorialModal from "@/components/TutorialModal";
import { PIXPOT_CONTRACT_ABI, PIXPOT_CONTRACT_ADDRESS } from "@/lib/contract";
import { keccak256, toHex } from "viem";

type HistoryImage = {
  id: number;
  filename: string;
  original_name: string;
  answer: string;
  winner_address: string | null;
  revealed_pixels: number;
  total_pixels: number;
  pool_amount: string;
  updated_at: string;
};

export default function Home() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  
  const [openedCount, setOpenedCount] = useState(0);
  const [guess, setGuess] = useState("");
  const [guessResult, setGuessResult] = useState<string | null>(null);
  const [loadingGuess, setLoadingGuess] = useState(false);
  const [history, setHistory] = useState<HistoryImage[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [poolAmount, setPoolAmount] = useState<string>("0");
  const [winnerAddress, setWinnerAddress] = useState<string | null>(null);
  const [participantsCount, setParticipantsCount] = useState<number>(0);
  const [guessesCount, setGuessesCount] = useState<number>(0);
  const [showPrizeTooltip, setShowPrizeTooltip] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [wonPrizeAmount, setWonPrizeAmount] = useState<string>("0");
  const [showWrongGuessModal, setShowWrongGuessModal] = useState(false);
  const [gameId, setGameId] = useState<number | null>(null);
  const [commitBlockNumber, setCommitBlockNumber] = useState<number | null>(null);
  const [guessSecret, setGuessSecret] = useState<string>("");
  const [revealCountdown, setRevealCountdown] = useState<number>(0);
  const [shouldReloadAfterWin, setShouldReloadAfterWin] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [pendingWinnerDeclaration, setPendingWinnerDeclaration] = useState<{
    gameId: number;
    answer: string;
    adminSecret: string;
  } | null>(null);

  // Check if first visit
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("pixpot-tutorial-seen");
    if (!hasSeenTutorial) {
      setShowTutorial(true);
    }
  }, []);

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem("pixpot-tutorial-seen", "true");
  };

  const handleOpenTutorial = () => {
    setShowTutorial(true);
  };

  // Read current block number
  const { data: currentBlockNumber } = useReadContract({
    address: PIXPOT_CONTRACT_ADDRESS,
    abi: PIXPOT_CONTRACT_ABI,
    functionName: 'getCurrentGame',
    query: {
      enabled: !!PIXPOT_CONTRACT_ADDRESS && !!commitBlockNumber,
      refetchInterval: 2000, // Check every 2 seconds during countdown
    }
  });

  // Use useCallback to memoize the callback and prevent re-renders
  const handleGameDataChange = useCallback(
    (data: {
      poolAmount: string;
      winnerAddress: string | null;
      participantsCount: number;
      guessesCount: number;
      gameId: number;
    }) => {
      setPoolAmount(data.poolAmount);
      setWinnerAddress(data.winnerAddress);
      setParticipantsCount(data.participantsCount);
      setGuessesCount(data.guessesCount);
      setGameId(data.gameId);
    },
    []
  );

  useEffect(() => {
    loadHistory();
  }, []);

  // Check for pending commits when user connects wallet or gameId changes
  useEffect(() => {
    if (address && gameId && publicClient && PIXPOT_CONTRACT_ADDRESS) {
      checkPendingCommit();
    }
  }, [address, gameId, publicClient]);

  async function checkPendingCommit() {
    if (!address || !gameId || !publicClient || !PIXPOT_CONTRACT_ADDRESS) return;

    try {
      // Check if user has pending commit
      const commitData = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'getUserCommit',
        args: [BigInt(gameId), address as `0x${string}`],
      }) as [string, bigint, boolean, boolean]; // [commitHash, blockNumber, revealed, canReveal]

      const [commitHash, blockNumber, revealed, canReveal] = commitData;

      // If user has unrevealed commit
      if (commitHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && !revealed) {
        console.log("Found pending commit:", { commitHash, blockNumber: Number(blockNumber), canReveal });
        
        setCommitBlockNumber(Number(blockNumber));
        
        // Calculate countdown
        const currentBlock = await publicClient.getBlockNumber();
        const targetBlock = Number(blockNumber) + 2;
        const remaining = targetBlock - Number(currentBlock);
        
        if (remaining > 0) {
          setRevealCountdown(remaining);
          setGuessResult(`You have a pending guess. Waiting ${remaining} more block${remaining > 1 ? 's' : ''} before you can reveal...`);
        } else {
          setRevealCountdown(0);
          setGuessResult("You have a pending guess ready to reveal! But we don't have the secret saved. Please cancel this commit and submit a new guess.");
        }
      }
    } catch (error: any) {
      // Ignore "no data" error - it means user hasn't committed yet
      if (error?.message?.includes("returned no data") || error?.message?.includes("0x")) {
        console.log("No pending commit found for user");
        return;
      }
      console.error("Failed to check pending commit:", error);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.images || []);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  }

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    
    if (!address) {
      setGuessResult("Please connect your wallet to submit a guess");
      return;
    }

    if (!PIXPOT_CONTRACT_ADDRESS) {
      setGuessResult("Contract not configured");
      return;
    }

    if (!gameId) {
      setGuessResult("Game not loaded");
      return;
    }

    setLoadingGuess(true);
    setGuessResult(null);
    
    try {
      // Step 1: Generate secret and commit hash
      const secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const normalizedGuess = guess.trim().toLowerCase();
      const commitHash = keccak256(toHex(normalizedGuess + secret));
      
      setGuessSecret(secret);
      
      setGuessResult("Committing guess to blockchain...");

      // Step 2: Call commitGuess onchain
      const guessFee = BigInt(100000000000000); // 0.0001 ETH
      const commitTx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "commitGuess",
        args: [BigInt(gameId), commitHash],
        value: guessFee,
      });

      setGuessResult("Waiting for commit confirmation...");

      // Step 3: Wait for transaction confirmation
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
        setCommitBlockNumber(Number(receipt.blockNumber));
        
        setGuessResult("Commit successful! Waiting 2 blocks before reveal...");
        
        // Step 4: Wait for 2 blocks
        let currentBlock = Number(receipt.blockNumber);
        const targetBlock = currentBlock + 2;
        
        const checkBlock = async () => {
          const block = await publicClient.getBlockNumber();
          currentBlock = Number(block);
          const remaining = targetBlock - currentBlock;
          
          if (remaining > 0) {
            setRevealCountdown(remaining);
            setGuessResult(`Waiting ${remaining} more block${remaining > 1 ? 's' : ''} before reveal...`);
            setTimeout(checkBlock, 3000); // Check every 3 seconds
          } else {
            // Ready to reveal
            await performReveal(normalizedGuess, secret);
          }
        };
        
        setTimeout(checkBlock, 3000);
      }
    } catch (error: any) {
      console.error("Guess error:", error);
      if (error.message?.includes("User rejected")) {
        setGuessResult("Transaction cancelled");
      } else if (error.message?.includes("Already committed")) {
        setGuessResult("You already have a pending guess. Please wait to reveal it.");
      } else {
        setGuessResult(error.message || "Failed to submit guess");
      }
      setLoadingGuess(false);
    }
  }

  async function declareWinnerOnchain(gameId: number, answer: string, adminSecret: string) {
    if (!PIXPOT_CONTRACT_ADDRESS || !publicClient) return;

    setGuessResult("🎉 Correct! Declaring winner...");
    
    try {
      // Step 1: Call declareWinner onchain (ends game immediately and auto-activates next)
      const declareTx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "declareWinner",
        args: [BigInt(gameId), answer, adminSecret],
      });

      setGuessResult("Waiting for confirmation...");

      await publicClient.waitForTransactionReceipt({ hash: declareTx });

      setGuessResult("Winner declared! Game ended.");

      // Get pool amount from blockchain
      const game = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'getGame',
        args: [BigInt(gameId)],
      }) as any;

      const poolWei = game.poolAmount || game[5];
      const poolAmountEth = (Number(poolWei) / 1e18).toString();
      const winnerPrize = (Number(poolWei) * 0.7 / 1e18).toFixed(8);
      setWonPrizeAmount(winnerPrize);

      // Save to database with adminSecret for later claim
      console.log("Saving winner to database...", { answer, address, gameId, poolAmountEth });
      const saveResponse = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          guess: answer, 
          walletAddress: address,
          isCorrect: true,
          gameId: gameId,
          poolAmount: poolAmountEth,
          txHash: declareTx, // Use declareWinner tx hash
          adminSecret: adminSecret,
        }),
      });
      
      const saveResult = await saveResponse.json();
      console.log("Save winner response:", saveResult);

      // Show winner modal
      setShowWinnerModal(true);
      setGuessResult("🎉 You won! Claim your prize in Profile anytime!");
      
      loadHistory();

      // Wait for transaction to be mined and get new active game from contract
      setGuessResult("Waiting for next game activation...");
      
      try {
        // Wait a bit for contract state to update
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get current active game from contract
        const currentGame = await publicClient.readContract({
          address: PIXPOT_CONTRACT_ADDRESS,
          abi: PIXPOT_CONTRACT_ABI,
          functionName: 'getCurrentGame',
        }) as any[];
        
        const newGameId = Number(currentGame[0]);
        const newPoolAmount = (Number(currentGame[4]) / 1e18).toFixed(8);
        console.log("🎮 New game activated onchain (from getCurrentGame):", newGameId);
        console.log("💰 New game pool amount:", newPoolAmount, "ETH");
        
        if (newGameId > 0) {
          // Sync database with new active game
          const syncResponse = await fetch("/api/admin/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              onchainGameId: newGameId,
              autoActivate: true,
              poolAmount: newPoolAmount
            }),
          });
          
          const syncResult = await syncResponse.json();
          console.log("✅ Database synced:", syncResult);
        }
        
        // Set flag to reload after user closes modal
        setShouldReloadAfterWin(true);
        setGuessResult("Next game ready! Close this popup to continue.");
        
        // Reset state after successful winner declaration
        setLoadingGuess(false);
        setCommitBlockNumber(null);
        setRevealCountdown(0);
        setGuessSecret("");
        setPendingWinnerDeclaration(null); // Clear pending declaration
      } catch (syncError) {
        console.error("❌ Error syncing database:", syncError);
        // Set flag to reload anyway
        setShouldReloadAfterWin(true);
        setGuessResult("Next game ready! Close this popup to continue.");
        
        // Reset state even on sync error
        setLoadingGuess(false);
        setCommitBlockNumber(null);
        setRevealCountdown(0);
        setGuessSecret("");
        setPendingWinnerDeclaration(null); // Clear pending declaration
      }
    } catch (declareError: any) {
      console.error("Error declaring winner:", declareError);
      if (declareError.message?.includes("User rejected")) {
        setGuessResult("Transaction cancelled - Click 'Declare Winner' button to try again");
        setLoadingGuess(false);
        // Keep pendingWinnerDeclaration so user can retry
      } else {
        setGuessResult("Error declaring winner: " + (declareError.message || "Unknown error"));
        setLoadingGuess(false);
        // Keep pendingWinnerDeclaration so user can retry
      }
    }
  }

  async function performReveal(normalizedGuess: string, secret: string) {
    if (!gameId || !PIXPOT_CONTRACT_ADDRESS) return;

    try {
      setGuessResult("Revealing guess...");

      // Step 1: Call revealGuess onchain (just records the guess, doesn't check answer)
      const revealTx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "revealGuess",
        args: [BigInt(gameId), normalizedGuess, secret],
      });

      setGuessResult("Waiting for reveal confirmation...");

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: revealTx });
      }

      setGuessResult("Verifying answer...");

      // Step 2: Verify guess with backend (this checks if answer is correct)
      const verifyResponse = await fetch("/api/verify-guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          gameId: gameId, 
          guess: normalizedGuess 
        }),
      });

      const verifyResult = await verifyResponse.json();

      if (verifyResult.correct && verifyResult.adminSecret) {
        // Correct guess! Save pending winner declaration
        setPendingWinnerDeclaration({
          gameId: gameId,
          answer: normalizedGuess,
          adminSecret: verifyResult.adminSecret
        });
        
        // Try to declare winner immediately
        await declareWinnerOnchain(gameId, normalizedGuess, verifyResult.adminSecret);
      } else {
        // Wrong guess
        console.log("Saving wrong guess to database...", { normalizedGuess, address, gameId });
        const saveResponse = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            guess: normalizedGuess, 
            walletAddress: address,
            isCorrect: false,
            gameId: gameId,
            txHash: revealTx, // Save reveal transaction hash
          }),
        });
        
        const saveResult = await saveResponse.json();
        console.log("Save guess response:", saveResult);

        setShowWrongGuessModal(true);
        setGuessResult("Not quite right. Try again!");
        
        // Reset state after successful reveal
        setLoadingGuess(false);
        setCommitBlockNumber(null);
        setRevealCountdown(0);
        setGuessSecret("");
      }
    } catch (error: any) {
      console.error("Reveal error:", error);
      if (error.message?.includes("User rejected")) {
        setGuessResult("Transaction cancelled - You can reveal again when ready");
        // IMPORTANT: Reset countdown but keep commit state when user cancels
        // Keep commitBlockNumber and guessSecret so user can reveal again
        setLoadingGuess(false);
        setRevealCountdown(0); // Reset countdown so "Reveal Now" button is enabled
      } else {
        setGuessResult(error.message || "Failed to reveal guess");
        // On other errors, reset state
        setLoadingGuess(false);
        setCommitBlockNumber(null);
        setRevealCountdown(0);
        setGuessSecret("");
      }
    } finally {
      // Only reset loadingGuess - don't reset commit state here
      // State is reset in catch block based on error type
    }
  }

  async function activateNextGame() {
    try {
      console.log("Winner claimed successfully. Waiting for contract to auto-activate next game...");
      
      if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) {
        console.log("No publicClient available");
        return;
      }
      
      setGuessResult("Waiting for next game activation...");
      
      // Listen for GameActivated event (much more efficient than polling)
      const unwatch = publicClient.watchContractEvent({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        eventName: 'GameActivated',
        onLogs: async (logs) => {
          console.log("GameActivated event received:", logs);
          
          if (logs.length > 0) {
            const log = logs[0] as any;
            const newGameId = log.args?.gameId || log.args?.[0]; // gameId from event
            
            console.log(`New game activated onchain: ${newGameId}`);
            
            // Get game data from contract to get pool amount
            let poolAmount = "0";
            try {
              const gameData = await publicClient!.readContract({
                address: PIXPOT_CONTRACT_ADDRESS,
                abi: PIXPOT_CONTRACT_ABI,
                functionName: 'getGame',
                args: [BigInt(newGameId)],
              }) as any;
              poolAmount = (Number(gameData.poolAmount || gameData[4]) / 1e18).toFixed(8);
              console.log(`New game pool amount: ${poolAmount} ETH`);
            } catch (err) {
              console.error("Failed to get pool amount from contract:", err);
            }
            
            // Update database to match blockchain state
            const dbResponse = await fetch("/api/admin/activate", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ 
                onchainGameId: Number(newGameId),
                autoActivate: true,
                poolAmount: poolAmount
              }),
            });
            
            if (dbResponse.ok) {
              console.log(`Database synced with onchain game ${newGameId}`);
              setGuessResult("Next game activated!");
              
              // Stop watching
              unwatch();
              
              // Reload to show new game
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              const errorData = await dbResponse.json();
              console.error("Failed to update database:", errorData);
            }
          }
        },
      });
      
      // Fallback: Stop watching after 10 seconds if no event received
      setTimeout(() => {
        unwatch();
        console.log("No GameActivated event received, checking manually...");
        
        // Fallback to manual check (only last few games)
        checkRecentGamesForActive();
      }, 10000);
      
    } catch (error: any) {
      console.error("Failed to activate next game:", error);
      setGuessResult(`Won! Error checking next game: ${error.message}`);
    }
  }
  
  // Fallback function: only check recent games (much faster)
  async function checkRecentGamesForActive() {
    try {
      if (!publicClient || !PIXPOT_CONTRACT_ADDRESS) return;
      
      // Get current gameId from contract
      const currentGameId = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'currentGameId',
        args: [],
      }) as bigint;
      
      const current = Number(currentGameId);
      const startFrom = Math.max(1, current - 10); // Only check last 10 games
      
      console.log(`Checking games from ${startFrom} to ${current}`);
      
      // Check only recent games (reverse order for efficiency)
      for (let gameId = current; gameId >= startFrom; gameId--) {
        try {
          const game = await publicClient.readContract({
            address: PIXPOT_CONTRACT_ADDRESS,
            abi: PIXPOT_CONTRACT_ABI,
            functionName: 'getGame',
            args: [BigInt(gameId)],
          }) as any;
          
          const isActive = game.isActive || game[7];
          
          if (isActive) {
            console.log(`Found active game: ${gameId}`);
            
            const poolAmount = (Number(game.poolAmount || game[4]) / 1e18).toFixed(8);
            console.log(`Game pool amount: ${poolAmount} ETH`);
            
            // Sync database
            const dbResponse = await fetch("/api/admin/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                onchainGameId: gameId,
                autoActivate: true,
                poolAmount: poolAmount
              }),
            });
            
            if (dbResponse.ok) {
              setGuessResult("Next game activated!");
              setTimeout(() => window.location.reload(), 2000);
            }
            return;
          }
        } catch (err) {
          continue;
        }
      }
      
      setGuessResult("Won! No next game available.");
    } catch (error) {
      console.error("Fallback check failed:", error);
    }
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
      
      {/* Content wrapper */}
      <div className="relative z-10">
        <header className="border-b border-white/10 backdrop-blur-sm bg-black/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <img src="/logo.png" alt="PixPot Logo" className="h-7 w-7 sm:h-8 sm:w-8 rounded shadow-lg" />
              <span className="text-base sm:text-lg font-bold bg-linear-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">PixPot</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="scale-90 sm:scale-100 origin-right">
                <ConnectButton />
              </div>
              {address && (
                <Link 
                  href="/profile"
                  className="group relative overflow-hidden rounded-lg bg-linear-to-r from-blue-500/90 via-cyan-400/90 to-blue-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/40"
                  title="View Profile"
                >
                  <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-2.5 py-1.5 transition-all">
                    <span className="text-lg">👤</span>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-8">
          {/* Canvas section - full width on mobile, constrained on desktop */}
          <section className="w-full max-w-2xl mx-auto lg:mx-0">
            <div className="relative p-1 rounded-2xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-xl shadow-blue-500/30">
              <div className="rounded-[14px] bg-zinc-50 dark:bg-zinc-950 p-2">
                <PixelCanvas 
                  onRevealedCountChange={setOpenedCount} 
                  onHintsChange={setHints}
                  onGameDataChange={handleGameDataChange}
                />
              </div>
            </div>
          </section>

          {/* Sidebar - stacks below on mobile, side-by-side on desktop */}
          <aside className="w-full lg:w-80 flex flex-col gap-4 sm:gap-6">
            <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
              <div className="rounded-[11px] bg-white dark:bg-zinc-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">Game stats</h2>
                  <button
                    onClick={handleOpenTutorial}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium transition-colors"
                    title="How to play"
                  >
                    📖 Guide
                  </button>
                </div>
                <div className="space-y-2 text-base text-zinc-600 dark:text-zinc-400">
                  <div className="flex justify-between">
                    <span>Opened pixels:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{openedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Grid:</span>
                    <span className="font-medium">128 × 128</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Participants:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{participantsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total guesses:</span>
                    <span className="font-medium text-zinc-900 dark:text-zinc-50">{guessesCount}</span>
                  </div>
                  
                  {/* Hints Section */}
                  {hints.length > 0 && (
                    <div className="pt-3 border-t border-black/10 dark:border-white/10">
                      <div className="font-medium text-zinc-900 dark:text-zinc-50 mb-2">💡 Hints:</div>
                      <div className="space-y-2">
                        {hints.map((hint, index) => (
                          <div key={index} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded px-2 py-1.5">
                            {hint}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="relative p-[3px] rounded-xl bg-linear-to-br from-blue-500 via-cyan-400 to-blue-600 shadow-lg shadow-blue-500/20">
              <div className="rounded-[11px] bg-white dark:bg-zinc-900 p-4">
                <h2 className="mb-3 text-lg font-semibold">Make a guess</h2>
                <div className="mb-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2">
                    <span className="shrink-0">💰</span>
                    <div>
                      <span className="font-semibold">Fee: 0.0001 ETH</span> per guess
                      <div className="mt-0.5 text-blue-600 dark:text-blue-300">
                        → Added directly to the prize pool
                      </div>
                    </div>
                  </div>
                </div>
                <form onSubmit={submitGuess} className="space-y-3">
                  <input
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder="What's in the image?"
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-50"
                    disabled={commitBlockNumber !== null || pendingWinnerDeclaration !== null}
                  />
                  
                  {/* Show Reveal button if user has pending commit */}
                  {commitBlockNumber !== null && guessSecret && !pendingWinnerDeclaration && (
                    <button
                      type="button"
                      onClick={() => {
                        if (guess && guessSecret) {
                          const normalized = guess.trim().toLowerCase();
                          performReveal(normalized, guessSecret);
                        }
                      }}
                      disabled={loadingGuess || revealCountdown > 0}
                      className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-orange-500 via-amber-400 to-orange-600 p-[3px] transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-orange-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      <div className="relative rounded-[10px] bg-linear-to-r from-orange-500 via-amber-400 to-orange-600 px-6 py-3 transition-all">
                        <span className="relative text-base font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2), -1px -1px 0px rgba(255,255,255,0.3)' }}>
                          {loadingGuess ? "Revealing..." : revealCountdown > 0 ? `Wait ${revealCountdown} block${revealCountdown > 1 ? 's' : ''}...` : "🔓 Reveal Now"}
                        </span>
                      </div>
                    </button>
                  )}
                  
                  {/* Show Cancel button if user has pending commit but no secret */}
                  {commitBlockNumber !== null && !guessSecret && !pendingWinnerDeclaration && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!PIXPOT_CONTRACT_ADDRESS || !gameId) return;
                        setLoadingGuess(true);
                        setGuessResult("Cancelling commit...");
                        try {
                          const tx = await writeContractAsync({
                            address: PIXPOT_CONTRACT_ADDRESS,
                            abi: PIXPOT_CONTRACT_ABI,
                            functionName: "cancelCommit",
                            args: [BigInt(gameId)],
                          });
                          setGuessResult("Waiting for confirmation...");
                          if (publicClient) {
                            await publicClient.waitForTransactionReceipt({ hash: tx });
                          }
                          setGuessResult("Commit cancelled! You can submit a new guess now.");
                          setCommitBlockNumber(null);
                          setRevealCountdown(0);
                        } catch (error: any) {
                          console.error("Cancel commit error:", error);
                          if (error.message?.includes("User rejected")) {
                            setGuessResult("Transaction cancelled");
                          } else {
                            setGuessResult(error.message || "Failed to cancel commit");
                          }
                        } finally {
                          setLoadingGuess(false);
                        }
                      }}
                      disabled={loadingGuess}
                      className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-red-500 via-rose-400 to-red-600 p-[3px] transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      <div className="relative rounded-[10px] bg-linear-to-r from-red-500 via-rose-400 to-red-600 px-6 py-3 transition-all">
                        <span className="relative text-base font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2), -1px -1px 0px rgba(255,255,255,0.3)' }}>
                          {loadingGuess ? "Cancelling..." : "❌ Cancel Old Commit"}
                        </span>
                      </div>
                    </button>
                  )}
                  
                  {/* Show Submit button only if no pending commit */}
                  {commitBlockNumber === null && !pendingWinnerDeclaration && (
                    <button
                      type="submit"
                      disabled={!guess || loadingGuess}
                      className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-blue-500 via-cyan-400 to-blue-600 p-[3px] transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      <div className="relative rounded-[10px] bg-linear-to-r from-blue-500 via-cyan-400 to-blue-600 px-6 py-3 transition-all">
                        <span className="relative text-base font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2), -1px -1px 0px rgba(255,255,255,0.3)' }}>
                          {loadingGuess ? "Submitting..." : "Submit"}
                        </span>
                      </div>
                    </button>
                  )}
                </form>
                
                {/* Show Declare Winner button if user has pending winner declaration */}
                {pendingWinnerDeclaration && (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingWinnerDeclaration) {
                          declareWinnerOnchain(
                            pendingWinnerDeclaration.gameId,
                            pendingWinnerDeclaration.answer,
                            pendingWinnerDeclaration.adminSecret
                          );
                        }
                      }}
                      disabled={loadingGuess}
                      className="group relative w-full overflow-hidden rounded-xl bg-linear-to-r from-green-500 via-emerald-400 to-green-600 p-[3px] transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-green-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                    >
                      <div className="relative rounded-[10px] bg-linear-to-r from-green-500 via-emerald-400 to-green-600 px-6 py-3 transition-all">
                        <span className="relative text-base font-black uppercase tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2), -1px -1px 0px rgba(255,255,255,0.3)' }}>
                          {loadingGuess ? "Declaring..." : "🏆 Declare Winner"}
                        </span>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setPendingWinnerDeclaration(null);
                        setGuessResult("Winner declaration skipped. You can submit a new guess for the next game.");
                        setLoadingGuess(false);
                        setCommitBlockNumber(null);
                        setRevealCountdown(0);
                        setGuessSecret("");
                      }}
                      disabled={loadingGuess}
                      className="w-full text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 underline transition-colors"
                    >
                      Skip and continue to next game
                    </button>
                  </div>
                )}
                
                {guessResult && (
                  <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400 p-2 rounded bg-zinc-100 dark:bg-zinc-800">
                    {guessResult}
                  </p>
                )}
              </div>
            </div>

            {/* Prize Pool Section */}
            <div className="relative p-[3px] rounded-xl bg-linear-to-br from-yellow-500 via-amber-400 to-yellow-600 shadow-lg shadow-yellow-500/30">
              <div className="rounded-[11px] bg-white dark:bg-zinc-900 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <span>🏆</span>
                    <span>Prize Pool</span>
                  </h2>
                  <div className="relative">
                    <button
                      onMouseEnter={() => setShowPrizeTooltip(true)}
                      onMouseLeave={() => setShowPrizeTooltip(false)}
                      onClick={() => setShowPrizeTooltip(!showPrizeTooltip)}
                      className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 flex items-center justify-center text-zinc-600 dark:text-zinc-300 text-xs font-bold transition-colors"
                      title="Prize distribution info"
                    >
                      ?
                    </button>
                    {showPrizeTooltip && (
                      <div className="absolute right-0 top-6 w-64 sm:w-72 z-50 p-3 rounded-lg bg-zinc-800 dark:bg-zinc-700 text-white text-xs shadow-xl border border-zinc-600">
                        <div className="space-y-2">
                          <div className="font-semibold text-sm text-yellow-400 mb-2">💰 Prize Distribution</div>
                          <div className="flex items-start gap-2">
                            <span className="text-green-400 font-bold">70%</span>
                            <span>Winner who guesses correctly</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-blue-400 font-bold">30%</span>
                            <span>Distributed among all pixel revealers (except winner) based on their contribution</span>
                          </div>
                          <div className="pt-2 mt-2 border-t border-zinc-600 text-zinc-300">
                            The more pixels you reveal, the larger your share of the 30%!
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-500 mb-1">
                    {poolAmount || "0.00000000"} ETH
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <section className="mt-8 sm:mt-12">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 px-1">🏆 Completed Games</h2>
            <div className="space-y-3">
              {history.map((img) => (
                <div
                  key={img.id}
                  className="relative p-0.5 rounded-xl bg-linear-to-r from-blue-500 via-cyan-400 to-blue-600 shadow-md shadow-blue-500/10"
                >
                  <div className="rounded-[10px] bg-white dark:bg-zinc-900 p-3 sm:p-4">
                    <div className="flex gap-3 sm:gap-4">
                      {/* Image - Left side, fixed size */}
                      <div className="shrink-0">
                        <SecureImage
                          filename={img.filename}
                          alt={img.original_name}
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded"
                        />
                      </div>
                      
                      {/* Info - Right side */}
                      <div className="flex-1 flex flex-col justify-between min-h-20 sm:min-h-24">
                        <div className="space-y-1">
                          <div className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-50">
                            Answer: <span className="text-green-600 dark:text-green-400">{img.answer}</span>
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Revealed: {img.revealed_pixels} / {img.total_pixels} pixels
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Prize Pool: <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                              {img.pool_amount || "0.00000000"} ETH
                            </span>
                          </div>
                          {img.winner_address && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              Winner: <span className="font-mono text-blue-600 dark:text-blue-400">
                                {img.winner_address.slice(0, 6)}...{img.winner_address.slice(-4)}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-end mt-1">
                          <div className="text-xs text-zinc-500 dark:text-zinc-600">
                            {new Date(img.updated_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      </div>

      {/* Winner Modal with Confetti */}
      <WinnerModal
        isOpen={showWinnerModal}
        onClose={() => {
          setShowWinnerModal(false);
          // Only reload if next game was synced successfully
          if (shouldReloadAfterWin) {
            window.location.reload();
          }
        }}
        prizeAmount={wonPrizeAmount}
      />

      {/* Wrong Guess Modal with Funny Message */}
      <WrongGuessModal
        isOpen={showWrongGuessModal}
        onClose={() => setShowWrongGuessModal(false)}
        guess={guess}
      />

      {/* Tutorial Modal */}
      <TutorialModal
        isOpen={showTutorial}
        onClose={handleCloseTutorial}
      />
    </div>
  );
}
