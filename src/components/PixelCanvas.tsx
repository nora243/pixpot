"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { GRID_SIZE } from "@/lib/constants";
import { PIXPOT_CONTRACT_ABI, PIXPOT_CONTRACT_ADDRESS } from "@/lib/contract";
import { formatEther } from "viem";

type Props = {
  onRevealedCountChange?: (count: number) => void;
  onHintsChange?: (hints: string[]) => void;
  onGameDataChange?: (data: { poolAmount: string; winnerAddress: string | null; participantsCount: number; guessesCount: number; gameId: number }) => void;
};

type OpenPixelResponse = {
  success: boolean;
  txHash: string;
  color: string; // hex string
  index: number;
};

type NotificationState = {
  message: string;
  type: "success" | "error" | "info" | "loading";
} | null;

export default function PixelCanvas({ onRevealedCountChange, onHintsChange, onGameDataChange }: Props) {
  const { address, connector } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [pending, setPending] = useState<Set<number>>(() => new Set());
  const revealedRef = useRef<Set<number>>(new Set());
  const pendingRef = useRef<Set<number>>(new Set());
  const [hovered, setHovered] = useState<number | null>(null);
  const [clicked, setClicked] = useState<number | null>(null);
  const [gameData, setGameData] = useState<any>(null);
  const [noGameMessage, setNoGameMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationState>(null);
  const [showCrosshair, setShowCrosshair] = useState(true);

  // Read current game pool from contract
  const { data: contractGame, refetch: refetchContractGame } = useReadContract({
    address: PIXPOT_CONTRACT_ADDRESS,
    abi: PIXPOT_CONTRACT_ABI,
    functionName: 'getCurrentGame',
    query: {
      enabled: !!PIXPOT_CONTRACT_ADDRESS,
      refetchInterval: 5000, // Refetch every 5 seconds
    }
  });

  // View transform (CSS transform applied to the canvas)
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0); // translateX in pixels (container space)
  const [ty, setTy] = useState(0); // translateY

  // Drag/pinch state
  const draggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    mid: { x: number; y: number };
    scale: number;
  } | null>(null);
  const touchCountRef = useRef(0); // Track number of active touches
  const isPinchingRef = useRef(false); // Flag to prevent pan during pinch

  const size = GRID_SIZE;

  // Load game data from API
  useEffect(() => {
    async function loadGame() {
      try {
        const res = await fetch("/api/game");
        if (res.ok) {
          const data = await res.json();
          setGameData(data);
          setNoGameMessage(null);
          // Mark already revealed pixels
          const revealedSet = new Set<number>();
          data.revealed.forEach((p: any) => {
            revealedSet.add(p.index);
          });
          setRevealed(revealedSet);
          revealedRef.current = revealedSet;
          // Pass hints to parent
          if (onHintsChange && data.hints) {
            onHintsChange(data.hints);
          }
          // Pass game data to parent - use contract pool amount if available
          if (onGameDataChange) {
            let poolAmount = data.poolAmount || "0"; // Fallback to database pool
            let gameId = data.imageId || 0;
            
            // console.log("[PixelCanvas] Contract game data:", contractGame);
            // console.log("[PixelCanvas] Database pool:", data.poolAmount);
            // console.log("[PixelCanvas] Database gameId:", data.imageId);
            
            // Try to get pool from contract if available
            if (contractGame && typeof contractGame === 'object') {
              try {
                // contractGame is array: [gameId, imageHash, totalPixels, revealedPixels, poolAmount, winner, isActive]
                const contractGameId = Array.isArray(contractGame) ? Number(contractGame[0]) : Number((contractGame as any).gameId);
                const contractIsActive = Array.isArray(contractGame) ? contractGame[6] : (contractGame as any).isActive;
                const contractPoolAmount = Array.isArray(contractGame) ? contractGame[4] : (contractGame as any).poolAmount;
                
                // console.log("[PixelCanvas] Contract game ID:", contractGameId);
                // console.log("[PixelCanvas] Contract is active:", contractIsActive);
                // console.log("[PixelCanvas] Contract pool amount raw:", contractPoolAmount);
                
                // Only use contract data if it's active AND matches our database game
                if (contractIsActive && contractGameId === data.imageId) {
                  if (contractPoolAmount !== undefined && contractPoolAmount !== null) {
                    poolAmount = formatEther(BigInt(contractPoolAmount.toString()));
                    // console.log("[PixelCanvas] Using contract pool:", poolAmount);
                  }
                  gameId = contractGameId;
                } else {
                  console.log("[PixelCanvas] Contract game mismatch or inactive, using database pool");
                  console.log(`[PixelCanvas] Contract active: ${contractIsActive}, IDs match: ${contractGameId === data.imageId}`);
                }
              } catch (err) {
                console.warn("[PixelCanvas] Failed to parse contract game data:", err);
              }
            } else {
              console.log("[PixelCanvas] No contract game data, using database pool");
            }
            
            // console.log("[PixelCanvas] Final pool amount:", poolAmount);
            
            onGameDataChange({
              poolAmount: poolAmount,
              winnerAddress: data.winnerAddress || null,
              participantsCount: data.participantsCount || 0,
              guessesCount: data.guessesCount || 0,
              gameId: gameId,
            });
          }
        } else {
          const errorData = await res.json();
          if (errorData.allCompleted) {
            setNoGameMessage(errorData.message || "🏁 All games completed!");
          } else {
            setNoGameMessage("No active game found. Please wait for admin to activate a game.");
          }
        }
      } catch (err) {
        console.error("Failed to load game:", err);
        setNoGameMessage("Failed to load game. Please try again.");
      }
    }
    loadGame();
  }, [onHintsChange, onGameDataChange, contractGame]); // Re-run when contract data changes

  // Realtime sync: Poll for new revealed pixels every 5 seconds
  // Optimized to reduce server load
  useEffect(() => {
    if (!gameData?.imageId) {
      console.log('[Realtime] No game data, skipping sync');
      return;
    }

    console.log('[Realtime] Starting sync for game:', gameData.imageId);

    const syncInterval = setInterval(async () => {
      // Only poll if tab is visible to save resources
      if (document.hidden) {
        console.log('[Realtime] Tab hidden, skipping poll');
        return;
      }

      try {
        console.log('[Realtime] Polling for updates...');
        const res = await fetch("/api/game", {
          // Add cache control to prevent browser caching stale data
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          
          const currentRevealed = revealedRef.current;
          const currentPending = pendingRef.current;
          
          // console.log('[Realtime] Current revealed:', currentRevealed.size, 'New revealed:', data.revealed.length);
          
          // Check if there are new pixels revealed by others
          const newRevealedSet = new Set<number>();
          data.revealed.forEach((p: any) => {
            newRevealedSet.add(p.index);
          });

          // Find newly revealed pixels (not in current set and not pending)
          const newPixels: number[] = [];
          newRevealedSet.forEach((idx) => {
            if (!currentRevealed.has(idx) && !currentPending.has(idx)) {
              newPixels.push(idx);
            }
          });

          // If there are new pixels, update state and redraw
          if (newPixels.length > 0) {
            // console.log('[Realtime] Found', newPixels.length, 'new pixels:', newPixels.slice(0, 5));
            setRevealed(newRevealedSet);
            revealedRef.current = newRevealedSet;
            
            // Draw new pixels on canvas
            const canvas = canvasRef.current;
            if (canvas && data.pixelData) {
              const ctx = canvas.getContext("2d");
              if (ctx) {
                const pixelDataStr = data.pixelData;
                const pixelBytes = Uint8Array.from(atob(pixelDataStr), c => c.charCodeAt(0));
                
                newPixels.forEach((idx) => {
                  const x = idx % size;
                  const y = Math.floor(idx / size);
                  const offset = idx * 3;
                  const r = pixelBytes[offset];
                  const g = pixelBytes[offset + 1];
                  const b = pixelBytes[offset + 2];
                  const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                  ctx.fillStyle = color;
                  ctx.fillRect(x, y, 1, 1);
                });
                // console.log('[Realtime] Drew', newPixels.length, 'pixels');
              }
            }
          } else {
            // console.log('[Realtime] No new pixels');
          }

          // Update hints if changed
          if (onHintsChange && data.hints) {
            onHintsChange(data.hints);
          }

          // Refetch contract pool amount
          if (refetchContractGame) {
            refetchContractGame();
          }
        }
      } catch (err) {
        console.error("[Realtime] Sync error:", err);
      }
    }, 5000); // Poll every 5 seconds (reduced from 3s)

    return () => {
      // console.log('[Realtime] Stopping sync');
      clearInterval(syncInterval);
    };
  }, [gameData?.imageId, size, onHintsChange, refetchContractGame]);

  // Draw a white background initially
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Draw already revealed pixels from game data
    if (gameData?.pixelData && gameData?.revealed) {
      // Decode base64 pixel data
      const pixelDataStr = gameData.pixelData;
      const pixelBytes = Uint8Array.from(atob(pixelDataStr), c => c.charCodeAt(0));
      
      // Draw each revealed pixel
      gameData.revealed.forEach((p: any) => {
        const idx = p.index;
        const x = idx % size;
        const y = Math.floor(idx / size);
        const offset = idx * 3; // RGB = 3 bytes per pixel
        const r = pixelBytes[offset];
        const g = pixelBytes[offset + 1];
        const b = pixelBytes[offset + 2];
        const color = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    }
  }, [size, gameData]);

  // Initialize scale to fit container exactly
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const updateSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      const fit = Math.min(w / size, h / size);
      setScale(fit);
      setTx((w - size * fit) / 2);
      setTy((h - size * fit) / 2);
    };
    
    updateSize();
    
    // Re-fit on window resize
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [size]);

  // Clamp translate so canvas stays within container bounds at current scale
  const clampTransform = useCallback((s: number, x: number, y: number) => {
    const container = containerRef.current;
    if (!container) return { tx: x, ty: y };
    const w = container.clientWidth;
    const h = container.clientHeight;
    const canvasW = size * s;
    const canvasH = size * s;
    // If canvas smaller than container, center it; else clamp to edges
    let clampedX = x;
    let clampedY = y;
    if (canvasW <= w) {
      clampedX = (w - canvasW) / 2;
    } else {
      clampedX = Math.min(0, Math.max(w - canvasW, x));
    }
    if (canvasH <= h) {
      clampedY = (h - canvasH) / 2;
    } else {
      clampedY = Math.min(0, Math.max(h - canvasH, y));
    }
    return { tx: clampedX, ty: clampedY };
  }, [size]);

  useEffect(() => {
    onRevealedCountChange?.(revealed.size);
  }, [revealed, onRevealedCountChange]);

  // Auto-hide notification after 3 seconds (except loading)
  useEffect(() => {
    if (notification && notification.type !== "loading") {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Prevent page scroll when wheeling over canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default scroll when touching canvas
      // This prevents page scroll while panning or pinching
      if (touchCountRef.current > 0) {
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const drawPixel = useCallback((index: number, color: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const x = index % size;
    const y = Math.floor(index / size);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }, [size]);

  // Map a container-space coordinate to pixel index considering transform
  const screenToPixel = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const worldX = (localX - tx) / scale;
    const worldY = (localY - ty) / scale;
    const x = Math.floor(worldX);
    const y = Math.floor(worldY);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return y * size + x;
  }, [scale, tx, ty, size]);

  const handleClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    // Only trigger on actual click, not after dragging
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    
    // Check if wallet is connected
    if (!address) {
      setNotification({ message: "Please connect your wallet to reveal pixels", type: "info" });
      return;
    }

    // Check if contract is configured
    if (!PIXPOT_CONTRACT_ADDRESS) {
      setNotification({ message: "Smart contract not configured", type: "error" });
      return;
    }

    // Check if game data is loaded
    if (!gameData?.imageId) {
      setNotification({ message: "Game not loaded yet", type: "info" });
      return;
    }
    
    const index = screenToPixel(e.clientX, e.clientY);
    if (index == null) return;

    // Set clicked pixel for visual feedback
    setClicked(index);

    // Check if already revealed or pending
    if (revealed.has(index) || pending.has(index)) {
      setNotification({ message: "This pixel is already revealed or being revealed", type: "info" });
      return;
    }

    // Add to pending state immediately to prevent double-clicks
    setPending(prev => {
      const next = new Set(prev).add(index);
      pendingRef.current = next;
      return next;
    });

    try {
      setNotification({ message: "Sending transaction to blockchain...", type: "loading" });

      // Step 1: Call revealPixels() onchain
      const tx = await writeContractAsync({
        address: PIXPOT_CONTRACT_ADDRESS,
        abi: PIXPOT_CONTRACT_ABI,
        functionName: "revealPixels",
        args: [
          BigInt(gameData.imageId), // gameId
          BigInt(1),                 // pixelCount = 1
        ],
      });

      setNotification({ message: "Waiting for blockchain confirmation...", type: "loading" });

      // Step 2: Wait for transaction confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }

      setNotification({ message: "Verifying transaction onchain...", type: "loading" });

      // Step 3: Save to database only after onchain success
      const res = await fetch("/api/openPixel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          index, 
          walletAddress: address,
          txHash: tx, // Include transaction hash for verification
          connectorName: connector?.name, // 🔵 Include connector type for validation logic
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle specific error cases
        if (data.alreadyRevealed) {
          setNotification({ message: "Someone just revealed this pixel!", type: "error" });
          // The pixel will be synced by realtime polling
        } else if (data.error?.includes("timeout")) {
          setNotification({ message: "Transaction verification timeout. Please try again.", type: "error" });
        } else if (data.error?.includes("Transaction failed")) {
          setNotification({ message: "Transaction failed onchain", type: "error" });
        } else if (data.error?.includes("not sent to PixPot")) {
          setNotification({ message: "Invalid transaction", type: "error" });
        } else if (data.error?.includes("does not match")) {
          setNotification({ message: "Wallet address mismatch", type: "error" });
        } else {
          setNotification({ message: data.error || "Failed to reveal pixel", type: "error" });
        }
        return;
      }

      if (data.success) {
        // Draw pixel immediately for instant feedback
        drawPixel(index, data.color);
        
        setRevealed(prev => {
          const next = new Set(prev).add(index);
          revealedRef.current = next;
          return next;
        });

        setNotification({ message: "Pixel revealed successfully!", type: "success" });

        // Refetch contract pool amount to update prize pool display
        if (refetchContractGame) {
          refetchContractGame();
        }
      }
    } catch (err: any) {
      console.error("Error revealing pixel:", err);
      
      // Handle specific errors
      if (err.message?.includes("Game is not active")) {
        setNotification({ message: "This game is not active", type: "error" });
      } else if (err.message?.includes("Exceeds total pixels")) {
        setNotification({ message: "All pixels already revealed", type: "error" });
      } else if (err.message?.includes("User rejected") || err.message?.includes("rejected")) {
        setNotification({ message: "Transaction cancelled", type: "info" });
      } else if (err.message?.includes("insufficient funds")) {
        setNotification({ message: "Insufficient ETH to reveal pixel", type: "error" });
      } else if (err.message?.includes("network")) {
        setNotification({ message: "Network error. Please try again.", type: "error" });
      } else {
        setNotification({ message: "Failed to reveal pixel. Please try again.", type: "error" });
      }
    } finally {
      // Always remove from pending state
      setPending(prev => {
        const next = new Set(prev);
        next.delete(index);
        pendingRef.current = next;
        return next;
      });
    }
  }, [screenToPixel, revealed, pending, drawPixel, address, writeContractAsync, publicClient, gameData, refetchContractGame]);

  const revealedCount = revealed.size;

  const resetView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const fit = Math.min(w / size, h / size);
    setScale(fit);
    setTx((w - size * fit) / 2);
    setTy((h - size * fit) / 2);
  }, [size]);

  // Show message if no game is available
  if (noGameMessage) {
    return (
      <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg shadow ring-1 ring-white/10 bg-zinc-900">
        <div className="text-center p-8 space-y-4">
          <div className="text-4xl sm:text-6xl">🏁</div>
          <div className="text-base sm:text-lg font-semibold text-zinc-50">
            {noGameMessage}
          </div>
          <div className="text-sm text-zinc-400">
            {noGameMessage.includes("All games") 
              ? "Contact admin to add more games."
              : "A new game will start soon."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-square touch-none select-none overflow-hidden rounded-lg shadow ring-1 ring-white/10 bg-zinc-900"
      style={{ 
        overscrollBehavior: 'none',
        touchAction: 'none'
      }}
      onWheel={(e) => {
        // Note: preventDefault is handled in useEffect with { passive: false }
        e.stopPropagation();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const worldX = (localX - tx) / scale;
        const worldY = (localY - ty) / scale;
        const factor = Math.pow(1.001, -e.deltaY); // smooth zoom
        const newScale = Math.min(64, Math.max(0.5, scale * factor));
        // Keep cursor world point stable under zoom
        let newTx = localX - worldX * newScale;
        let newTy = localY - worldY * newScale;
        const clamped = clampTransform(newScale, newTx, newTy);
        setScale(newScale);
        setTx(clamped.tx);
        setTy(clamped.ty);
      }}
      onMouseDown={(e) => {
        draggingRef.current = true;
        hasDraggedRef.current = false;
        lastPosRef.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseMove={(e) => {
        if (draggingRef.current && lastPosRef.current) {
          const dx = e.clientX - lastPosRef.current.x;
          const dy = e.clientY - lastPosRef.current.y;
          // Mark as dragged if moved more than 3px
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasDraggedRef.current = true;
          }
          const newTx = tx + dx;
          const newTy = ty + dy;
          const clamped = clampTransform(scale, newTx, newTy);
          setTx(clamped.tx);
          setTy(clamped.ty);
          lastPosRef.current = { x: e.clientX, y: e.clientY };
        }
        const idx = screenToPixel(e.clientX, e.clientY);
        setHovered(idx);
      }}
      onMouseLeave={() => setHovered(null)}
      onMouseUp={() => {
        draggingRef.current = false;
        lastPosRef.current = null;
      }}
      onClick={handleClick}
      onTouchStart={(e) => {
        touchCountRef.current = e.touches.length;
        
        if (e.touches.length === 1) {
          // Single touch - prepare for panning (only if not already pinching)
          if (!isPinchingRef.current) {
            lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            hasDraggedRef.current = false;
          }
        } else if (e.touches.length === 2) {
          // Two touches - start pinch zoom
          isPinchingRef.current = true;
          lastPosRef.current = null; // Clear pan state
          
          const [a, b] = [e.touches[0], e.touches[1]];
          const dx = b.clientX - a.clientX;
          const dy = b.clientY - a.clientY;
          const dist = Math.hypot(dx, dy);
          const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
          pinchRef.current = { dist, mid, scale };
        }
      }}
      onTouchMove={(e) => {
        touchCountRef.current = e.touches.length;
        
        // Only pan with exactly 1 touch AND not during/after pinch
        if (e.touches.length === 1 && lastPosRef.current && !isPinchingRef.current && !pinchRef.current) {
          const t = e.touches[0];
          const dx = t.clientX - lastPosRef.current.x;
          const dy = t.clientY - lastPosRef.current.y;
          
          // Only start panning if moved at least 3px (avoid accidental pans)
          const distance = Math.hypot(dx, dy);
          if (distance > 3 || hasDraggedRef.current) {
            hasDraggedRef.current = true;
            
            const newTx = tx + dx;
            const newTy = ty + dy;
            const clamped = clampTransform(scale, newTx, newTy);
            setTx(clamped.tx);
            setTy(clamped.ty);
            lastPosRef.current = { x: t.clientX, y: t.clientY };
            
            const idx = screenToPixel(t.clientX, t.clientY);
            setHovered(idx);
          }
        } else if (e.touches.length === 2 && pinchRef.current) {
          // Pinch zoom with exactly 2 touches
          isPinchingRef.current = true;
          lastPosRef.current = null; // Ensure no pan state during pinch
          
          const [a, b] = [e.touches[0], e.touches[1]];
          const dx = b.clientX - a.clientX;
          const dy = b.clientY - a.clientY;
          const dist = Math.hypot(dx, dy);
          const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
          const pinch = pinchRef.current;
          
          const factor = dist / pinch.dist;
          const newScale = Math.min(64, Math.max(0.5, pinch.scale * factor));
          
          // Keep midpoint stable
          const rect = containerRef.current!.getBoundingClientRect();
          const localX = mid.x - rect.left;
          const localY = mid.y - rect.top;
          const worldX = (localX - tx) / scale;
          const worldY = (localY - ty) / scale;
          let newTx = localX - worldX * newScale;
          let newTy = localY - worldY * newScale;
          const clamped = clampTransform(newScale, newTx, newTy);
          setScale(newScale);
          setTx(clamped.tx);
          setTy(clamped.ty);
        } else if (e.touches.length > 2) {
          // More than 2 touches - block all interactions
          lastPosRef.current = null;
          pinchRef.current = null;
        }
      }}
      onTouchEnd={(e) => {
        touchCountRef.current = e.touches.length;
        
        // If all fingers lifted, reset states
        if (e.touches.length === 0) {
          lastPosRef.current = null;
          pinchRef.current = null;
          isPinchingRef.current = false;
          hasDraggedRef.current = false;
        } else if (e.touches.length === 1) {
          // If went from 2+ touches to 1 touch, reset pinch but allow pan
          pinchRef.current = null;
          // Wait a bit before allowing pan to avoid accidental movement
          setTimeout(() => {
            if (touchCountRef.current === 1 && !isPinchingRef.current) {
              isPinchingRef.current = false;
              lastPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
          }, 100);
        }
      }}
      onTouchCancel={() => {
        // Reset all touch states on cancel
        lastPosRef.current = null;
        pinchRef.current = null;
        isPinchingRef.current = false;
        hasDraggedRef.current = false;
        touchCountRef.current = 0;
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
          cursor: "crosshair",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="pointer-events-none"
      />
      {/* Hover highlight with crosshair */}
      {hovered != null && (() => {
        const x = hovered % size;
        const y = Math.floor(hovered / size);
        const left = tx + x * scale;
        const top = ty + y * scale;
        const s = 1 * scale;
        const isRevealed = revealed.has(hovered);
        const outlineColor = isRevealed ? "rgba(239, 68, 68, 0.9)" : "rgba(59, 130, 246, 0.9)"; // red-500 if revealed, blue-500 if not
        const container = containerRef.current;
        const containerWidth = container?.clientWidth || 0;
        const containerHeight = container?.clientHeight || 0;
        
        return (
          <>
            {/* Pixel highlight */}
            <div
              key={`pixel-${x}-${y}`}
              className="pointer-events-none absolute box-content rounded-sm"
              style={{
                left,
                top,
                width: s,
                height: s,
                outline: `${Math.max(1, scale * 0.1)}px solid ${outlineColor}`,
                outlineOffset: 0,
                zIndex: 10,
              }}
            />
            {/* Horizontal crosshair line */}
            {showCrosshair && (
              <div
                key={`h-line-${y}`}
                className="pointer-events-none absolute"
                style={{
                  left: 0,
                  top: ty + y * scale,
                  width: containerWidth,
                  height: scale,
                  backgroundColor: "rgba(128, 128, 128, 0.15)",
                  zIndex: 5,
                }}
              />
            )}
            {/* Vertical crosshair line */}
            {showCrosshair && (
              <div
                key={`v-line-${x}`}
                className="pointer-events-none absolute"
                style={{
                  left: tx + x * scale,
                  top: 0,
                  width: scale,
                  height: containerHeight,
                  backgroundColor: "rgba(128, 128, 128, 0.15)",
                  zIndex: 5,
                }}
              />
            )}
          </>
        );
      })()}
      {/* Clicked highlight with crosshair */}
      {clicked != null && (() => {
        const x = clicked % size;
        const y = Math.floor(clicked / size);
        const left = tx + x * scale;
        const top = ty + y * scale;
        const s = 1 * scale;
        const isRevealed = revealed.has(clicked);
        const outlineColor = isRevealed ? "rgba(239, 68, 68, 0.9)" : "rgba(59, 130, 246, 0.9)"; // red-500 if revealed, blue-500 if not
        const container = containerRef.current;
        const containerWidth = container?.clientWidth || 0;
        const containerHeight = container?.clientHeight || 0;
        
        return (
          <>
            {/* Pixel highlight */}
            <div
              key={`clicked-pixel-${x}-${y}`}
              className="pointer-events-none absolute box-content rounded-sm"
              style={{
                left,
                top,
                width: s,
                height: s,
                outline: `${Math.max(2, scale * 0.15)}px solid ${outlineColor}`,
                outlineOffset: 0,
                zIndex: 10,
              }}
            />
            {/* Horizontal crosshair line */}
            {showCrosshair && (
              <div
                key={`clicked-h-line-${y}`}
                className="pointer-events-none absolute"
                style={{
                  left: 0,
                  top: ty + y * scale,
                  width: containerWidth,
                  height: scale,
                  backgroundColor: "rgba(128, 128, 128, 0.15)",
                  zIndex: 5,
                }}
              />
            )}
            {/* Vertical crosshair line */}
            {showCrosshair && (
              <div
                key={`clicked-v-line-${x}`}
                className="pointer-events-none absolute"
                style={{
                  left: tx + x * scale,
                  top: 0,
                  width: scale,
                  height: containerHeight,
                  backgroundColor: "rgba(128, 128, 128, 0.15)",
                  zIndex: 5,
                }}
              />
            )}
          </>
        );
      })()}
      <div className="absolute left-2 top-2 rounded-lg bg-black/70 backdrop-blur-sm px-3 py-2 text-xs font-semibold text-white pointer-events-none shadow-lg">
        Opened: {revealedCount}
      </div>
      <div className="absolute right-2 top-2 flex gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCrosshair(!showCrosshair);
          }}
          className="group relative overflow-hidden rounded-lg bg-linear-to-r from-blue-500/90 via-cyan-400/90 to-blue-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/40"
          title={showCrosshair ? "Hide crosshair" : "Show crosshair"}
        >
          <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 transition-all">
            <span className="hidden sm:inline text-xs font-semibold text-white">
              {showCrosshair ? "✕ Crosshair" : "⊞ Crosshair"}
            </span>
            <span className="sm:hidden text-sm font-semibold text-white">
              {showCrosshair ? "✕" : "⊞"}
            </span>
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
          className="group relative overflow-hidden rounded-lg bg-linear-to-r from-blue-500/90 via-cyan-400/90 to-blue-600/90 p-0.5 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/40"
          title="Reset view"
        >
          <div className="relative rounded-md bg-black/80 backdrop-blur-sm px-3 py-1.5 transition-all">
            <span className="hidden sm:inline text-xs font-semibold text-white">↺ Reset</span>
            <span className="sm:hidden text-sm font-semibold text-white">↺</span>
          </div>
        </button>
      </div>
      
      {/* Notification */}
      {notification && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-black/10 ${
            notification.type === "success" 
              ? "bg-green-600" 
              : notification.type === "error"
              ? "bg-red-600"
              : notification.type === "loading"
              ? "bg-blue-600"
              : "bg-blue-600" // info uses blue
          }`}>
            <div className="flex items-center gap-2">
              {notification.type === "loading" ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : notification.type === "success" ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : notification.type === "error" ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{notification.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
