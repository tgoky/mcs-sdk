import type { PageContentModel } from "./content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "./content-model";

/**
 * The Golden Ticket — built for a workshop or event registration where
 * the room filling up is the actual dynamic doing the work. Black and
 * gold, die-cut perforation between a main panel and a tear-off stub.
 * Signature element: the ticket itself — a real stub shape (perforated
 * edge, notch cutouts, a stub half carrying the reference code) rather
 * than a card wearing a gold accent color, since a ticket only works if
 * it actually reads as one at a glance. The stub code now sits upright —
 * a real paper ticket's stub number is small print, not sideways text
 * nobody can read without tilting their head.
 *
 * Published once per engagement as static HTML, so "Admit one" resolves
 * the actual attendee's name client-side from the booking redirect
 * (see content-model.ts) rather than showing every attendee the
 * operator's own business name.
 */
export function buildGoldenTicketHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <li><span class="fine-num">${i + 1}</span><span>${q}</span></li>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">Who else is coming</p>
      <div class="proof-row">
        ${m.testimonials
          .map(
            (t) => `
          <div class="proof-card">
            <p>&ldquo;${t.quote}&rdquo;</p>
            <span class="who">${t.name} &middot; ${t.role}${t.company ? `, ${t.company}` : ""}</span>
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
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #151014;
    color: #fcefcf;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 640px; margin: 0 auto; padding: 52px 22px 96px; }
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .eyebrow { text-align: center; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: #E8B23D; margin: 0 0 6px; }
  .brand-line { text-align: center; font-size: 0.72rem; color: #a3915f; margin: 0 0 22px; }
  h1 { text-align: center; font-size: 2.1rem; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 28px; }

  /* Ticket stub — signature element */
  .ticket { display: flex; margin: 0 0 22px; filter: drop-shadow(0 18px 40px rgba(0,0,0,0.45)); }
  .ticket-main {
    flex: 1;
    background: linear-gradient(155deg, #1d1720 0%, #171217 100%);
    border: 1px solid #4a3a1c;
    border-right: none;
    border-radius: 10px 0 0 10px;
    padding: 26px 24px;
    position: relative;
  }
  .ticket-stub {
    width: 116px;
    flex-shrink: 0;
    background: #1a1418;
    border: 1px solid #4a3a1c;
    border-left: none;
    border-radius: 0 10px 10px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    position: relative;
    padding: 16px 8px;
    text-align: center;
  }
  /* perforation: a column of small punched circles, the way a real
     die-cut stub separates — no sideways text needed to sell "ticket". */
  .perf { position: absolute; top: 10px; bottom: 10px; left: -1px; width: 1px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
  .perf span { width: 4px; height: 4px; border-radius: 50%; background: #151014; border: 1px solid #4a3a1c; }
  .notch { position: absolute; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: #151014; border: 1px solid #4a3a1c; }
  .notch.top { top: -8px; }
  .notch.bottom { bottom: -8px; }

  .ticket-main .kicker { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #E8B23D; margin: 0 0 6px; font-weight: 700; }
  .ticket-main .name { font-size: 1.2rem; font-weight: 700; margin: 0 0 4px; }
  .ticket-main .meta { font-size: 0.8rem; color: #cbb98d; margin: 0; }
  .admit { position: absolute; top: 22px; right: 24px; border: 1px solid #E8B23D; color: #E8B23D; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 9px; border-radius: 3px; transform: rotate(4deg); }

  .ticket-stub .stub-label { font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; color: #8a7a54; }
  .ticket-stub .stub-code { font-family: "Courier New", monospace; font-size: 1.05rem; font-weight: 700; color: #fcefcf; letter-spacing: 0.06em; }
  .ticket-stub .stub-when { font-size: 9.5px; color: #a3915f; line-height: 1.4; }

  section { margin-bottom: 40px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #E8B23D; margin: 0 0 16px; text-align: center; }

  /* Doors-open video — placeholder card until the operator's recording
     pass produces one; never a fabricated embed. */
  .video-card { background: #1a1418; border: 1px dashed #4a3a1c; border-radius: 8px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: 40px; }
  .video-card .play { width: 32px; height: 32px; border-radius: 50%; background: #E8B23D; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid #151014; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 2px; font-size: 0.82rem; font-weight: 700; color: #fcefcf; }
  .video-card .vsub { margin: 0; font-size: 0.72rem; color: #a3915f; }

  .fine-print { background: #1a1418; border: 1px dashed #4a3a1c; border-radius: 8px; padding: 20px 22px; }
  .fine-print p.head { margin: 0 0 12px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: #cbb98d; }
  ul.checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  ul.checklist li { display: flex; gap: 12px; align-items: flex-start; }
  .fine-num { font-size: 0.72rem; font-weight: 800; color: #E8B23D; flex-shrink: 0; min-width: 16px; }
  ul.checklist li span:last-child { font-size: 0.86rem; color: #f0e2c2; line-height: 1.5; }

  .proof-row { display: grid; gap: 14px; }
  .proof-card { background: #1a1418; border: 1px solid #322816; border-radius: 8px; padding: 18px 20px; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: #f0e2c2; line-height: 1.55; }
  .proof-card .who { font-size: 0.74rem; color: #a3915f; }

  .foot { text-align: center; }
  .foot p { font-size: 0.84rem; color: #cbb98d; line-height: 1.6; margin: 0 0 18px; }
  .cta { display: inline-block; padding: 13px 28px; background: #E8B23D; color: #151014; border-radius: 999px; text-decoration: none; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.02em; }
  .cta-static { display: inline-block; font-size: 0.78rem; color: #8a7a54; font-style: italic; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <p class="brand-line">Hosted by ${m.buyer}</p>
  <h1>${mergeField("firstName", "You&rsquo;re in", `You&rsquo;re in, ${mergeSlot("firstName")}`)}</h1>

  <div class="ticket">
    <div class="ticket-main">
      <span class="admit">Admit&nbsp;one</span>
      <p class="kicker">Confirmed seat</p>
      <p class="name">${mergeField("firstName", "Guest", mergeSlot("fullName"))}</p>
      <p class="meta">With ${m.host} &middot; ${m.heroLength} briefing before you arrive</p>
    </div>
    <div class="ticket-stub">
      <span class="perf"><span></span><span></span><span></span><span></span><span></span></span>
      <span class="notch top"></span>
      <span class="notch bottom"></span>
      <span class="stub-label">No.</span>
      <span class="stub-code">${m.reference}</span>
      <span class="stub-when">${mergeField("call_time", "Time on file", mergeSlot("call_time"))}</span>
    </div>
  </div>

  <div class="video-card">
    <span class="play"></span>
    <div>
      <p class="vtitle">What to expect when you arrive</p>
      <p class="vsub">${m.heroLength} &middot; recording in progress</p>
    </div>
  </div>

  <section>
    <p class="label">Before you arrive</p>
    <div class="fine-print">
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
