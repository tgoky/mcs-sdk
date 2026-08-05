import type { PageContentModel } from "./content-model";

/**
 * Grid — structured, precise, enterprise-ready. Slate/navy with a cyan
 * accent and monospace utility labels throughout. Signature element: the
 * literal grid-line background is the actual layout motif, not just a
 * decoration — every section aligns to it, since "grid" here means the
 * structure itself is the content, appropriate for a buyer selling
 * process and precision rather than warmth.
 */
export function buildGridHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <div class="cell">
          <span class="idx">Q${i + 1}</span>
          <p>${q}</p>
        </div>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">// Verified outcomes</p>
      <div class="proof-grid">
        ${m.testimonials
          .map(
            (t) => `
          <div class="proof-cell">
            <p>${t.quote}</p>
            <div class="meta"><span class="name">${t.name}</span><span class="role">${t.role}${t.company ? ` @ ${t.company}` : ""}</span></div>
          </div>`
          )
          .join("")}
      </div>
    </section>`
    : "";

  const calendarHtml = m.calendarAddToUrl
    ? `<a class="cta" href="${m.calendarAddToUrl}">Add to calendar →</a>`
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
    background:
      linear-gradient(#0f172a, #0f172a),
      repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(148,163,184,0.08) 39px, rgba(148,163,184,0.08) 40px),
      repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(148,163,184,0.08) 39px, rgba(148,163,184,0.08) 40px);
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 680px; margin: 0 auto; padding: 56px 24px 90px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  .status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
  .status-row .pip { width: 7px; height: 7px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 8px #38bdf8; }
  .status-row span { font-size: 0.7rem; letter-spacing: 0.06em; color: #38bdf8; text-transform: uppercase; }

  h1 { font-size: 1.9rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; margin: 0 0 10px; color: #f8fafc; }
  .sub { font-size: 0.9rem; color: #94a3b8; margin: 0 0 44px; max-width: 50ch; line-height: 1.6; }

  section { margin-bottom: 44px; border-top: 1px solid rgba(148,163,184,0.16); padding-top: 20px; }
  .label { font-size: 0.7rem; color: #64748b; margin: 0 0 16px; letter-spacing: 0.02em; }

  .brief { border: 1px solid rgba(148,163,184,0.2); background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); padding: 24px; }
  .brief p { margin: 0; font-size: 0.88rem; color: #cbd5e1; line-height: 1.6; }
  .brief .rt { display: inline-block; margin-top: 14px; font-size: 0.7rem; color: #38bdf8; }

  .qgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px; background: rgba(148,163,184,0.16); border: 1px solid rgba(148,163,184,0.16); }
  .cell { background: #0f172a; padding: 18px; }
  .idx { display: block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.68rem; color: #38bdf8; margin-bottom: 8px; }
  .cell p { margin: 0; font-size: 0.84rem; color: #cbd5e1; line-height: 1.5; }

  .proof-grid { display: grid; gap: 1px; background: rgba(148,163,184,0.16); border: 1px solid rgba(148,163,184,0.16); }
  .proof-cell { background: #0f172a; padding: 20px; }
  .proof-cell p { margin: 0 0 12px; font-size: 0.87rem; color: #e2e8f0; line-height: 1.55; }
  .meta { display: flex; gap: 8px; align-items: baseline; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.7rem; }
  .meta .name { color: #38bdf8; }
  .meta .role { color: #64748b; }

  .contact { font-size: 0.85rem; color: #94a3b8; line-height: 1.6; }
  .cta { display: inline-block; margin-top: 18px; padding: 11px 20px; border: 1px solid #38bdf8; color: #38bdf8; text-decoration: none; font-size: 0.8rem; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
</head>
<body>
<main>
  <div class="status-row"><span class="pip"></span><span class="mono">status: confirmed</span></div>

  <h1>You're confirmed with ${m.buyer}</h1>
  <p class="sub">${m.heroEyebrow}</p>

  <section>
    <p class="label mono">// briefing</p>
    <div class="brief">
      <p>A short briefing covering your call with ${m.host} and what to expect is being prepared.</p>
      <span class="rt mono">runtime: ${m.heroLength}</span>
    </div>
  </section>

  <section>
    <p class="label mono">// frequently asked</p>
    <div class="qgrid">${questionsHtml}</div>
  </section>

  ${proofHtml}

  <section class="contact">
    <p class="label mono">// reschedule</p>
    <p>Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarHtml}
  </section>
</main>
</body>
</html>`;
}
