import type { PageContentModel } from "./content-model";

/**
 * Field Notes — a well-kept notebook, annotated by hand. Kraft-paper
 * background, typewriter labels over a humanist serif body. Distinguished
 * from a generic hairline-rule broadsheet by two things: the margin
 * annotation column (numbers sit in a visible left margin like real
 * marginalia, not inline) and the dashed "tear here" divider as the actual
 * signature element, rather than just more hairline rules.
 */
export function buildFieldNotesHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q, i) => `
        <div class="entry">
          <span class="margin-num">${i + 1}.</span>
          <p>${q}</p>
        </div>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="kicker">Notes from others</p>
      ${m.testimonials
        .map(
          (t, i) => `
        <div class="entry">
          <span class="margin-num">${String.fromCharCode(97 + i)}.</span>
          <p><em>&ldquo;${t.quote}&rdquo;</em><br/><span class="who">— ${t.name}, ${t.role}${t.company ? `, ${t.company}` : ""}</span></p>
        </div>`
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
    background: #ede6d6;
    color: #2b2620;
    font-family: Georgia, "Times New Roman", serif;
  }
  main { max-width: 600px; margin: 0 auto; padding: 60px 24px 96px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  .stamp { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.68rem; letter-spacing: 0.06em; color: #8b5e34; border: 1px solid #8b5e34; padding: 4px 10px; margin-bottom: 22px; transform: rotate(-1deg); }

  h1 { font-size: 1.9rem; font-weight: 400; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 12px; }
  .sub { font-size: 0.92rem; color: #55503f; margin: 0 0 8px; line-height: 1.6; max-width: 46ch; }

  .tear { border: none; border-top: 2px dashed #b7ac93; margin: 36px 0; position: relative; }
  .tear::after { content: "✂"; position: absolute; left: -4px; top: -10px; font-size: 0.8rem; color: #8b5e34; background: #ede6d6; padding: 0 4px; }

  section { margin-bottom: 8px; }
  .kicker { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: #8b5e34; margin: 0 0 18px; }

  .brief { border-left: 3px solid #8b5e34; padding-left: 20px; }
  .brief p { margin: 0; font-size: 0.92rem; color: #3a352a; line-height: 1.65; }
  .brief .rt { display: block; margin-top: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.68rem; color: #8b5e34; }

  .entry { display: flex; gap: 16px; padding: 12px 0; }
  .margin-num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.78rem; color: #8b5e34; flex-shrink: 0; width: 20px; padding-top: 2px; }
  .entry p { margin: 0; font-size: 0.92rem; color: #3a352a; line-height: 1.6; }
  .entry .who { font-size: 0.8rem; color: #6b6552; font-style: normal; }

  .contact p { font-size: 0.9rem; color: #55503f; line-height: 1.65; margin: 0; }
  .cta { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2b2620; color: #ede6d6; text-decoration: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.76rem; }
</style>
</head>
<body>
<main>
  <span class="stamp">CONFIRMED</span>
  <h1>Notes ahead of your call with ${m.buyer}</h1>
  <p class="sub">${m.heroEyebrow}</p>

  <hr class="tear" />

  <section>
    <p class="kicker">Before you arrive</p>
    <div class="brief">
      <p>A short briefing introducing your call with ${m.host} and what to expect is being recorded.</p>
      <span class="rt">runtime — ${m.heroLength}</span>
    </div>
  </section>

  <hr class="tear" />

  <section>
    <p class="kicker">Questions, answered ahead of time</p>
    ${questionsHtml}
  </section>

  ${m.showProof ? `<hr class="tear" />${proofHtml}` : ""}

  <hr class="tear" />

  <section class="contact">
    <p class="kicker">Need to reschedule?</p>
    <p>Use the link in your confirmation email, or reply directly and we'll sort it out.</p>
    ${calendarHtml}
  </section>
</main>
</body>
</html>`;
}
