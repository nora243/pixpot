'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import Link from 'next/link';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  prizeAmount: string;
};

export default function WinnerModal({ isOpen, onClose, prizeAmount }: Props) {
  useEffect(() => {
    if (!isOpen) return;

    // Confetti burst from multiple angles
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: NodeJS.Timeout = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      // Burst from left
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });

      // Burst from right
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });

      // Burst from center
      confetti({
        ...defaults,
        particleCount: particleCount * 2,
        origin: { x: 0.5, y: 0.5 }
      });
    }, 250);

    // Cleanup
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg animate-in zoom-in-95 duration-500">
        {/* Gradient border */}
        <div className="relative p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-linear-to-r from-yellow-400 via-amber-500 to-yellow-600 shadow-2xl shadow-yellow-500/50">
          <div className="rounded-[11px] sm:rounded-[14px] bg-linear-to-b from-zinc-900 to-black p-4 sm:p-6 md:p-8 text-center max-h-[90vh] overflow-y-auto">
            
            {/* Trophy Icon */}
            <div className="mb-4 sm:mb-6 animate-bounce">
              <div className="text-6xl sm:text-7xl md:text-8xl">🏆</div>
            </div>

            {/* Congratulations Text */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 bg-linear-to-r from-yellow-400 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
              CONGRATULATIONS!
            </h1>

            <p className="text-lg sm:text-xl md:text-2xl text-white font-semibold mb-2">
              🎉 You guessed it right! 🎉
            </p>

            {/* Prize Amount */}
            <div className="my-4 sm:my-6 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-linear-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30">
              <div className="text-xs sm:text-sm text-yellow-300 mb-1">Your Prize</div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-yellow-400 break-all">
                {prizeAmount} ETH
              </div>
              <div className="text-xs text-yellow-300/70 mt-1">
                (70% of total prize pool)
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-left">
              <p className="text-xs sm:text-sm text-blue-300 mb-2 sm:mb-3">
                💡 <span className="font-semibold">To claim your prize:</span>
              </p>
              <ol className="text-xs sm:text-sm text-zinc-300 space-y-1.5 sm:space-y-2 ml-3 sm:ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">1.</span>
                  <span>Go to <span className="text-blue-400 font-semibold">Profile</span> page</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">2.</span>
                  <span>Find <span className="text-blue-400 font-semibold">&quot;Won Prizes&quot;</span> section</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold shrink-0">3.</span>
                  <span>Click <span className="text-green-400 font-semibold">&quot;Claim&quot;</span> button to receive prize</span>
                </li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Link
                href="/profile"
                className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-linear-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white text-sm sm:text-base font-semibold transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-blue-500/50"
              >
                🎁 Go to Profile
              </Link>
              <button
                onClick={onClose}
                className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm sm:text-base font-semibold transition-all duration-200 border border-zinc-700"
              >
                Close
              </button>
            </div>

            {/* Note */}
            <p className="mt-4 sm:mt-6 text-[10px] sm:text-xs text-zinc-500 leading-relaxed">
              * This is a demo mode. Wallet connection works on Base networks but transactions are off-chain.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
