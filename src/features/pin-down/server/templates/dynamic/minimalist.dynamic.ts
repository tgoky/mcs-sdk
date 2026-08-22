import type { PageContentModel } from "../content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "../content-model";
import { buttonCss } from "./component-catalog";

/**
 * The Minimalist Trust archetype, site-matched. minimalist.ts's static
 * build is the fallback whenever m.designTokens.confidence === "default";
 * this is what runs once a real crawl produced tokens. Deliberately
 * spends the least of its skin budget on cardVariant/density of the 5
 * dynamic archetypes — no boxed panels exist here to skin in the first
 * place, per this archetype's own "less is the default" brief — but
 * still adopts the buyer's real palette, type, button shape and radius,
 * which is the part that actually matters for "does this look like it's
 * hosted on my own site."
 */
export function buildMinimalistDynamicHtml(m: PageContentModel): string {
  const t = m.designTokens;

  const questionsHtml = m.questions.map((q, i) => `<li><span class="num">${i + 1}</span>${q}</li>`).join("");

  const proofHtml = m.showProof
    ? `
    <section>
      ${m.testimonials
        .map(
          (te) => `
        <p class="quote">&ldquo;${te.quote}&rdquo; <span class="who">&mdash; ${te.name}, ${te.role}${te.company ? `, ${te.company}` : ""}</span></p>`
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
  :root { color-scheme: ${t.mode}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: ${t.color.bg}; color: ${t.color.text}; font-family: ${t.fontFamily}; -webkit-font-smoothing: antialiased; }
  main { max-width: 520px; margin: 0 auto; padding: 88px 24px 120px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .cta { ${buttonCss(t)} display: inline-block; text-decoration: none; font-size: 0.86rem; }

  .brand-line { font-size: 0.78rem; color: ${t.color.textMuted}; margin: 0 0 22px; }
  h1 { font-size: 1.75rem; font-weight: ${t.headingWeight}; letter-spacing: -0.02em; line-height: 1.25; margin: 0 0 14px; font-family: ${t.fontFamily}; }
  .sub { font-size: 0.95rem; color: ${t.color.textMuted}; margin: 0 0 12px; line-height: 1.6; max-width: 42ch; }
  .call-line { font-size: 0.86rem; color: ${t.color.textMuted}; margin: 0 0 40px; }
  .call-line strong { color: ${t.color.text}; font-weight: 700; }

  .rule { border: none; border-top: 1px solid ${t.color.border}; margin: 0 0 40px; }

  section { margin-bottom: 48px; }
  .brief-text { font-size: 0.92rem; color: ${t.color.text}; line-height: 1.75; margin: 0; }

  .video-line { display: flex; align-items: center; gap: 10px; margin-top: 18px; font-size: 0.82rem; color: ${t.color.textMuted}; }
  .video-line .dot { width: 6px; height: 6px; border-radius: 50%; background: ${t.color.accent}; flex-shrink: 0; }

  ol.plain { list-style: none; margin: 0; padding: 0; }
  ol.plain li { display: flex; gap: 12px; align-items: baseline; padding: 11px 0; font-size: 0.92rem; color: ${t.color.text}; line-height: 1.5; }
  .num { font-size: 0.78rem; color: ${t.color.textMuted}; font-variant-numeric: tabular-nums; flex-shrink: 0; }

  .quote { font-size: 0.95rem; color: ${t.color.text}; line-height: 1.65; margin: 0 0 22px; }
  .quote:last-child { margin-bottom: 0; }
  .quote .who { display: block; margin-top: 6px; font-size: 0.78rem; color: ${t.color.textMuted}; }

  .foot p { font-size: 0.88rem; color: ${t.color.textMuted}; line-height: 1.6; margin: 0 0 18px; }
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
