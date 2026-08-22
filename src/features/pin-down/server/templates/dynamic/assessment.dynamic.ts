import type { PageContentModel } from "../content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "../content-model";
import { buttonCss, cardCss, DENSITY_SPACE } from "./component-catalog";

/**
 * The Pre-Call Assessment archetype, site-matched. assessment.ts's static
 * build is the fallback whenever m.designTokens.confidence === "default";
 * this is what runs once a real crawl produced tokens. The self-check
 * (built from the buyer's own top call questions, not separate
 * boilerplate) is the signature element and stays fixed regardless of
 * skin.
 */
export function buildAssessmentDynamicHtml(m: PageContentModel): string {
  const t = m.designTokens;
  const sp = DENSITY_SPACE[t.density];

  const checklistHtml = m.questions
    .map(
      (q, i) => `
        <label class="check-row">
          <input type="checkbox" data-check="${i}" />
          <span class="box"></span>
          <span class="check-text">${q}</span>
        </label>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">Outcomes for similar profiles</p>
      <div class="proof-grid">
        ${m.testimonials
          .map(
            (te) => `
          <div class="proof-card card">
            <p>${te.quote}</p>
            <span class="who">${te.name} &middot; ${te.role}${te.company ? `, ${te.company}` : ""}</span>
          </div>`
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
  body { margin: 0; background: ${t.color.bg}; color: ${t.color.text}; font-family: ${t.fontFamily}; }
  main { max-width: 600px; margin: 0 auto; padding: 60px 24px 100px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .card { ${cardCss(t)} }
  .cta { ${buttonCss(t)} display: inline-block; margin-top: 16px; text-decoration: none; font-size: 0.84rem; }

  .brand-line { font-size: 0.72rem; font-weight: 600; color: ${t.color.textMuted}; margin: 0 0 10px; }
  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: ${t.color.accent}; margin: 0 0 12px; }
  h1 { font-size: 1.95rem; font-weight: ${t.headingWeight}; letter-spacing: -0.015em; line-height: 1.22; margin: 0 0 10px; font-family: ${t.fontFamily}; }
  .sub { color: ${t.color.textMuted}; font-size: 0.92rem; margin: 0 0 24px; max-width: 46ch; line-height: 1.6; }

  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 ${sp.section}; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: ${t.color.surface}; border: 1px solid ${t.color.border}; border-radius: ${t.radius.pill}; padding: 7px 14px; font-size: 0.8rem; color: ${t.color.text}; }
  .chip strong { color: ${t.color.accent}; }

  section { margin-bottom: ${sp.section}; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.color.textMuted}; margin: 0 0 16px; }

  .video-card { padding: 16px 18px; display: flex; align-items: center; gap: 14px; }
  .video-card .play { width: 32px; height: 32px; border-radius: 50%; background: ${t.color.accent}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid ${t.color.accentText}; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 2px; font-size: 0.85rem; font-weight: ${t.headingWeight}; color: ${t.color.text}; }
  .video-card .vsub { margin: 0; font-size: 0.76rem; color: ${t.color.textMuted}; }

  .assess-panel { padding: ${sp.card}; }
  .assess-panel .prompt { margin: 0 0 18px; font-size: 0.86rem; color: ${t.color.text}; line-height: 1.55; }
  .assess-panel .prompt strong { color: ${t.color.accent}; }

  .check-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 4px; cursor: pointer; user-select: none; border-radius: ${t.radius.sm}; transition: background 0.12s ease; }
  .check-row:hover { background: color-mix(in srgb, ${t.color.accent} 6%, transparent); }
  .check-row input { position: absolute; opacity: 0; width: 0; height: 0; }
  .box { width: 18px; height: 18px; border-radius: ${t.radius.sm}; border: 1.5px solid ${t.color.border}; flex-shrink: 0; margin-top: 1px; display: flex; align-items: center; justify-content: center; transition: background 0.12s ease, border-color 0.12s ease; }
  .box::after { content: ""; width: 9px; height: 6px; border-left: 2px solid ${t.color.accentText}; border-bottom: 2px solid ${t.color.accentText}; transform: rotate(-45deg) translateY(-1px); opacity: 0; }
  input:checked + .box { background: ${t.color.accent}; border-color: ${t.color.accent}; }
  input:checked + .box::after { opacity: 1; }
  .check-text { font-size: 0.88rem; color: ${t.color.text}; line-height: 1.5; }

  .assess-note { margin-top: 18px; padding: 14px 16px; border-radius: ${t.radius.sm}; background: color-mix(in srgb, ${t.color.accent} 10%, ${t.color.surface}); border: 1px solid color-mix(in srgb, ${t.color.accent} 30%, transparent); font-size: 0.84rem; color: ${t.color.accent}; line-height: 1.55; display: none; }
  .assess-note.is-visible { display: block; }

  ul.covered { list-style: none; margin: 0; padding: 0; }
  ul.covered li { padding: 13px 0; border-bottom: 1px solid ${t.color.border}; font-size: 0.88rem; color: ${t.color.text}; line-height: 1.5; }
  ul.covered li:last-child { border-bottom: none; }

  .proof-grid { display: grid; gap: ${sp.gap}; }
  .proof-card { padding: ${sp.card}; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: ${t.color.text}; line-height: 1.55; }
  .proof-card .who { font-size: 0.76rem; color: ${t.color.textMuted}; }

  .contact { font-size: 0.86rem; color: ${t.color.textMuted}; line-height: 1.6; border-top: 1px solid ${t.color.border}; padding-top: 22px; }
</style>
</head>
<body>
<main>
  <p class="brand-line">${m.buyer}</p>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>${mergeField("firstName", "Before your call", `Before your call, ${mergeSlot("firstName")}`)}</h1>
  <p class="sub">A ${m.heroLength} self-check so ${m.host} can spend the whole call on what actually applies to you.</p>

  <div class="chip-row">
    <span class="chip">${mergeField("call_time", "Time confirmed by email", `<strong>${mergeSlot("call_time")}</strong>`)}</span>
    <span class="chip">With <strong>${mergeField("host", m.host, mergeSlot("host"))}</strong></span>
  </div>

  <section>
    <div class="video-card card">
      <span class="play"></span>
      <div>
        <p class="vtitle">How the assessment works</p>
        <p class="vsub">${m.heroLength} &middot; recording in progress</p>
      </div>
    </div>
  </section>

  <section>
    <p class="label">Quick self-check</p>
    <div class="assess-panel card">
      <p class="prompt">Tick whatever already sounds like <strong>you</strong> &mdash; there's no scoring, this just tells us where to start.</p>
      ${checklistHtml}
      <div class="assess-note" id="assess-note">Noted &mdash; we'll make sure that's on the agenda.</div>
    </div>
  </section>

  <section>
    <p class="label">What the call will cover</p>
    <ul class="covered">
      ${m.questions.map((q) => `<li>${q}</li>`).join("")}
    </ul>
  </section>

  ${proofHtml}

  <div class="contact">
    <p>Need to reschedule? Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarHtml}
  </div>
</main>
<script>
(function () {
  var boxes = document.querySelectorAll('[data-check]');
  var note = document.getElementById('assess-note');
  if (!boxes.length || !note) return;
  function update() {
    var any = false;
    boxes.forEach(function (b) { if (b.checked) any = true; });
    note.classList.toggle('is-visible', any);
  }
  boxes.forEach(function (b) { b.addEventListener('change', update); });
})();
</script>
${buildMergeScriptTag()}
</body>
</html>`;
}
