import type { PageContentModel } from "./content-model";
import { buildMergeScriptTag, mergeField, mergeSlot } from "./content-model";

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
 * The status indicator is a plain static dot — no pulsing animation —
 * since a hold that's genuinely pending doesn't need to visually nag.
 *
 * Published once per engagement as static HTML, so the greeting and call
 * time resolve client-side from the booking redirect (see
 * content-model.ts) rather than every prospect seeing the same baked-in
 * text.
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
  [hidden] { display: none !important; }
  .mf-d, .mf-l { display: inline; }

  .brand-line { text-align: center; font-size: 0.72rem; font-weight: 600; color: #7d93af; margin: 0 0 8px; }
  .eyebrow { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #5b7699; margin: 0 0 12px; text-align: center; }
  h1 { text-align: center; font-size: 1.9rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.2; margin: 0 0 8px; }

  /* Call-time chip, shown only once the booking redirect resolves it —
     never a guessed or stale time. */
  .chip-row { display: flex; justify-content: center; margin: 0 0 32px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #d7dee6; border-radius: 999px; padding: 7px 14px; font-size: 0.8rem; color: #2c3947; }
  .chip strong { color: #2B4C7E; }

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
  .status-dot { width: 9px; height: 9px; border-radius: 50%; background: #d9a441; flex-shrink: 0; }
  .hold-card.is-confirmed .status-dot { background: #2B4C7E; }
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

  /* Briefing video — placeholder until the operator's recording pass
     produces one; never a fabricated embed. */
  .video-card { background: #fff; border: 1px solid #d7dee6; border-radius: 12px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: 40px; }
  .video-card .play { width: 32px; height: 32px; border-radius: 50%; background: #2B4C7E; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .video-card .play::after { content: ""; border-left: 9px solid #fff; border-top: 6px solid transparent; border-bottom: 6px solid transparent; margin-left: 3px; }
  .video-card .vtitle { margin: 0 0 2px; font-size: 0.85rem; font-weight: 700; color: #1B2733; }
  .video-card .vsub { margin: 0; font-size: 0.76rem; color: #5b7699; }

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
  <p class="brand-line">${m.buyer}</p>
  <p class="eyebrow">${m.heroEyebrow}</p>
  <h1>${mergeField("firstName", "Your slot is on hold", `${mergeSlot("firstName")}, your slot is on hold`)}</h1>

  <div class="chip-row">
    <span class="chip">${mergeField(
      "call_time",
      "Time confirmed by email",
      `<strong>${mergeSlot("call_time")}</strong>`
    )}</span>
  </div>

  <div class="hold-card" id="hold-card">
    <div class="status-row">
      <span class="status-dot"></span>
      <span class="status-text" id="status-text">Tentative &mdash; not yet confirmed</span>
    </div>
    <p class="headline">One tap keeps this slot yours</p>
    <p class="sub">This time is held for ${m.heroLength}, but a hold isn't a commitment yet. Let us know you'll be there and we'll lock it in.</p>
    <p class="confirmed-sub">Locked in. ${mergeField("host", m.host, mergeSlot("host"))} is preparing for your call &mdash; we'll see you then.</p>
    <button class="confirm-btn" id="confirm-btn" type="button">Yes, I'll be there</button>
    <span class="confirmed-badge" id="confirmed-badge">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#2B4C7E"/><path d="M5 8.2l2 2 4-4.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Confirmed
    </span>
  </div>

  <div class="video-card">
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
