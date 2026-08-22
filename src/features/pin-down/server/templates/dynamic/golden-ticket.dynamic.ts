import type { PageContentModel } from "../content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "../content-model";
import { buttonCss, cardCss, DENSITY_SPACE } from "./component-catalog";

/**
 * The Golden Ticket archetype, site-matched. goldenticket.ts's static
 * build is the fallback whenever m.designTokens.confidence === "default";
 * this is what runs once a real crawl produced tokens. The stub shape
 * (perforation, notch cutouts, upright stub number) is the signature
 * element and stays fixed regardless of skin — only the card treatment,
 * button, palette, type and density flex to the buyer's own site.
 */
export function buildGoldenTicketDynamicHtml(m: PageContentModel): string {
  const t = m.designTokens;
  const sp = DENSITY_SPACE[t.density];

  const questionsHtml = m.questions
    .map((q, i) => `<li><span class="fine-num">${i + 1}</span><span>${q}</span></li>`)
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">Who else is coming</p>
      <div class="proof-row">
        ${m.testimonials
          .map(
            (te) => `
          <div class="proof-card card">
            <p>&ldquo;${te.quote}&rdquo;</p>
            <span class="who">${te.name} &middot; ${te.role}${te.company ? `, ${te.company}` : ""}</span>
          </div>`
          )
          .join("")}
      </div>
    </section>`
    : "";

  const calendarHtml = m.calendarAddToUrl
    ? `<a class="cta" href="${m.calendarAddToUrl}">Add to calendar</a>`
    : `<span class="cta-static">Watch for the calendar link in your inbox</span>`;

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
  main { max-width: 640px; margin: 0 auto; padding: 52px 22px 96px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .card { ${cardCss(t)} }
  .cta { ${buttonCss(t)} display: inline-block; text-decoration: none; font-size: 0.82rem; letter-spacing: 0.02em; }

  .eyebrow { text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: ${t.color.accent}; margin: 0 0 6px; }
  .brand-line { text-align: center; font-size: 0.72rem; color: ${t.color.textMuted}; margin: 0 0 22px; }
  h1 { text-align: center; font-size: 2.05rem; font-weight: ${t.headingWeight}; letter-spacing: -0.02em; margin: 0 0 ${sp.section}; font-family: ${t.fontFamily}; }

  .ticket { display: flex; margin: 0 0 22px; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.25)); }
  .ticket-main { flex: 1; background: ${t.color.surface}; border: 1px solid ${t.color.border}; border-right: none; border-radius: ${t.radius.md} 0 0 ${t.radius.md}; padding: ${sp.card}; position: relative; }
  .ticket-stub { width: 116px; flex-shrink: 0; background: ${t.color.surface}; border: 1px solid ${t.color.border}; border-left: none; border-radius: 0 ${t.radius.md} ${t.radius.md} 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; position: relative; padding: 16px 8px; text-align: center; }

  .perf { position: absolute; top: 10px; bottom: 10px; left: -1px; width: 1px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
  .perf span { width: 4px; height: 4px; border-radius: 50%; background: ${t.color.bg}; border: 1px solid ${t.color.border}; }
  .notch { position: absolute; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: ${t.color.bg}; border: 1px solid ${t.color.border}; }
  .notch.top { top: -8px; }
  .notch.bottom { bottom: -8px; }

  .ticket-main .kicker { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: ${t.color.accent}; margin: 0 0 6px; font-weight: 700; }
  .ticket-main .name { font-size: 1.15rem; font-weight: ${t.headingWeight}; margin: 0 0 4px; }
  .ticket-main .meta { font-size: 0.8rem; color: ${t.color.textMuted}; margin: 0; }
  .admit { position: absolute; top: 22px; right: 24px; border: 1px solid ${t.color.accent}; color: ${t.color.accent}; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 9px; border-radius: ${t.radius.sm}; }

  .ticket-stub .stub-label { font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; color: ${t.color.textMuted}; }
  .ticket-stub .stub-code { font-family: "Courier New", monospace; font-size: 1.05rem; font-weight: 700; color: ${t.color.text}; letter-spacing: 0.06em; }
  .ticket-stub .stub-when { font-size: 9.5px; color: ${t.color.textMuted}; line-height: 1.4; }

  section { margin-bottom: ${sp.section}; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: ${t.color.accent}; margin: 0 0 16px; text-align: center; }

  .video-card { padding: 16px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: ${sp.section}; }
  .video-card .play { width: 32px; height: 32px; border-radius: 50%; background: ${t.color.accent}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid ${t.color.accentText}; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 2px; font-size: 0.82rem; font-weight: 700; color: ${t.color.text}; }
  .video-card .vsub { margin: 0; font-size: 0.72rem; color: ${t.color.textMuted}; }

  .fine-print { padding: ${sp.card}; }
  .fine-print p.head { margin: 0 0 12px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: ${t.color.textMuted}; }
  ul.checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: ${sp.gap}; }
  ul.checklist li { display: flex; gap: 12px; align-items: flex-start; }
  .fine-num { font-size: 0.72rem; font-weight: 800; color: ${t.color.accent}; flex-shrink: 0; min-width: 16px; }
  ul.checklist li span:last-child { font-size: 0.86rem; color: ${t.color.text}; line-height: 1.5; }

  .proof-row { display: grid; gap: ${sp.gap}; }
  .proof-card { padding: ${sp.card}; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: ${t.color.text}; line-height: 1.55; }
  .proof-card .who { font-size: 0.74rem; color: ${t.color.textMuted}; }

  .foot { text-align: center; }
  .foot p { font-size: 0.84rem; color: ${t.color.textMuted}; line-height: 1.6; margin: 0 0 18px; }
  .cta-static { display: inline-block; font-size: 0.78rem; color: ${t.color.textMuted}; font-style: italic; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <p class="brand-line">Hosted by ${m.buyer}</p>
  <h1>${mergeField("firstName", "You&rsquo;re in", `You&rsquo;re in, ${mergeSlot("firstName")}`)}</h1>

  <div class="ticket">
    <div class="ticket-main card">
      <span class="admit">Admit&nbsp;one</span>
      <p class="kicker">Confirmed seat</p>
      <p class="name">${mergeField("firstName", "Guest", mergeSlot("fullName"))}</p>
      <p class="meta">With ${m.host} &middot; ${m.heroLength} briefing before you arrive</p>
    </div>
    <div class="ticket-stub card">
      <span class="perf"><span></span><span></span><span></span><span></span><span></span></span>
      <span class="notch top"></span>
      <span class="notch bottom"></span>
      <span class="stub-label">No.</span>
      <span class="stub-code">${m.reference}</span>
      <span class="stub-when">${mergeField("call_time", "Time on file", mergeSlot("call_time"))}</span>
    </div>
  </div>

  <div class="video-card card">
    <span class="play"></span>
    <div>
      <p class="vtitle">What to expect when you arrive</p>
      <p class="vsub">${m.heroLength} &middot; recording in progress</p>
    </div>
  </div>

  <section>
    <p class="label">Before you arrive</p>
    <div class="fine-print card">
      <p class="head">Know this going in</p>
      <ul class="checklist">${questionsHtml}</ul>
    </div>
  </section>

  ${proofHtml}

  <div class="foot">
    <p>Need to change your slot? Use the link in your confirmation email, or reply directly and we'll move your seat.</p>
    ${calendarHtml}
  </div>
</main>
${buildMergeScriptTag()}
</body>
</html>`;
}
