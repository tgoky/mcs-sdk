import type { PageContentModel } from "../content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "../content-model";
import { buttonCss, cardCss, DENSITY_SPACE } from "./component-catalog";

/**
 * The Tentative Hold archetype, re-expressed as a spec + renderer instead
 * of a monolithic HTML string. tentativehold.ts's static build is what
 * this falls back to whenever m.designTokens.confidence === "default" —
 * this file is what runs once a real site crawl produced tokens.
 * Everything that makes "tentative hold" the thing it is — the
 * pending/confirmed status card, the one-tap acknowledgment, the
 * call-time chip, the briefing placeholder, the Q&A, the proof wall, the
 * merge-driven greeting — is IDENTICAL in structure and behavior to the
 * static version. Only the skin (button shape, card treatment, palette,
 * type, density) comes from m.designTokens instead of being hardcoded
 * slate-blue.
 */
export function buildTentativeHoldDynamicHtml(m: PageContentModel): string {
  const t = m.designTokens;
  const sp = DENSITY_SPACE[t.density];

  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <div class="qrow">
          <span class="qnum">${i + 1}</span>
          <p>${q}</p>
        </div>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">Teams who confirmed and showed up</p>
      <div class="proof-grid">
        ${m.testimonials
          .map(
            (te) => `
          <div class="proof-card card">
            <p>${te.quote}</p>
            <span class="who">${te.name}, ${te.role}${te.company ? ` &mdash; ${te.company}` : ""}</span>
          </div>`
          )
          .join("")}
      </div>
    </section>`
    : "";

  const calendarHtml = m.calendarAddToUrl
    ? `<a class="cal-link" href="${m.calendarAddToUrl}">Add to calendar</a>`
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
  body {
    margin: 0;
    background: ${t.color.bg};
    color: ${t.color.text};
    font-family: ${t.fontFamily};
  }
  main { max-width: 600px; margin: 0 auto; padding: 56px 24px 96px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .card { ${cardCss(t)} }
  .cta { ${buttonCss(t)} display: inline-block; text-decoration: none; font-size: 0.86rem; letter-spacing: 0.01em; cursor: pointer; border: 0; appearance: none; }
  .cta.solid-outline-fallback {}

  .brand-line { text-align: center; font-size: 0.72rem; font-weight: 600; color: ${t.color.textMuted}; margin: 0 0 8px; }
  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: ${t.color.accent}; margin: 0 0 12px; text-align: center; }
  h1 { text-align: center; font-size: 1.9rem; font-weight: ${t.headingWeight}; letter-spacing: -0.01em; line-height: 1.2; margin: 0 0 8px; }

  .chip-row { display: flex; justify-content: center; margin: 0 0 ${sp.section}; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: ${t.color.surface}; border: 1px solid ${t.color.border}; border-radius: ${t.radius.pill}; padding: 7px 14px; font-size: 0.8rem; color: ${t.color.text}; }
  .chip strong { color: ${t.color.accent}; }

  .hold-card { padding: ${sp.card}; margin-bottom: ${sp.section}; transition: border-color 0.25s ease, background 0.25s ease; }
  .hold-card.is-confirmed { border-color: ${t.color.accent} !important; }

  .status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .status-dot { width: 9px; height: 9px; border-radius: 50%; background: ${t.color.textMuted}; flex-shrink: 0; }
  .hold-card.is-confirmed .status-dot { background: ${t.color.accent}; }
  .status-text { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${t.color.textMuted}; }
  .hold-card.is-confirmed .status-text { color: ${t.color.accent}; }

  .hold-card .headline { margin: 0 0 6px; font-size: 1.05rem; font-weight: ${t.headingWeight}; }
  .hold-card .sub { margin: 0 0 20px; font-size: 0.86rem; color: ${t.color.textMuted}; line-height: 1.55; }
  .hold-card.is-confirmed .sub { display: none; }
  .hold-card .confirmed-sub { display: none; margin: 0 0 20px; font-size: 0.86rem; color: ${t.color.text}; line-height: 1.55; }
  .hold-card.is-confirmed .confirmed-sub { display: block; }
  .hold-card.is-confirmed .confirm-btn { display: none; }
  .confirmed-badge { display: none; align-items: center; gap: 8px; font-size: 0.86rem; font-weight: 700; color: ${t.color.accent}; }
  .hold-card.is-confirmed .confirmed-badge { display: inline-flex; }

  section { margin-bottom: ${sp.section}; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${t.color.textMuted}; margin: 0 0 16px; }

  .video-card { padding: 16px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: ${sp.section}; }
  .video-card .play { width: 32px; height: 32px; border-radius: 50%; background: ${t.color.accent}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid ${t.color.accentText}; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 2px; font-size: 0.85rem; font-weight: ${t.headingWeight}; color: ${t.color.text}; }
  .video-card .vsub { margin: 0; font-size: 0.76rem; color: ${t.color.textMuted}; }

  .qrow { display: flex; gap: ${sp.gap}; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid ${t.color.border}; }
  .qrow:first-child { border-top: 1px solid ${t.color.border}; }
  .qnum { font-size: 0.76rem; font-weight: 800; color: ${t.color.accent}; flex-shrink: 0; min-width: 16px; margin-top: 1px; }
  .qrow p { margin: 0; font-size: 0.88rem; color: ${t.color.text}; line-height: 1.5; }

  .proof-grid { display: grid; gap: ${sp.gap}; }
  .proof-card { padding: ${sp.card}; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: ${t.color.text}; line-height: 1.55; }
  .proof-card .who { font-size: 0.76rem; color: ${t.color.textMuted}; }

  .foot { text-align: center; font-size: 0.86rem; color: ${t.color.textMuted}; line-height: 1.6; }
  .cal-link { display: inline-block; margin-top: 16px; color: ${t.color.accent}; font-weight: 700; text-decoration: none; font-size: 0.84rem; }
</style>
</head>
<body>
<main>
  <p class="brand-line">${m.buyer}</p>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>${mergeField("firstName", "Your slot is on hold", `${mergeSlot("firstName")}, your slot is on hold`)}</h1>

  <div class="chip-row">
    <span class="chip">${mergeField("call_time", "Time confirmed by email", `<strong>${mergeSlot("call_time")}</strong>`)}</span>
  </div>

  <div class="hold-card card" id="hold-card">
    <div class="status-row">
      <span class="status-dot"></span>
      <span class="status-text" id="status-text">Tentative &mdash; not yet confirmed</span>
    </div>
    <p class="headline">One tap keeps this slot yours</p>
    <p class="sub">This time is held for ${m.heroLength}, but a hold isn't a commitment yet. Let us know you'll be there and we'll lock it in.</p>
    <p class="confirmed-sub">Locked in. ${mergeField("host", m.host, mergeSlot("host"))} is preparing for your call &mdash; we'll see you then.</p>
    <button class="confirm-btn cta" id="confirm-btn" type="button">Yes, I'll be there</button>
    <span class="confirmed-badge" id="confirmed-badge">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="${t.color.accent}"/><path d="M5 8.2l2 2 4-4.4" stroke="${t.color.accentText}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Confirmed
    </span>
  </div>

  <div class="video-card card">
    <span class="play"></span>
    <div>
      <p class="vtitle">What to expect on the call</p>
      <p class="vsub">${m.heroLength} &middot; recording in progress</p>
    </div>
  </div>

  <section>
    <p class="label">Before your call</p>
    <div>${questionsHtml}</div>
  </section>

  ${proofHtml}

  <div class="foot">
    <p>Need to reschedule instead? Use the link in your confirmation email, or reply directly.</p>
    ${calendarHtml}
  </div>
</main>
<script>
(function () {
  var card = document.getElementById("hold-card");
  var btn = document.getElementById("confirm-btn");
  var status = document.getElementById("status-text");
  if (!card || !btn || !status) return;
  btn.addEventListener("click", function () {
    card.classList.add("is-confirmed");
    status.textContent = "Confirmed";
  });
})();
</script>
${buildMergeScriptTag()}
</body>
</html>`;
}
