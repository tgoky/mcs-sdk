import { callClaudeWithWebSearch } from "@/lib/llm";

export interface ProspectResearchResult {
  summary: string;
  citedUrls: string[];
  searchesUsed: number;
}

/**
 * Runs one web-search-enabled Claude call to find legitimate, public
 * information about a prospect before brief synthesis — the gap the
 * original audit correctly identified: brief-service.ts previously went
 * straight from the identity-match gate to prompting Claude with only the
 * raw booking-form fields (name/email/company/time), no actual research
 * step in between.
 *
 * Deliberately does NOT attempt to scrape LinkedIn or any other named
 * platform — LinkedIn's terms of service prohibit scraping, and there's
 * no legitimate API available for arbitrary profile lookups. Using
 * Claude's own web search tool instead is a safer, more defensible
 * interpretation of "background research": it only surfaces what's
 * already public and indexed, with real cited sources, and it's a
 * capability this app's own LLM provider already offers rather than a
 * new third-party integration to build and maintain.
 *
 * Only ever called for prospects that already passed the Rule 14 identity
 * confidence gate — never runs research on an unconfirmed identity.
 */
export async function researchProspect(
  name: string,
  email: string,
  company: string | undefined,
  runId?: string
): Promise<ProspectResearchResult> {
  const system = `You are a pre-call research assistant. Given a prospect's name, email, and
company, use web search to find genuinely useful, PUBLIC information a
sales rep could reference on an upcoming call: their professional role,
what the company does, any recent public news/announcements about the
company, and any public content (talks, posts, interviews) the prospect
has put out.

Be honest about uncertainty: if search doesn't turn up anything
confidently attributable to this specific person (common names are
genuinely ambiguous), say so plainly rather than guessing or attributing
someone else's information to them. Never fabricate a detail you didn't
actually find via search.

Keep the summary to 3-5 short bullet points. No preamble, no "Based on my
search" framing — just the findings, or an honest note that nothing
reliable was found.`;

  const userMessage = `Prospect: ${name} <${email}>${company ? `\nCompany: ${company}` : ""}`;

  try {
    const result = await callClaudeWithWebSearch({
      system,
      userMessage,
      maxTokens: 800,
      maxSearches: 3,
      runId,
    });

    return {
      summary: result.text || "No research findings — search did not return anything usable.",
      citedUrls: result.citedUrls,
      searchesUsed: result.searchesUsed,
    };
  } catch (e: any) {
    // Research failing should never block the brief itself from being
    // generated — same soft-fail philosophy used everywhere else in this
    // app (e.g. confirmation page deploy falling back to paste-ready
    // rather than failing onboarding outright).
    return {
      summary: `Research unavailable this run: ${e.message}`,
      citedUrls: [],
      searchesUsed: 0,
    };
  }
}
