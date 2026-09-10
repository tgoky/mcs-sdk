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
  className = "absolute inset-x-[15%] top-[12%] h-1/5",
}: {
  className?: string;
}) {
  // Inset generously from every edge, as a percentage of the card's own
  // size rather than fixed pixels — blur-lg's ~16px visual spread has to
  // stay inside that margin regardless of how big or small the card
  // actually is, or the glow shows up as a raw shape outside the card's
  // border instead of a contained interior bloom (the bug this replaces:
  // a fixed 40px+ blur positioned only 16px from the edge, which bled
  // straight past the card's bottom edge onto the page).
  return <div aria-hidden="true" className={`${className} rounded-full bg-white/80 dark:bg-white/70 blur-lg pointer-events-none`} />;
}
