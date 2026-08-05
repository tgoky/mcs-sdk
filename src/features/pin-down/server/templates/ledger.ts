import type { PageContentModel } from "./content-model";

/**
 * Ledger — quiet, professional-services register. Warm paper background,
 * ink-navy accent (deliberately not the cream+terracotta combination that
 * shows up by default), serif display over a clean grotesk body. Signature
 * element: the docket-style reference line under the masthead, treating
 * the confirmation like a filed record rather than a marketing moment —
 * the right register for a buyer whose own credibility runs on precision.
 */
export function buildLedgerHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q) => `<li>${q}</li>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section class="proof">
      <p class="kicker">On record</p>
      ${m.testimonials
        .map(
          (t) => `
        <blockquote>
          <p>${t.quote}</p>
          <cite>${t.name}, ${t.role}${t.company ? ` — ${t.company}` : ""}</cite>
        </blockquote>`
        )
        .join("")}
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
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f7f5f1;
    color: #1b2430;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 620px; margin: 0 auto; padding: 64px 28px 96px; }

  .masthead { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #1b2430; padding-bottom: 14px; margin-bottom: 8px; }
  .masthead .ref { font-family: Georgia, "Times New Roman", serif; font-size: 0.72rem; letter-spacing: 0.06em; color: #5b6472; }
  .masthead .date { font-size: 0.72rem; color: #5b6472; }

  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 2.1rem; font-weight: 400; letter-spacing: -0.01em; line-height: 1.2; margin: 28px 0 10px; }
  .sub { font-size: 0.92rem; color: #4a5261; margin: 0 0 48px; max-width: 48ch; line-height: 1.55; }

  section { margin-bottom: 44px; }
  .kicker { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #5b6472; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 1px solid #d8d3c8; }

  .brief { border: 1px solid #d8d3c8; padding: 26px; background: #fffefc; }
  .brief p { margin: 0; font-size: 0.9rem; color: #333c48; line-height: 1.65; }
  .brief .runtime { display: inline-block; margin-top: 16px; font-size: 0.72rem; color: #8a8377; letter-spacing: 0.04em; }

  ul.qa { list-style: none; margin: 0; padding: 0; }
  ul.qa li { position: relative; padding: 14px 0 14px 26px; border-bottom: 1px solid #e3ded2; font-size: 0.9rem; color: #333c48; line-height: 1.5; }
  ul.qa li:last-child { border-bottom: none; }
  ul.qa li::before { content: "—"; position: absolute; left: 0; color: #1b2430; }

  blockquote { margin: 0 0 20px; padding-left: 20px; border-left: 2px solid #1b2430; }
  blockquote:last-child { margin-bottom: 0; }
  blockquote p { margin: 0 0 8px; font-family: Georgia, "Times New Roman", serif; font-size: 1rem; font-style: italic; color: #262e3a; line-height: 1.55; }
  cite { font-style: normal; font-size: 0.78rem; color: #5b6472; }

  .contact { font-size: 0.88rem; color: #4a5261; line-height: 1.6; border-top: 1px solid #1b2430; padding-top: 20px; }
  .cta { display: inline-block; margin-top: 18px; padding: 11px 22px; background: #1b2430; color: #f7f5f1; text-decoration: none; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.02em; }
</style>
</head>
<body>
<main>
  <div class="masthead">
    <span class="ref">REF. ${m.reference}</span>
    <span class="date">Confirmation on file</span>
  </div>

  <h1>You're confirmed with ${m.buyer}</h1>
  <p class="sub">${m.heroEyebrow}</p>

  <section>
    <p class="kicker">Briefing</p>
    <div class="brief">
      <p>A short recorded briefing will introduce your call with ${m.host} and cover what to expect — currently being prepared.</p>
      <span class="runtime">Runtime ${m.heroLength}</span>
    </div>
  </section>

  <section>
    <p class="kicker">What we're typically asked</p>
    <ul class="qa">${questionsHtml}</ul>
  </section>

  ${proofHtml}

  <section class="contact">
    <p class="kicker" style="border:none;padding:0;margin-bottom:8px;">Need to reschedule?</p>
    <p>Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarHtml}
  </section>
</main>
</body>
</html>`;
}
