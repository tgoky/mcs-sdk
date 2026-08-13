import type { PageContentModel } from "./content-model";

/**
 * The Pre-Call Assessment — for a niche or vertical offer where
 * qualification changes what the call actually covers. Clinical calm:
 * off-white, deep teal, generous whitespace. Signature element: a short
 * self-check built straight from the buyer's own top call questions —
 * the prospect ticks whichever already apply to them, and the page
 * quietly confirms those are exactly what the call will address. Not a
 * lead score or a graded quiz (nothing here is sent anywhere or judges
 * the prospect) — just a priming device that makes the call feel
 * diagnostic before it starts, which is the actual job of this design.
 */
export function buildAssessmentHtml(m: PageContentModel): string {
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
            (t) => `
          <div class="proof-card">
            <p>${t.quote}</p>
            <span class="who">${t.name} &middot; ${t.role}${t.company ? `, ${t.company}` : ""}</span>
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
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #F5F7F5;
    color: #1C2321;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 600px; margin: 0 auto; padding: 60px 24px 100px; }

  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #1F6F5C; margin: 0 0 12px; }
  h1 { font-size: 1.95rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.22; margin: 0 0 10px; }
  .sub { color: #4d5851; font-size: 0.92rem; margin: 0 0 44px; max-width: 46ch; line-height: 1.6; }

  section { margin-bottom: 44px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #6b756f; margin: 0 0 16px; }

  /* Self-check — signature element */
  .assess-panel { background: #ffffff; border: 1px solid #dbe4de; border-radius: 12px; padding: 24px 22px 22px; }
  .assess-panel .prompt { margin: 0 0 18px; font-size: 0.86rem; color: #2c352f; line-height: 1.55; }
  .assess-panel .prompt strong { color: #1F6F5C; }

  .check-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 4px; cursor: pointer; user-select: none; border-radius: 8px; transition: background 0.12s ease; }
  .check-row:hover { background: #f0f5f2; }
  .check-row input { position: absolute; opacity: 0; width: 0; height: 0; }
  .box {
    width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #a9bcb3; flex-shrink: 0; margin-top: 1px;
    display: flex; align-items: center; justify-content: center; transition: background 0.12s ease, border-color 0.12s ease;
  }
  .box::after { content: ""; width: 9px; height: 6px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(-45deg) translateY(-1px); opacity: 0; }
  input:checked + .box { background: #1F6F5C; border-color: #1F6F5C; }
  input:checked + .box::after { opacity: 1; }
  .check-text { font-size: 0.88rem; color: #263029; line-height: 1.5; }

  .assess-note {
    margin-top: 18px; padding: 14px 16px; border-radius: 8px; background: #eef6f2; border: 1px solid #cfe4d9;
    font-size: 0.84rem; color: #1F6F5C; line-height: 1.55; display: none;
  }
  .assess-note.is-visible { display: block; }

  ul.covered { list-style: none; margin: 0; padding: 0; }
  ul.covered li { padding: 13px 0; border-bottom: 1px solid #dbe4de; font-size: 0.88rem; color: #2c352f; line-height: 1.5; }
  ul.covered li:last-child { border-bottom: none; }

  .proof-grid { display: grid; gap: 12px; }
  .proof-card { background: #ffffff; border: 1px solid #dbe4de; border-radius: 10px; padding: 18px 20px; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: #263029; line-height: 1.55; }
  .proof-card .who { font-size: 0.76rem; color: #6b756f; }

  .contact { font-size: 0.86rem; color: #4d5851; line-height: 1.6; border-top: 1px solid #dbe4de; padding-top: 22px; }
  .cta { display: inline-block; margin-top: 16px; padding: 11px 22px; background: #1F6F5C; color: #f5f7f5; text-decoration: none; border-radius: 8px; font-size: 0.84rem; font-weight: 700; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>Before your call, ${m.buyer}</h1>
  <p class="sub">A ${m.heroLength} self-check so ${m.host} can spend the whole call on what actually applies to you.</p>

  <section>
    <p class="label">Quick self-check</p>
    <div class="assess-panel">
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
</body>
</html>`;
}
