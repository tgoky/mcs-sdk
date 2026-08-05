import type { PageContentModel } from "./content-model";

/**
 * Signal — dark, confident, built for momentum. For high-ticket or
 * urgency-framed offers where the call itself is the scarce resource.
 * Signature element: the three-stage progress rail under the header,
 * standing in for "you are here" in the run-up to the call — the one
 * piece of real sequence information on this page, which is why it's
 * the one place a numbered/staged device shows up.
 */
export function buildSignalHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <div class="qcard">
          <span class="qnum">0${i + 1}</span>
          <p>${q}</p>
        </div>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section class="proof">
      <p class="label">What others say</p>
      <div class="proof-grid">
        ${m.testimonials
          .map(
            (t) => `
          <blockquote>
            <span class="mark">&ldquo;</span>
            <p>${t.quote}</p>
            <cite>${t.name} <span>${t.role}${t.company ? ` — ${t.company}` : ""}</span></cite>
          </blockquote>`
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
    background: #0a0a0b;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 660px; margin: 0 auto; padding: 56px 24px 90px; }

  /* Progress rail — signature element */
  .rail { display: flex; align-items: center; gap: 0; margin-bottom: 40px; }
  .rail .stage { display: flex; align-items: center; gap: 8px; flex: 1; }
  .rail .dot { width: 8px; height: 8px; border-radius: 50%; background: #f5a623; flex-shrink: 0; }
  .rail .stage.pending .dot { background: #3f3f46; }
  .rail .stage span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #a1a1aa; font-weight: 600; white-space: nowrap; }
  .rail .stage.pending span { color: #52525b; }
  .rail .line { height: 1px; background: #27272a; flex: 1; margin: 0 10px; }

  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #f5a623; margin: 0 0 12px; }
  h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin: 0 0 10px; }
  .sub { color: #a1a1aa; font-size: 0.95rem; margin: 0 0 40px; max-width: 46ch; }

  section { margin-bottom: 44px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #71717a; margin: 0 0 16px; }

  .hero-panel { border: 1px solid #27272a; border-radius: 4px; padding: 28px; background: linear-gradient(180deg, #17171a 0%, #0f0f11 100%); }
  .hero-panel .play { width: 34px; height: 34px; border-radius: 50%; background: #f5a623; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
  .hero-panel .play svg { margin-left: 2px; }
  .hero-panel p { margin: 0; color: #d4d4d8; font-size: 0.9rem; line-height: 1.6; }
  .hero-panel .tag { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 14px; display: block; }

  .qgrid { display: grid; gap: 12px; }
  .qcard { display: flex; gap: 14px; align-items: flex-start; border: 1px solid #1f1f22; border-radius: 4px; padding: 16px 18px; background: #111113; }
  .qnum { font-size: 0.7rem; font-weight: 800; color: #f5a623; letter-spacing: 0.04em; flex-shrink: 0; margin-top: 2px; }
  .qcard p { margin: 0; font-size: 0.88rem; color: #e4e4e7; line-height: 1.5; }

  .proof-grid { display: grid; gap: 14px; }
  blockquote { margin: 0; border: 1px solid #27272a; border-radius: 4px; padding: 20px 22px; background: #111113; position: relative; }
  blockquote .mark { position: absolute; top: 10px; right: 16px; font-size: 2rem; color: #27272a; font-family: Georgia, serif; }
  blockquote p { margin: 0 0 12px; font-size: 0.9rem; color: #e4e4e7; line-height: 1.55; }
  cite { font-style: normal; font-size: 0.78rem; color: #a1a1aa; font-weight: 600; }
  cite span { color: #71717a; font-weight: 400; }

  .contact { font-size: 0.85rem; color: #a1a1aa; line-height: 1.6; }
  .cta { display: inline-block; margin-top: 20px; padding: 12px 22px; background: #f5a623; color: #0a0a0b; border-radius: 3px; text-decoration: none; font-size: 0.85rem; font-weight: 700; }
</style>
</head>
<body>
<main>
  <div class="rail">
    <div class="stage"><span class="dot"></span><span>Confirmed</span></div>
    <div class="line"></div>
    <div class="stage pending"><span class="dot"></span><span>Your call</span></div>
    <div class="line"></div>
    <div class="stage pending"><span class="dot"></span><span>Next steps</span></div>
  </div>

  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>You're confirmed with ${m.buyer}</h1>
  <p class="sub">One quick briefing before you sit down together — ${m.heroLength} of your time.</p>

  <section>
    <p class="label">Before your call</p>
    <div class="hero-panel">
      <div class="play"><svg width="12" height="12" viewBox="0 0 12 12" fill="#0a0a0b"><path d="M2 1l9 5-9 5V1z"/></svg></div>
      <p>A short briefing video introducing your call with ${m.host} and what to expect. Recording in progress.</p>
      <span class="tag">Hero briefing — ${m.heroLength}</span>
    </div>
  </section>

  <section>
    <p class="label">Answered before you ask</p>
    <div class="qgrid">${questionsHtml}</div>
  </section>

  ${proofHtml}

  <section class="contact">
    <p class="label">Need to reschedule?</p>
    <p>Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarHtml}
  </section>
</main>
</body>
</html>`;
}
