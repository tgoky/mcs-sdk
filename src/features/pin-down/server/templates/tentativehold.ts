import type { PageContentModel } from "./content-model";

/**
 * The Tentative Hold — for agency/done-for-you offers, where a booked
 * slot alone doesn't feel like a commitment yet. Cool slate blue,
 * professional and calm. Signature element: the page opens in a
 * "pending" state (a hold, not yet confirmed) and asks for one honest
 * tap — "Yes, I'll be there" — before it visually settles into
 * "confirmed." This is a self-contained visual acknowledgment (no form
 * submission, no backend write — the page has no server to write to)
 * built to raise the buyer's own felt commitment the same way saying a
 * thing out loud does, not to fake a persistence step that isn't there.
 */
export function buildTentativeHoldHtml(m: PageContentModel): string {
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
            (t) => `
          <div class="proof-card">
            <p>${t.quote}</p>
            <span class="who">${t.name}, ${t.role}${t.company ? ` &mdash; ${t.company}` : ""}</span>
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
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #EEF1F5;
    color: #1B2733;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 600px; margin: 0 auto; padding: 56px 24px 96px; }

  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #5b7699; margin: 0 0 12px; text-align: center; }
  h1 { text-align: center; font-size: 1.9rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.2; margin: 0 0 36px; }

  /* Hold-status card — signature element */
  .hold-card {
    border-radius: 14px;
    padding: 26px 24px;
    margin-bottom: 40px;
    background: #FFFFFF;
    border: 1.5px solid #d7dee6;
    transition: border-color 0.25s ease, background 0.25s ease;
  }
  .hold-card.is-confirmed { border-color: #2B4C7E; background: #F3F7FC; }

  .status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .status-dot { width: 9px; height: 9px; border-radius: 50%; background: #d9a441; flex-shrink: 0; animation: pulse 1.8s ease-in-out infinite; }
  .hold-card.is-confirmed .status-dot { background: #2B4C7E; animation: none; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .status-text { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a67c1f; }
  .hold-card.is-confirmed .status-text { color: #2B4C7E; }

  .hold-card .headline { margin: 0 0 6px; font-size: 1.05rem; font-weight: 700; }
  .hold-card .sub { margin: 0 0 20px; font-size: 0.86rem; color: #4d5c6e; line-height: 1.55; }
  .hold-card.is-confirmed .sub { display: none; }
  .hold-card .confirmed-sub { display: none; margin: 0 0 20px; font-size: 0.86rem; color: #395277; line-height: 1.55; }
  .hold-card.is-confirmed .confirmed-sub { display: block; }

  .confirm-btn {
    appearance: none; border: none; cursor: pointer;
    background: #2B4C7E; color: #fff; font-size: 0.86rem; font-weight: 700;
    padding: 12px 22px; border-radius: 9px; letter-spacing: 0.01em;
    transition: opacity 0.15s ease;
  }
  .confirm-btn:hover { opacity: 0.92; }
  .hold-card.is-confirmed .confirm-btn { display: none; }
  .confirmed-badge { display: none; align-items: center; gap: 8px; font-size: 0.86rem; font-weight: 700; color: #2B4C7E; }
  .hold-card.is-confirmed .confirmed-badge { display: inline-flex; }

  section { margin-bottom: 40px; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #5b7699; margin: 0 0 16px; }

  .qrow { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #dde3ea; }
  .qrow:first-child { border-top: 1px solid #dde3ea; }
  .qnum { font-size: 0.76rem; font-weight: 800; color: #2B4C7E; flex-shrink: 0; min-width: 16px; margin-top: 1px; }
  .qrow p { margin: 0; font-size: 0.88rem; color: #2c3947; line-height: 1.5; }

  .proof-grid { display: grid; gap: 12px; }
  .proof-card { background: #FFFFFF; border: 1px solid #dde3ea; border-radius: 10px; padding: 18px 20px; }
  .proof-card p { margin: 0 0 10px; font-size: 0.88rem; color: #2c3947; line-height: 1.55; }
  .proof-card .who { font-size: 0.76rem; color: #5b7699; }

  .foot { text-align: center; font-size: 0.86rem; color: #4d5c6e; line-height: 1.6; }
  .cal-link { display: inline-block; margin-top: 16px; color: #2B4C7E; font-weight: 700; text-decoration: none; font-size: 0.84rem; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>${m.buyer}, your slot is on hold</h1>

  <div class="hold-card" id="hold-card">
    <div class="status-row">
      <span class="status-dot"></span>
      <span class="status-text" id="status-text">Tentative &mdash; not yet confirmed</span>
    </div>
    <p class="headline">One tap keeps this slot yours</p>
    <p class="sub">This time is held for ${m.heroLength}, but a hold isn't a commitment yet. Let us know you'll be there and we'll lock it in.</p>
    <p class="confirmed-sub">Locked in. ${m.host} is preparing for your call &mdash; we'll see you then.</p>
    <button class="confirm-btn" id="confirm-btn" type="button">Yes, I'll be there</button>
    <span class="confirmed-badge" id="confirmed-badge">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#2B4C7E"/><path d="M5 8.2l2 2 4-4.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Confirmed by ${m.buyer}
    </span>
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
</body>
</html>`;
}
