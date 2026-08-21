import type { PageContentModel } from "./content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "./content-model";

const CLAUSE_NUMERALS = ["I", "II", "III", "IV"];

/**
 * The Contract — ceremonial and precise, built for a buyer whose own
 * credibility runs on gravitas. Deep ink ground, warm gold-foil rule, a
 * parchment panel for the briefing. Signature element: the page is laid
 * out as the front matter of an actual agreement — "Prepared for", a
 * filed reference number, and the briefing/questions/proof sections each
 * numbered as a clause (I, II, III, IV) with a closing signature line — so
 * the call reads as a commitment already made, not an invitation still
 * being pitched.
 *
 * This page is built once per engagement and published as static HTML —
 * every prospect who books lands on the same file. "Prepared for" and the
 * particulars strip below therefore resolve client-side from the booking
 * platform's own redirect params (see content-model.ts's buildMergeScriptTag)
 * rather than being baked in at build time, since the buyer's name isn't
 * known until a real prospect's browser loads the page.
 */
export function buildContractHtml(m: PageContentModel): string {
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
            (t) => `
          <figure>
            <span class="mark">&ldquo;</span>
            <blockquote>${t.quote}</blockquote>
            <figcaption>${t.name}<span>${t.role}${t.company ? `, ${t.company}` : ""}</span></figcaption>
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
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #141119;
    color: #efe9dd;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 640px; margin: 0 auto; padding: 64px 28px 100px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .seal-row { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 30px; }
  .seal-row .line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, #C6A15B, transparent); }
  .seal { width: 40px; height: 40px; border-radius: 50%; border: 1px solid #C6A15B; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .seal svg { opacity: 0.9; }

  .masthead { text-align: center; margin-bottom: 6px; }
  .masthead .kind { font-family: Georgia, "Times New Roman", serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #C6A15B; margin: 0 0 6px; }
  .masthead .ref { font-size: 0.72rem; color: #8f8878; letter-spacing: 0.06em; margin: 0; }
  .on-behalf { text-align: center; font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: #756a54; margin: 18px 0 0; }

  h1 { text-align: center; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 2.15rem; letter-spacing: -0.005em; line-height: 1.22; margin: 10px 0 8px; }
  .prepared { text-align: center; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: #a89a78; margin: 0 0 6px; }
  .sub { text-align: center; color: #b9b2a4; font-size: 0.92rem; margin: 0 auto 32px; max-width: 42ch; line-height: 1.55; }

  /* Particulars strip — replaces the old plain sub-only opener with the
     agreement's actual terms: when, with whom, filed under what number.
     Bordered rectangular tags rather than rounded chips, to keep the
     document register instead of a startup-SaaS one. */
  .particulars { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 0 0 52px; }
  .particulars .tag { border: 1px solid #3a3444; border-radius: 3px; padding: 7px 12px; font-size: 0.74rem; color: #cfc6b3; letter-spacing: 0.01em; }
  .particulars .tag strong { color: #efe9dd; font-weight: 600; }

  .clause { margin-bottom: 46px; }
  .clause-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #3a3444; padding-bottom: 12px; margin-bottom: 20px; }
  .clause-head .clause-num { font-family: Georgia, serif; font-size: 1rem; color: #C6A15B; flex-shrink: 0; }
  .clause-head .clause-title { margin: 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #cfc6b3; }

  .brief-panel { background: #F4EFE4; color: #221e29; border-radius: 2px; padding: 26px 28px; position: relative; }
  .brief-panel::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #C6A15B, #e8d3a0, #C6A15B); }
  .brief-panel p { margin: 0; font-size: 0.9rem; line-height: 1.65; color: #2b2634; }
  .brief-panel .runtime { display: block; margin-top: 16px; font-family: Georgia, serif; font-style: italic; font-size: 0.78rem; color: #6b6152; }

  /* Briefing video — placeholder until the operator's script pass
     produces a real recording; never a fabricated embed. */
  .video-card { margin-top: 18px; background: #1c1824; border: 1px solid #3a3444; border-radius: 3px; padding: 18px 20px; display: flex; align-items: center; gap: 14px; }
  .video-card .play { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #C6A15B; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid #C6A15B; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 3px; font-size: 0.82rem; color: #efe9dd; font-weight: 600; }
  .video-card .vsub { margin: 0; font-size: 0.72rem; color: #8f8878; }

  ul.clauses { list-style: none; margin: 0; padding: 0; }
  ul.clauses li { display: flex; gap: 18px; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid #2c2734; }
  ul.clauses li:last-child { border-bottom: none; }
  .clause-mark { font-family: Georgia, serif; font-size: 0.85rem; color: #C6A15B; flex-shrink: 0; min-width: 16px; padding-top: 1px; }
  ul.clauses li p { margin: 0; font-size: 0.9rem; color: #ded6c5; line-height: 1.55; }

  /* Attestations — a bordered card with a quotation glyph up top, no
     vertical rule down the side. */
  .attestations { display: grid; gap: 16px; }
  figure { margin: 0; background: #1c1824; border: 1px solid #3a3444; border-radius: 4px; padding: 22px 24px; position: relative; }
  figure .mark { position: absolute; top: 12px; right: 18px; font-family: Georgia, serif; font-size: 2.2rem; color: #3a3444; line-height: 1; user-select: none; }
  blockquote { margin: 0 0 12px; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 1rem; color: #efe9dd; line-height: 1.55; position: relative; }
  figcaption { font-size: 0.76rem; color: #a89a78; letter-spacing: 0.02em; }
  figcaption span { display: block; color: #756a54; margin-top: 2px; }

  .signature { margin-top: 56px; padding-top: 24px; border-top: 1px solid #3a3444; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; }
  .signature .terms { font-size: 0.84rem; color: #b9b2a4; line-height: 1.6; max-width: 34ch; }
  .signature .terms strong { color: #efe9dd; font-weight: 600; }
  .cta { display: inline-block; padding: 12px 26px; background: transparent; border: 1px solid #C6A15B; color: #C6A15B; border-radius: 2px; text-decoration: none; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
</style>
</head>
<body>
<main>
  <div class="seal-row">
    <span class="line"></span>
    <div class="seal">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#C6A15B" stroke-width="1"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M4.5 8h7" stroke-width="0.75"/></svg>
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
    <span class="tag">${mergeField(
      "call_time",
      "Scheduled &mdash; time on file",
      `Scheduled for <strong>${mergeSlot("call_time")}</strong>`
    )}</span>
    <span class="tag">Meeting with <strong>${mergeField("host", m.host, mergeSlot("host"))}</strong></span>
  </div>

  <section class="clause">
    <div class="clause-head">
      <span class="clause-num">${CLAUSE_NUMERALS[0]}</span>
      <p class="clause-title">The briefing</p>
    </div>
    <div class="brief-panel">
      <p>A short recorded briefing precedes your call with ${m.host}, setting the terms of what will be covered so nothing arrives unannounced.</p>
      <span class="runtime">Duration of record &mdash; ${m.heroLength}</span>
    </div>
    <div class="video-card">
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
