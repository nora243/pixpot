'use client';

import { useState, useEffect } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guess: string;
};

const funnyMessages = [
  "Oops! So close... but not quite! 😅",
  "Hmm, you might need to reveal a few more pixels! 🤔",
  "Nice try! But not this time! 😜",
  "Whoops! Wrong guess! Don't give up! 💪",
  "Not quite right! Try again! 🎯",
  "Oops! Totally wrong! But keep going! 🚀",
  "Almost there... just kidding, not even close! 😂",
  "Are you sure? Nope, wrong! 🙈",
];

export default function WrongGuessModal({ isOpen, onClose, guess }: Props) {
  const [randomMessage, setRandomMessage] = useState('');

  // Pick a random message when modal opens
  useEffect(() => {
    if (isOpen) {
      const message = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
      setRandomMessage(message);
    }
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
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
        {/* Gradient border with red/orange colors */}
        <div className="relative p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-linear-to-r from-red-500 via-orange-500 to-red-600 shadow-2xl shadow-red-500/50">
          <div className="rounded-[11px] sm:rounded-[14px] bg-linear-to-b from-zinc-900 to-black p-4 sm:p-6 md:p-8 text-center max-h-[90vh] overflow-y-auto">
            
            {/* Sad/Funny Icon - rotating slightly */}
            <div className="mb-3 sm:mb-4 animate-wiggle">
              <div className="text-5xl sm:text-6xl md:text-7xl">😅</div>
            </div>

            {/* Funny Message */}
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-3 bg-linear-to-r from-red-400 via-orange-300 to-red-500 bg-clip-text text-transparent px-2">
              {randomMessage}
            </h2>

            {/* User's wrong guess */}
            <div className="my-3 sm:my-4 p-2.5 sm:p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="text-xs text-red-300 mb-1">Your answer:</div>
              <div className="text-base sm:text-lg font-bold text-red-400 line-through decoration-2 break-all">
                {guess}
              </div>
            </div>

            {/* Encouragement */}
            <p className="text-xs sm:text-sm text-zinc-400 mb-3 sm:mb-4 px-2">
              Don&apos;t give up! Reveal more pixels to get more clues! 🔍
            </p>

            {/* Tips */}
            <div className="p-2.5 sm:p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-3 sm:mb-4 text-left">
              <div className="text-xs text-blue-300 mb-1.5 sm:mb-2">💡 Tips:</div>
              <div className="text-[11px] sm:text-xs text-zinc-300 space-y-1">
                <div>• Reveal more pixels for better visibility</div>
                <div>• Pay attention to the hints displayed</div>
                <div>• Every wrong guess is a learning opportunity!</div>
              </div>
            </div>

            {/* Fee reminder */}
            <div className="text-[11px] sm:text-xs text-yellow-400/80 mb-3 sm:mb-4 px-2">
              ⚠️ Remember: Each guess costs 0.0001 ETH!
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-full px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg bg-linear-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white text-sm sm:text-base font-semibold transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-red-500/50"
            >
              OK, Try Again! 💪
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
        .animate-wiggle {
          animation: wiggle 0.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
