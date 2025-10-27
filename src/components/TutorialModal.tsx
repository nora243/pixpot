"use client";

import { useState, useEffect } from "react";

type TutorialSlide = {
  title: string;
  description: string;
  image?: string;
  icon?: string;
};

const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    title: "1. Reveal Pixels",
    description: "Click on hidden pixels to reveal parts of the image. Each image is 128x128 pixels with 16,384 pixels total waiting to be discovered.",
    icon: "🎨",
  },
  {
    title: "2. Make Your Guess",
    description: "Think you know what the image is? Submit your guess! Your entry fee (0.0001 ETH) adds to the growing prize pool.",
    icon: "🤔",
  },
  {
    title: "3. Win Big Rewards",
    description: "Correct guessers win 70% of the prize pool! Players who revealed pixels share the remaining 30% based on their contributions.",
    icon: "🏆",
  },
  {
    title: "4. Claim Your Prizes",
    description: "Winners and pixel contributors can claim their rewards anytime from the Profile page. All prizes are secured on the blockchain.",
    icon: "💰",
  },
  {
    title: "5. Connect Your Wallet",
    description: "Click 'Connect Wallet' in the top-right corner to start playing. Make sure you're connected to Base mainnet!",
    icon: "🔗",
  },
];

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  useEffect(() => {
    if (!isOpen) {
      setCurrentSlide(0); // Reset when closed
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        handlePrevious();
      } else if (e.key === "Escape") {
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentSlide]);

  // Touch handlers for swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrevious();
    }
  };

  if (!isOpen) return null;

  const isLastSlide = currentSlide === TUTORIAL_SLIDES.length - 1;
  const slide = TUTORIAL_SLIDES[currentSlide];

  const handleNext = () => {
    if (isLastSlide) {
      onClose();
    } else {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-lg bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          aria-label="Close tutorial"
        >
          ✕
        </button>

        {/* Slide Content */}
        <div className="p-8 md:p-12 text-center">
          {/* Icon */}
          <div className="mb-6 text-6xl md:text-7xl animate-bounce-soft">
            {slide.icon}
          </div>

          {/* Title */}
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            {slide.title}
          </h2>

          {/* Description */}
          <p className="text-base md:text-lg text-zinc-300 leading-relaxed mb-8">
            {slide.description}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-8">
            {TUTORIAL_SLIDES.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? "bg-cyan-400 w-6"
                    : "bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3 justify-center">
            {currentSlide > 0 && (
              <button
                onClick={handlePrevious}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
              >
                Back
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="flex-1 max-w-xs px-6 py-3 rounded-xl bg-linear-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold transition-all hover:scale-105 shadow-lg shadow-cyan-500/30"
            >
              {isLastSlide ? "Get Started!" : "Next"}
            </button>

            {!isLastSlide && (
              <button
                onClick={handleSkip}
                className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 font-medium transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>

        {/* Slide counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/50">
          {currentSlide + 1} / {TUTORIAL_SLIDES.length}
        </div>
      </div>
    </div>
  );
}
