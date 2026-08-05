import type { PageContentModel } from "./content-model";

/**
 * Studio — warm and personal, coach-to-client. Coral-peach background
 * against a plum accent (deliberately not the cream+terracotta pairing
 * that's the default "warm" choice) with generous rounded corners and a
 * friendly sans display instead of a serif one. Signature element: the
 * hand-drawn-style "watch first" badge clipped to the hero video panel,
 * like a sticky note from the coach themselves.
 */
export function buildStudioHtml(m: PageContentModel): string {
  const questionsHtml = m.questions
    .map(
      (q) => `
        <div class="qbubble">
          <span class="qmark">?</span>
          <p>${q}</p>
        </div>`
    )
    .join("");

  const proofHtml = m.showProof
    ? `
    <section>
      <p class="label">Kind words</p>
      <div class="proof-stack">
        ${m.testimonials
          .map(
            (t) => `
          <div class="proof-card">
            <p>&ldquo;${t.quote}&rdquo;</p>
            <div class="who"><span class="avatar">${t.name.charAt(0)}</span><div><strong>${t.name}</strong><span>${t.role}${t.company ? ` · ${t.company}` : ""}</span></div></div>
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
    background: #fceae0;
    color: #3a2e28;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  main { max-width: 600px; margin: 0 auto; padding: 52px 24px 90px; }

  .badge-row { display: inline-flex; align-items: center; gap: 8px; background: #ffffff; border-radius: 999px; padding: 6px 14px 6px 6px; margin-bottom: 22px; box-shadow: 0 2px 10px rgba(107,53,80,0.08); }
  .badge-row .dot { width: 26px; height: 26px; border-radius: 50%; background: #6b3550; display: flex; align-items: center; justify-content: center; }
  .badge-row span { font-size: 0.78rem; font-weight: 700; color: #6b3550; }

  h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.15; margin: 0 0 12px; }
  .sub { font-size: 0.94rem; color: #6b5a52; margin: 0 0 40px; max-width: 44ch; line-height: 1.6; }

  section { margin-bottom: 40px; }
  .label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a3806f; margin: 0 0 16px; }

  .hero-card { position: relative; background: #ffffff; border-radius: 24px; padding: 30px; box-shadow: 0 8px 24px rgba(107,53,80,0.08); }
  .hero-card p { margin: 0; font-size: 0.9rem; color: #5c4b43; line-height: 1.6; }
  .sticky { position: absolute; top: -14px; right: 18px; background: #6b3550; color: #fceae0; font-size: 0.68rem; font-weight: 700; padding: 8px 14px; border-radius: 999px; transform: rotate(-4deg); box-shadow: 0 4px 12px rgba(107,53,80,0.25); }
  .runtime { display: inline-block; margin-top: 14px; font-size: 0.72rem; color: #a3806f; font-weight: 600; }

  .qgrid { display: grid; gap: 12px; }
  .qbubble { display: flex; gap: 12px; align-items: flex-start; background: #ffffff; border-radius: 18px; padding: 16px 18px; box-shadow: 0 2px 10px rgba(107,53,80,0.06); }
  .qmark { width: 22px; height: 22px; border-radius: 50%; background: #fceae0; color: #6b3550; font-weight: 800; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .qbubble p { margin: 0; font-size: 0.87rem; color: #4a3d36; line-height: 1.5; }

  .proof-stack { display: grid; gap: 14px; }
  .proof-card { background: #ffffff; border-radius: 20px; padding: 22px; box-shadow: 0 2px 10px rgba(107,53,80,0.06); }
  .proof-card p { margin: 0 0 14px; font-size: 0.9rem; color: #4a3d36; line-height: 1.55; font-style: italic; }
  .who { display: flex; align-items: center; gap: 10px; }
  .avatar { width: 30px; height: 30px; border-radius: 50%; background: #fceae0; color: #6b3550; font-weight: 800; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .who strong { display: block; font-size: 0.8rem; color: #3a2e28; }
  .who span { font-size: 0.72rem; color: #a3806f; }

  .contact { font-size: 0.88rem; color: #6b5a52; line-height: 1.6; }
  .cta { display: inline-block; margin-top: 18px; padding: 12px 24px; background: #6b3550; color: #fceae0; border-radius: 999px; text-decoration: none; font-size: 0.85rem; font-weight: 700; }
</style>
</head>
<body>
<main>
  <div class="badge-row">
    <span class="dot">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="#fceae0"><path d="M2 1l9 5-9 5V1z"/></svg>
    </span>
    <span>You're confirmed</span>
  </div>

  <h1>See you soon, and thanks for booking with ${m.buyer}</h1>
  <p class="sub">${m.heroEyebrow}</p>

  <section>
    <p class="label">Before we talk</p>
    <div class="hero-card">
      <span class="sticky">Watch first</span>
      <p>A short video from ${m.host} introducing your call and what to expect — recording is on its way.</p>
      <span class="runtime">${m.heroLength} watch</span>
    </div>
  </section>

  <section>
    <p class="label">Quick answers while you wait</p>
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
