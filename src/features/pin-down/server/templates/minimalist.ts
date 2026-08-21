import type { PageContentModel } from "./content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "./content-model";

/**
 * The Minimalist Trust — for a brand that's already done the convincing
 * before this page ever loads. Nothing here should compete with that.
 * Pure white, one ink color, no cards, no borders, no boxed panels
 * anywhere on the page. Signature element: the total absence of
 * chrome — testimonials sit as bare pull-quotes and questions as a bare
 * numbered list, deliberately the quietest page in the set, built to get
 * out of the way rather than to make an impression. Stays the leanest of
 * the 5 designs on purpose — a compact video line instead of a boxed
 * player, one merge-driven greeting instead of a chip row.
 *
 * Published once per engagement as static HTML, so the greeting resolves
 * client-side from the booking redirect (see content-model.ts) rather
 * than every prospect seeing the operator's own business name.
 */
export function buildMinimalistHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <li><span class="num">${i + 1}</span>${q}</li>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      ${m.testimonials
        .map(
          (t) => `
        <p class="quote">&ldquo;${t.quote}&rdquo; <span class="who">&mdash; ${t.name}, ${t.role}${t.company ? `, ${t.company}` : ""}</span></p>`
        )
        .join("")}
    </section>`
    : "";

  const calendarHtml = m.calendarAddToUrl
    ? `<a class="cta" href="${m.calendarAddToUrl}">Add to calendar &rarr;</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${m.title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #FFFFFF;
    color: #171717;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 520px; margin: 0 auto; padding: 88px 24px 120px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .brand-line { font-size: 0.78rem; color: #9a9a9a; margin: 0 0 22px; }
  h1 { font-size: 1.7rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; margin: 0 0 14px; }
  .sub { font-size: 0.95rem; color: #6B6B6B; margin: 0 0 12px; line-height: 1.6; max-width: 42ch; }
  .call-line { font-size: 0.86rem; color: #6B6B6B; margin: 0 0 40px; }
  .call-line strong { color: #171717; font-weight: 600; }

  .rule { border: none; border-top: 1px solid #ECECEC; margin: 0 0 40px; }

  section { margin-bottom: 48px; }
  .brief-text { font-size: 0.92rem; color: #3d3d3d; line-height: 1.75; margin: 0; }
  .brief-text .tag { display: block; margin-top: 10px; font-size: 0.78rem; color: #9a9a9a; }

  /* One quiet line instead of a boxed video player — the minimalism
     budget covers this section too. */
  .video-line { display: flex; align-items: center; gap: 10px; margin-top: 18px; font-size: 0.82rem; color: #6B6B6B; }
  .video-line .dot { width: 6px; height: 6px; border-radius: 50%; background: #171717; flex-shrink: 0; }

  ol.plain { list-style: none; margin: 0; padding: 0; counter-reset: none; }
  ol.plain li { display: flex; gap: 12px; align-items: baseline; padding: 11px 0; font-size: 0.92rem; color: #262626; line-height: 1.5; }
  .num { font-size: 0.78rem; color: #b3b3b3; font-variant-numeric: tabular-nums; flex-shrink: 0; }

  .quote { font-size: 0.95rem; color: #3d3d3d; line-height: 1.65; margin: 0 0 22px; }
  .quote:last-child { margin-bottom: 0; }
  .quote .who { display: block; margin-top: 6px; font-size: 0.78rem; color: #9a9a9a; font-style: normal; }

  .foot p { font-size: 0.88rem; color: #6B6B6B; line-height: 1.6; margin: 0 0 18px; }
  .cta { color: #171717; text-decoration: none; font-size: 0.9rem; font-weight: 600; border-bottom: 1px solid #171717; padding-bottom: 1px; }
</style>
</head>
<body>
<main>
  <p class="brand-line">${m.buyer}</p>
  <h1>${mergeField("firstName", "You&rsquo;re confirmed.", `You&rsquo;re confirmed, ${mergeSlot("firstName")}.`)}</h1>
  <p class="sub">${m.heroEyebrow}</p>
  <p class="call-line">With <strong>${mergeField("host", m.host, mergeSlot("host"))}</strong>${mergeField(
    "call_time",
    " &mdash; time confirmed by email.",
    ` on <strong>${mergeSlot("call_time")}</strong>.`
  )}</p>

  <hr class="rule" />

  <section>
    <p class="brief-text">A short briefing introduces your call with ${m.host} and what to expect &mdash; nothing you need to prepare.</p>
    <div class="video-line"><span class="dot"></span>Briefing video &mdash; ${m.heroLength}, recording in progress</div>
  </section>

  <section>
    <ol class="plain">${questionsHtml}</ol>
  </section>

  ${proofHtml}

  <div class="foot">
    <p>Need to reschedule? Use the link in your confirmation email, or just reply.</p>
    ${calendarHtml}
  </div>
</main>
${buildMergeScriptTag()}
</body>
</html>`;
}
