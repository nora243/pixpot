"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useReadContract, usePublicClient, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isAdmin } from "@/lib/admin";
import { createAuthHeaders } from "@/lib/admin-api";
import Link from "next/link";
import SecureImage from "@/components/SecureImage";
import { PIXPOT_CONTRACT_ABI, PIXPOT_CONTRACT_ADDRESS } from "@/lib/contract";
import { keccak256, toHex } from "viem";

type Image = {
  id: number;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  answer: string;
  status: string;
  total_pixels: number;
  revealed_pixels: number;
  pool_amount: string;
  winner_address: string | null;
  created_at: string;
  hint_0?: string | null;
  hint_1000?: string | null;
  hint_2000?: string | null;
};

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [images, setImages] = useState<Image[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingImage, setEditingImage] = useState<Image | null>(null);
  const [onchainGames, setOnchainGames] = useState<Set<number>>(new Set());
  const [creatingGame, setCreatingGame] = useState<number | null>(null);
  const [depositingGame, setDepositingGame] = useState<number | null>(null);
  const [depositAmounts, setDepositAmounts] = useState<Record<number, string>>({});

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const isAdminUser = isConnected && isAdmin(address);

  useEffect(() => {
    if (isAdminUser) {
      loadImages();
    }
  }, [isAdminUser]);

  // Check onchain games after images are loaded
  useEffect(() => {
    if (images.length > 0 && PIXPOT_CONTRACT_ADDRESS) {
      checkOnchainGames();
    }
  }, [images]);

  async function checkOnchainGames() {
    if (!PIXPOT_CONTRACT_ADDRESS || !publicClient) return;
    
    try {
      const onchainSet = new Set<number>();
      
      // Check each image if it exists onchain by calling contract.getGame()
      for (const img of images) {
        try {
          const game = await publicClient.readContract({
            address: PIXPOT_CONTRACT_ADDRESS,
            abi: PIXPOT_CONTRACT_ABI,
            functionName: 'getGame',
            args: [BigInt(img.id)],
          }) as any;
          
          // If gameId > 0, game exists onchain
          if (game && game.gameId && Number(game.gameId) === img.id) {
            onchainSet.add(img.id);
          }
        } catch (e) {
          // Game doesn't exist onchain or reverted
          // This is expected for games not yet created
        }
      }
      
      setOnchainGames(onchainSet);
    } catch (error) {
      console.error("Failed to check onchain games:", error);
    }
  }

  async function loadImages() {
    try {
      const headers = await createAuthHeaders({
        walletAddress: address || "",
        signMessageFn: async ({ message }) => await signMessageAsync({ message }),
      });

      const res = await fetch("/api/admin/images", { headers });
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
        
        // Check onchain games after loading images
        setTimeout(() => checkOnchainGames(), 100);
      }
    } catch (error) {
      console.error("Failed to load images:", error);
    }
  }

  async function createGameOnchain(image: Image) {
    if (!PIXPOT_CONTRACT_ADDRESS) {
      setMessage({ type: "error", text: "Contract address not configured" });
      return;
    }

    setCreatingGame(image.id);
    
    try {
      // Generate admin secret (cryptographically secure random string)
      const adminSecret = crypto.randomUUID() + '-' + Date.now() + '-' + Math.random().toString(36).substring(2);
      
      // Generate answer commit hash = keccak256(normalizedAnswer + adminSecret)
      // This prevents brute-force attacks as hacker doesn't know adminSecret
      const normalizedAnswer = image.answer.toLowerCase();
      const answerCommitHash = keccak256(toHex(normalizedAnswer + adminSecret));
      
      // Create game onchain with image.id as gameId
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "createGame",
        args: [
          BigInt(image.id),           // gameId from database
          image.filename,             // imageHash
          answerCommitHash,           // answerCommitHash (NOT answerHash for security!)
          BigInt(image.total_pixels), // totalPixels
        ],
        value: BigInt(0), // Optional: can add initial pool amount
      });

      setMessage({ type: "success", text: `Game created onchain! Waiting for confirmation...` });
      
      // Wait for transaction confirmation
      if (publicClient) {
        try {
          await publicClient.waitForTransactionReceipt({ hash: tx });
          
          // Save adminSecret and onchain_game_id to database
          const headers = await createAuthHeaders({
            walletAddress: address || "",
            signMessageFn: async ({ message }) => await signMessageAsync({ message }),
          });

          const saveResponse = await fetch(`/api/admin/images/${image.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ 
              admin_secret: adminSecret,
              onchain_game_id: image.id // Save the game ID used onchain
            }),
          });

          if (!saveResponse.ok) {
            throw new Error("Failed to save admin secret and game ID to database");
          }
          
          setMessage({ type: "success", text: `Game created onchain successfully! TX: ${tx}` });
          
          // Reload images to see updated admin_secret and onchain_game_id
          await loadImages();
          // Refetch onchain games
          await checkOnchainGames();
        } catch (waitError) {
          console.error("Transaction wait error:", waitError);
          // Fallback: still try to refetch after delay
          setTimeout(() => checkOnchainGames(), 3000);
        }
      } else {
        // Fallback if no publicClient
        setTimeout(() => checkOnchainGames(), 3000);
      }
    } catch (error: any) {
      console.error("Failed to create game onchain:", error);
      setMessage({ type: "error", text: error.message || "Failed to create game onchain" });
    } finally {
      setCreatingGame(null);
    }
  }

  async function activateImage(imageId: number) {
    // Check if game exists onchain first
    if (!onchainGames.has(imageId)) {
      setMessage({ 
        type: "error", 
        text: "Cannot activate: Game must be created onchain first. Click 'Create Onchain' button." 
      });
      return;
    }

    if (!PIXPOT_CONTRACT_ADDRESS) {
      setMessage({ type: "error", text: "Contract address not configured" });
      return;
    }

    try {
      setMessage({ type: "success", text: "Activating game onchain..." });

      // Step 1: Call setActiveGame() onchain
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "setActiveGame",
        args: [BigInt(imageId)],
      });

      setMessage({ type: "success", text: "Waiting for onchain confirmation..." });

      // Step 2: Wait for transaction confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }

      setMessage({ type: "success", text: "Game activated onchain! Updating database..." });

      // Step 3: Update database only after onchain success
      const headers = await createAuthHeaders({
        walletAddress: address || "",
        signMessageFn: async ({ message }) => await signMessageAsync({ message }),
      });

      const res = await fetch("/api/admin/activate", {
        method: "POST",
        headers,
        body: JSON.stringify({ imageId }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Game activated successfully!" });
        loadImages();
      } else {
        const data = await res.json();
        setMessage({ 
          type: "error", 
          text: `Onchain activated but database update failed: ${data.error || "Unknown error"}` 
        });
      }
    } catch (error: any) {
      console.error("Failed to activate game:", error);
      setMessage({ 
        type: "error", 
        text: error.message || "Failed to activate game onchain" 
      });
    }
  }

  async function depositToPool(imageId: number) {
    const amountStr = depositAmounts[imageId];
    if (!amountStr || parseFloat(amountStr) <= 0) {
      setMessage({ type: "error", text: "Please enter a valid ETH amount" });
      return;
    }

    if (!PIXPOT_CONTRACT_ADDRESS) {
      setMessage({ type: "error", text: "Contract address not configured" });
      return;
    }

    if (!publicClient) {
      setMessage({ type: "error", text: "Public client not available" });
      return;
    }

    setDepositingGame(imageId);

    try {
      const amountInWei = BigInt(Math.floor(parseFloat(amountStr) * 1e18));

      setMessage({ type: "success", text: `Depositing ${amountStr} ETH to pool...` });

      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "depositToPool",
        args: [BigInt(imageId)],
        value: amountInWei,
      });

      setMessage({ type: "success", text: "Waiting for confirmation..." });

      await publicClient.waitForTransactionReceipt({ hash: tx });

      setMessage({ type: "success", text: "Reading updated pool amount from contract..." });

      // Wait a moment for contract state to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Read updated pool amount from contract with blockTag to force fresh data
      const game = await publicClient.readContract({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: 'getGame',
        args: [BigInt(imageId)],
        blockTag: 'latest', // Force read from latest block
      }) as any;

      // game is a tuple: [gameId, imageHash, answerHash, totalPixels, revealedPixels, poolAmount, winner, isActive, createdAt, endedAt]
      const poolAmountWei = game.poolAmount || game[5]; // poolAmount is at index 5
      const poolAmountEth = (Number(poolAmountWei) / 1e18).toFixed(18); // Keep full precision

      console.log('Deposit Debug:', {
        depositedWei: amountInWei.toString(),
        depositedEth: amountStr,
        contractPoolWei: poolAmountWei.toString(),
        contractPoolEth: poolAmountEth,
        tx: tx
      });

      // Update database with new pool amount
      const headers = await createAuthHeaders({
        walletAddress: address || "",
        signMessageFn: async ({ message }) => await signMessageAsync({ message }),
      });

      const updateRes = await fetch(`/api/admin/images/${imageId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ pool_amount: poolAmountEth }),
      });

      if (!updateRes.ok) {
        const errorData = await updateRes.json().catch(() => ({}));
        console.error("Failed to update pool amount in database:", errorData);
        setMessage({ 
          type: "error", 
          text: `Deposit successful but DB update failed: ${errorData.error || 'Unknown error'}` 
        });
        return;
      }

      console.log('Database updated successfully with pool amount:', poolAmountEth);

      setMessage({ type: "success", text: `Successfully deposited ${amountStr} ETH! Pool now: ${parseFloat(poolAmountEth).toFixed(6)} ETH. TX: ${tx.slice(0, 10)}...` });
      
      // Clear input
      setDepositAmounts(prev => ({ ...prev, [imageId]: "" }));
      
      // Reload images to show updated pool amount
      setTimeout(() => loadImages(), 1000);
    } catch (error: any) {
      console.error("Failed to deposit to pool:", error);
      setMessage({ type: "error", text: error.message || "Failed to deposit to pool" });
    } finally {
      setDepositingGame(null);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingImage) return;

    const formData = new FormData(e.currentTarget);
    const answer = formData.get("answer") as string;
    const status = formData.get("status") as string;
    const original_name = formData.get("original_name") as string;
    const hint_0 = formData.get("hint_0") as string | null;
    const hint_1000 = formData.get("hint_1000") as string | null;
    const hint_2000 = formData.get("hint_2000") as string | null;

    try {
      const headers = await createAuthHeaders({
        walletAddress: address || "",
        signMessageFn: async ({ message }) => await signMessageAsync({ message }),
      });

      const res = await fetch(`/api/admin/images/${editingImage.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ 
          answer, 
          status, 
          original_name,
          hint_0: hint_0 || null,
          hint_1000: hint_1000 || null,
          hint_2000: hint_2000 || null,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Image updated successfully" });
        setEditingImage(null);
        loadImages();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Failed to update image" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
    }
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);

    try {
      const headers = await createAuthHeaders({
        walletAddress: address || "",
        signMessageFn: async ({ message }) => await signMessageAsync({ message }),
      });

      // Remove Content-Type to let browser set it with boundary for FormData
      delete (headers as any)["Content-Type"];

      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: `Image uploaded as ARCHIVED! ${data.totalPixels} pixels. Click "Activate" button to make it playable.` });
        (e.target as HTMLFormElement).reset();
        loadImages();
      } else {
        setMessage({ type: "error", text: data.error || "Upload failed" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setUploading(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Admin Panel</h1>
          <p className="text-zinc-600 dark:text-zinc-400">Please connect your wallet to continue</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Your wallet address is not authorized to access this page.
          </p>
          <Link href="/" className="inline-block text-blue-600 hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
      <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Back to game
            </Link>
            <h1 className="text-xl font-bold">PixPot Admin</h1>
            <Link 
              href="/admin/onchain"
              className="px-4 py-2 rounded-lg bg-linear-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium hover:scale-105 transition-transform"
            >
              ⛓️ Onchain Info
            </Link>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Upload Form */}
        <section className="mb-8 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold mb-4">Upload New Image</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Image File (will be resized to 128x128)</label>
              <input
                type="file"
                name="image"
                accept="image/*"
                required
                className="block w-full text-sm text-zinc-900 dark:text-zinc-50 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Correct Answer(s)</label>
              <input
                type="text"
                name="answer"
                placeholder="e.g., cat|kitten|feline (separate multiple answers with |)"
                required
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Tip: Use | to separate multiple correct answers. Not case-sensitive.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Hint at 0 pixels</label>
                <input
                  type="text"
                  name="hint_0"
                  placeholder="Initial hint"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Hint at 1000 pixels</label>
                <input
                  type="text"
                  name="hint_1000"
                  placeholder="Medium difficulty hint"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Hint at 2000 pixels</label>
                <input
                  type="text"
                  name="hint_2000"
                  placeholder="Easy hint"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload & Process"}
            </button>
          </form>

          {message && (
            <div
              className={`mt-4 rounded-md p-3 text-sm ${
                message.type === "success"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                  : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </section>

        {/* Images List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Uploaded Images</h2>
            <button
              onClick={() => {
                loadImages();
                setMessage({ type: "success", text: "Images refreshed!" });
                setTimeout(() => setMessage(null), 2000);
              }}
              className="group relative overflow-hidden rounded-lg bg-linear-to-r from-blue-500/90 via-cyan-400/90 to-blue-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/40"
            >
              <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 transition-all">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </span>
              </div>
            </button>
          </div>
          {images.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">No images uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`relative p-0.5 rounded-xl transition-all ${
                    img.status === 'active' 
                      ? 'bg-linear-to-r from-green-500 via-emerald-400 to-green-600 shadow-md shadow-green-500/20' 
                      : 'bg-linear-to-r from-blue-500 via-cyan-400 to-blue-600 shadow-md shadow-blue-500/10'
                  }`}
                >
                  <div className="rounded-[10px] bg-white dark:bg-zinc-900 p-3 sm:p-4">
                    <div className="flex gap-3 sm:gap-4">
                      {/* Image - Left side */}
                      <div className="shrink-0 relative">
                        <SecureImage
                          filename={img.filename}
                          alt={img.original_name}
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded"
                        />
                        <button
                          onClick={() => setEditingImage(img)}
                          className="absolute -top-1 -right-1 p-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-white transition-colors shadow-lg"
                          title="Edit image"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Info - Right side */}
                      <div className="flex-1 flex flex-col justify-between min-h-20 sm:min-h-24">
                        <div className="space-y-1">
                          <div className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-50 truncate" title={img.original_name}>
                            {img.original_name}
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Answer: <span className="font-medium text-zinc-900 dark:text-zinc-50">
                              {img.answer.split('|').map((a: string, i: number) => (
                                <span key={i}>
                                  {a.trim()}
                                  {i < img.answer.split('|').length - 1 && <span className="text-zinc-400 dark:text-zinc-600 mx-1">|</span>}
                                </span>
                              ))}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Revealed: {img.revealed_pixels} / {img.total_pixels} pixels
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            Pool: <span className="font-medium text-green-600 dark:text-green-400">
                              {parseFloat(img.pool_amount).toFixed(4)} ETH
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
                        
                        {/* Deposit to Pool Section - Only show if game exists onchain */}
                        {onchainGames.has(img.id) && img.status !== 'completed' && (
                          <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                placeholder="ETH amount"
                                value={depositAmounts[img.id] || ""}
                                onChange={(e) => setDepositAmounts(prev => ({ ...prev, [img.id]: e.target.value }))}
                                className="flex-1 rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <button
                                onClick={() => depositToPool(img.id)}
                                disabled={depositingGame === img.id || !depositAmounts[img.id] || parseFloat(depositAmounts[img.id] || "0") <= 0}
                                className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {depositingGame === img.id ? "Depositing..." : "💰 Deposit"}
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <div className="text-xs">
                              <span className="text-zinc-600 dark:text-zinc-400">Status: </span>
                              <span className={`capitalize font-medium ${
                                img.status === 'active' ? 'text-green-600 dark:text-green-400' :
                                img.status === 'completed' ? 'text-blue-600 dark:text-blue-400' :
                                img.status === 'suspended' ? 'text-orange-600 dark:text-orange-400' :
                                'text-zinc-500'
                              }`}>{img.status}</span>
                            </div>
                            {onchainGames.has(img.id) && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Onchain
                              </div>
                            )}
                            <div className="text-xs text-zinc-500 dark:text-zinc-600">
                              {new Date(img.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {!onchainGames.has(img.id) && (
                              <button
                                onClick={() => createGameOnchain(img)}
                                disabled={creatingGame === img.id}
                                className="px-3 py-1 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {creatingGame === img.id ? "Creating..." : "Create Onchain"}
                              </button>
                            )}
                            {img.status !== 'active' && img.status !== 'completed' && (
                              <button
                                onClick={() => activateImage(img.id)}
                                disabled={!onchainGames.has(img.id)}
                                title={!onchainGames.has(img.id) ? "Create game onchain first" : "Activate this game"}
                                className={`px-3 py-1 text-xs rounded-lg transition-colors font-medium ${
                                  onchainGames.has(img.id)
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-500 cursor-not-allowed'
                                }`}
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Edit Modal */}
      {editingImage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Image</h3>
              <button
                onClick={() => setEditingImage(null)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Image Name</label>
                <input
                  type="text"
                  name="original_name"
                  defaultValue={editingImage.original_name}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Answer(s)</label>
                <input
                  type="text"
                  name="answer"
                  defaultValue={editingImage.answer}
                  placeholder="cat|kitten|feline"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Separate multiple answers with |
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  name="status"
                  defaultValue={editingImage.status}
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="completed">Completed</option>
                  <option value="suspended">Suspended (Manual activation only)</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Suspended images can only be activated manually by admin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Hint at 0 pixels</label>
                <input
                  type="text"
                  name="hint_0"
                  defaultValue={editingImage.hint_0 || ""}
                  placeholder="Initial hint (optional)"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Hint at 1000 pixels</label>
                <input
                  type="text"
                  name="hint_1000"
                  defaultValue={editingImage.hint_1000 || ""}
                  placeholder="Medium difficulty hint (optional)"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Hint at 2000 pixels</label>
                <input
                  type="text"
                  name="hint_2000"
                  defaultValue={editingImage.hint_2000 || ""}
                  placeholder="Easy hint (optional)"
                  className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingImage(null)}
                  className="flex-1 rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
