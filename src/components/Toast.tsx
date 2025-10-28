"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  type: "success" | "error" | "info" | "loading";
  onClose: () => void;
  duration?: number;
};

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (type !== "loading") {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [type, duration, onClose]);

  const getStyles = () => {
    switch (type) {
      case "success":
        return "bg-gradient-to-r from-green-500 to-emerald-600 text-white";
      case "error":
        return "bg-gradient-to-r from-red-500 to-rose-600 text-white";
      case "loading":
        return "bg-gradient-to-r from-blue-500 to-cyan-600 text-white";
      case "info":
      default:
        return "bg-gradient-to-r from-zinc-700 to-zinc-800 text-white";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "loading":
        return (
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
        );
      case "info":
      default:
        return "ℹ";
    }
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className={`${getStyles()} px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px] max-w-[500px]`}>
        <div className="shrink-0 w-5 h-5 flex items-center justify-center font-bold text-lg">
          {getIcon()}
        </div>
        <div className="flex-1 text-sm font-medium">{message}</div>
      </div>
    </div>
  );
}
