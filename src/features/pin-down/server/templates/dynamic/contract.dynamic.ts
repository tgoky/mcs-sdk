import type { PageContentModel } from "../content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "../content-model";
import { buttonCss, cardCss, DENSITY_SPACE } from "./component-catalog";

const CLAUSE_NUMERALS = ["I", "II", "III", "IV"];

/**
 * The Contract archetype, site-matched. contract.ts's static build is the
 * fallback whenever m.designTokens.confidence === "default"; this is what
 * runs once a real crawl produced tokens. The ceremonial structure
 * (seal row, masthead, numbered clauses, attestations, signature line)
 * is identical either way — this only changes what "ceremonial" is built
 * out of: a legal-document register still reads as itself in a warm
 * serif with a soft-shadow card as easily as in dark ink with a
 * hard-bordered one, as long as the clause anatomy stays intact.
 */
export function buildContractDynamicHtml(m: PageContentModel): string {
  const t = m.designTokens;
  const sp = DENSITY_SPACE[t.density];
  const serifHeading = t.typePairing === "editorial-serif";
  const headingFont = serifHeading ? t.fontFamily : `${t.fontFamily}`;

  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <li>
          <span class="clause-mark">${i + 1}</span>
          <p>${q}</p>
        </li>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section class="clause">
      <div class="clause-head">
        <span class="clause-num">${CLAUSE_NUMERALS[2] ?? "III"}</span>
        <p class="clause-title">Attestations on record</p>
      </div>
      <div class="attestations">
        ${m.testimonials
          .map(
            (te) => `
          <figure class="card">
            <span class="mark">&ldquo;</span>
            <blockquote>${te.quote}</blockquote>
            <figcaption>${te.name}<span>${te.role}${te.company ? `, ${te.company}` : ""}</span></figcaption>
          </figure>`
          )
          .join("")}
      </div>
    </section>`
    : "";

  const calendarHtml = m.calendarAddToUrl
    ? `<a class="cta" href="${m.calendarAddToUrl}">Add to calendar</a>`
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
  main { max-width: 640px; margin: 0 auto; padding: 64px 28px 100px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .card { ${cardCss(t)} }
  .cta { ${buttonCss(t)} display: inline-block; text-decoration: none; font-size: 0.78rem; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; }

  .seal-row { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 30px; }
  .seal-row .line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, ${t.color.accent}, transparent); }
  .seal { width: 40px; height: 40px; border-radius: 50%; border: 1px solid ${t.color.accent}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .masthead { text-align: center; margin-bottom: 6px; }
  .masthead .kind { font-family: ${headingFont}; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: ${t.color.accent}; margin: 0 0 6px; }
  .masthead .ref { font-size: 0.72rem; color: ${t.color.textMuted}; letter-spacing: 0.06em; margin: 0; }
  .on-behalf { text-align: center; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.color.textMuted}; margin: 18px 0 0; }

  h1 { text-align: center; font-family: ${headingFont}; font-weight: ${t.headingWeight}; font-size: 2.1rem; letter-spacing: -0.005em; line-height: 1.22; margin: 10px 0 8px; }
  .prepared { text-align: center; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: ${t.color.textMuted}; margin: 0 0 6px; }
  .sub { text-align: center; color: ${t.color.textMuted}; font-size: 0.92rem; margin: 0 auto ${sp.section}; max-width: 42ch; line-height: 1.55; }

  .particulars { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 ${sp.section}; }
  .particulars .tag { border: 1px solid ${t.color.border}; border-radius: ${t.radius.sm}; padding: 7px 12px; font-size: 0.74rem; color: ${t.color.text}; }
  .particulars .tag strong { color: ${t.color.accent}; font-weight: 700; }

  .clause { margin-bottom: ${sp.section}; }
  .clause-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid ${t.color.border}; padding-bottom: 12px; margin-bottom: 20px; }
  .clause-head .clause-num { font-family: ${headingFont}; font-size: 1rem; color: ${t.color.accent}; flex-shrink: 0; }
  .clause-head .clause-title { margin: 0; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.color.text}; }

  .brief-panel { padding: ${sp.card}; }
  .brief-panel p { margin: 0; font-size: 0.9rem; line-height: 1.65; color: ${t.color.text}; }
  .brief-panel .runtime { display: block; margin-top: 16px; font-family: ${headingFont}; font-style: ${serifHeading ? "italic" : "normal"}; font-size: 0.78rem; color: ${t.color.textMuted}; }

  .video-card { margin-top: 18px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
  .video-card .play { width: 34px; height: 34px; border-radius: 50%; background: ${t.color.accent}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid ${t.color.accentText}; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 3px; font-size: 0.82rem; color: ${t.color.text}; font-weight: ${t.headingWeight}; }
  .video-card .vsub { margin: 0; font-size: 0.72rem; color: ${t.color.textMuted}; }

  ul.clauses { list-style: none; margin: 0; padding: 0; }
  ul.clauses li { display: flex; gap: ${sp.gap}; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid ${t.color.border}; }
  ul.clauses li:last-child { border-bottom: none; }
  .clause-mark { font-family: ${headingFont}; font-size: 0.85rem; color: ${t.color.accent}; flex-shrink: 0; min-width: 16px; padding-top: 1px; }
  ul.clauses li p { margin: 0; font-size: 0.9rem; color: ${t.color.text}; line-height: 1.55; }

  .attestations { display: grid; gap: ${sp.gap}; }
  figure { margin: 0; padding: ${sp.card}; position: relative; }
  figure .mark { position: absolute; top: 12px; right: 18px; font-family: ${headingFont}; font-size: 2.2rem; color: ${t.color.border}; line-height: 1; user-select: none; }
  blockquote { margin: 0 0 12px; font-family: ${headingFont}; font-style: ${serifHeading ? "italic" : "normal"}; font-size: 1rem; color: ${t.color.text}; line-height: 1.55; }
  figcaption { font-size: 0.76rem; color: ${t.color.textMuted}; letter-spacing: 0.02em; }
  figcaption span { display: block; color: ${t.color.textMuted}; margin-top: 2px; }

  .signature { margin-top: 56px; padding-top: 24px; border-top: 1px solid ${t.color.border}; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; }
  .signature .terms { font-size: 0.84rem; color: ${t.color.textMuted}; line-height: 1.6; max-width: 34ch; }
  .signature .terms strong { color: ${t.color.text}; font-weight: 700; }
</style>
</head>
<body>
<main>
  <div class="seal-row">
    <span class="line"></span>
    <div class="seal">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${t.color.accent}" stroke-width="1"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M4.5 8h7" stroke-width="0.75"/></svg>
    </div>
    <span class="line"></span>
  </div>

  <div class="masthead">
    <p class="kind">Agreement of Engagement</p>
    <p class="ref">Reference ${m.reference} &middot; on file</p>
  </div>
  <p class="on-behalf">On behalf of ${m.buyer}</p>

  <p class="prepared">Prepared for</p>
  <h1>${mergeField("firstName", "You", mergeSlot("firstName"))}</h1>
  <p class="sub">${m.heroEyebrow}</p>

  <div class="particulars">
    <span class="tag">${mergeField("call_time", "Scheduled &mdash; time on file", `Scheduled for <strong>${mergeSlot("call_time")}</strong>`)}</span>
    <span class="tag">Meeting with <strong>${mergeField("host", m.host, mergeSlot("host"))}</strong></span>
  </div>

  <section class="clause">
    <div class="clause-head">
      <span class="clause-num">${CLAUSE_NUMERALS[0]}</span>
      <p class="clause-title">The briefing</p>
    </div>
    <div class="brief-panel card">
      <p>A short recorded briefing precedes your call with ${m.host}, setting the terms of what will be covered so nothing arrives unannounced.</p>
      <span class="runtime">Duration of record &mdash; ${m.heroLength}</span>
    </div>
    <div class="video-card card">
      <span class="play"></span>
      <div>
        <p class="vtitle">Briefing video</p>
        <p class="vsub">${m.heroLength} &middot; recording in progress</p>
      </div>
    </div>
  </section>

  <section class="clause">
    <div class="clause-head">
      <span class="clause-num">${CLAUSE_NUMERALS[1]}</span>
      <p class="clause-title">Matters to be addressed</p>
    </div>
    <ul class="clauses">${questionsHtml}</ul>
  </section>

  ${proofHtml}

  <div class="signature">
    <p class="terms"><strong>Need to amend the time?</strong> Use the link in your confirmation email, or reply directly and it will be arranged.</p>
    ${calendarHtml}
  </div>
</main>
${buildMergeScriptTag()}
</body>
</html>`;
}
