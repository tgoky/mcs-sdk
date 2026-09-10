import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The shared elevated-surface primitive. Replaces the ad hoc
 * "rounded-lg border ... bg-transparent backdrop-blur-sm" divs copy-pasted
 * per-file across the dashboard — glass fill over a real blur, diffused
 * shadow, thin inset top highlight (see .surface-glass-* in globals.css).
 * `elevation` picks the tier: 1 for resting content, 2 (default) for a
 * card that visibly sits above the page, 3 for floating overlays.
 */
function Card({
  className,
  elevation = 2,
  ...props
}: React.ComponentProps<"div"> & { elevation?: 1 | 2 | 3 }) {
  return (
    <div
      data-slot="card"
      className={cn(`surface-glass-${elevation} rounded-xl`, className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-4 pt-4", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-sm font-semibold leading-none", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-xs", className)}
      style={{ color: "var(--text-muted)" }}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-4 pb-4", className)} {...props} />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
