/**
 * A bright, blurred shape meant to sit BEHIND a surface-glass-* element so
 * that element's own backdrop-filter picks it up and diffuses it — real
 * light passing through frosted glass, not a gradient painted on top of
 * the blur (which is what the CSS-only .surface-glass-* glow does). Must
 * be a sibling positioned behind the glass box, not its child: backdrop-
 * filter samples what's behind an element's box, never its own content.
 *
 * Usage: wrap the glass card in a `relative` container, put this first
 * (so it paints behind), then the card itself with `relative z-10`:
 *
 *   <div className="relative">
 *     <GlowBacklight />
 *     <div className="relative z-10 surface-glass-2 rounded-2xl ...">...</div>
 *   </div>
 */
export function GlowBacklight({
  className = "absolute bottom-4 right-6 h-10 w-48",
}: {
  className?: string;
}) {
  return <div aria-hidden="true" className={`${className} rounded-xl bg-white/70 dark:bg-white/60 blur-xl pointer-events-none`} />;
}
