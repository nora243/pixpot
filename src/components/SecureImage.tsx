"use client";

import { useAccount } from "wagmi";
import { useState, useEffect } from "react";

type Props = {
  filename: string;
  alt: string;
  className?: string;
};

export default function SecureImage({ filename, alt, className }: Props) {
  const { address } = useAccount();
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [is403, setIs403] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;

    async function fetchImage() {
      try {
        setLoading(true);
        setError(false);
        setIs403(false);
        
        const res = await fetch(`/api/image/${filename}`, {
          headers: {
            "x-wallet-address": address || "",
          },
        });

        if (res.ok) {
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setError(false);
        } else if (res.status === 403) {
          // User doesn't have permission to view this image (not completed yet)
          // Don't log error to console, just show locked state
          setIs403(true);
          setError(false);
        } else {
          const errorData = await res.json().catch(() => ({}));
          console.error("Failed to load image:", res.status, errorData);
          setError(true);
        }
      } catch (err) {
        console.error("Failed to load image:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    if (filename) {
      fetchImage();
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [filename, address]);

  if (is403) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-zinc-800/50 backdrop-blur-sm border border-zinc-700/50`}>
        <div className="text-3xl mb-2">🔒</div>
        <span className="text-xs text-zinc-400">Locked</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800`}>
        <span className="text-xs text-zinc-500">Failed to load</span>
      </div>
    );
  }

  if (loading || !imageUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse`}>
        <span className="text-xs text-zinc-500">Loading...</span>
      </div>
    );
  }

  return <img src={imageUrl} alt={alt} className={className} />;
}
