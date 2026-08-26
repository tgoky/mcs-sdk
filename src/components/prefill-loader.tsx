// src/components/prefill-loader.tsx
//
// Original small loading motif shown while the Smart Pre-Fill crawl is
// running (New Client → offer step). Three nodes orbiting a pulsing core,
// styled off --text-prefill-accent so it themes correctly in both modes.
// Deliberately its own shape/rhythm — not a reuse of any third-party
// product's loading animation. See .prefill-orbit-* / .prefill-scan
// keyframes in globals.css.

export function PrefillLoader({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle
        className="prefill-orbit-core"
        cx="12"
        cy="12"
        r="2.4"
        fill="currentColor"
      />
      <g className="prefill-orbit-node">
        <circle cx="12" cy="3.2" r="1.5" fill="currentColor" />
      </g>
      <g className="prefill-orbit-node">
        <circle cx="19.6" cy="16" r="1.5" fill="currentColor" />
      </g>
      <g className="prefill-orbit-node">
        <circle cx="4.4" cy="16" r="1.5" fill="currentColor" />
      </g>
    </svg>
  );
}
