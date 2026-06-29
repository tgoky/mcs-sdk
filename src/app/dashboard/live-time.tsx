"use client";

import { useState, useEffect } from "react";

interface LiveTimeProps {
  isoString: string;
}

export function LiveTime({ isoString }: LiveTimeProps) {
  // Initialize to an empty string so server HTML and initial client markup match exactly,
  // entirely bypassing hydration mismatches.
  const [timeAgoText, setTimeAgoText] = useState<string>("");

  useEffect(() => {
    const calculateRelativeTime = () => {
      const parsedDate = new Date(isoString);
      const secondsDiff = Math.floor((Date.now() - parsedDate.getTime()) / 1000);
      
      if (secondsDiff < 60) return "just now";
      
      const minutes = Math.floor(secondsDiff / 60);
      if (minutes < 60) return `${minutes}m ago`;
      
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      
      return parsedDate.toLocaleDateString();
    };

    // Set the initial calculation safely during the component's client mount
    setTimeAgoText(calculateRelativeTime());

    // Dynamically poll every 10 seconds to keep your dashboard ticking smoothly
    const intervalId = setInterval(() => {
      setTimeAgoText(calculateRelativeTime());
    }, 10000);

    return () => clearInterval(intervalId);
  }, [isoString]);

  return (
    <span className="text-[10px] text-zinc-600 tabular-nums">
      {timeAgoText ? `Last run ${timeAgoText}` : "Syncing status..."}
    </span>
  );
}