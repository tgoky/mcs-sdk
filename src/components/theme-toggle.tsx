"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // Defer state update to a macro-task queue to clear cascading render warnings
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) {
    return <div className="w-8 h-8 rounded-lg border border-border/40 shrink-0" />;
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      className="rounded-lg border-border bg-muted/20 hover:bg-muted/50 transition-colors font-mono cursor-pointer text-foreground"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle application color scheme theme"
    >
      {theme === "dark" ? (
        <Sun className="size-4 text-amber-400" />
      ) : (
        <Moon className="size-4 text-zinc-700" />
      )}
    </Button>
  );
}