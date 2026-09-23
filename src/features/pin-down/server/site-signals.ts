// src/features/pin-down/server/site-signals.ts
//
// Everything a crawled page gives away for free, read straight from its
// HTML: no model call, no extra credit. The crawl already pays for each
// page's rendered HTML; before this, only the homepage's unrendered HTML
// was looked at, for six social networks and a booking-widget regex.
//
//   - structured data (JSON-LD): the business, its offers and prices, its
//     FAQ, its rating, its people, its address and phone
//   - social and review profiles, across the networks clients actually use
//   - every booking link, with the event it books
//   - the tools the site runs: email/CRM tracking, ad pixels, analytics,
//     video players, chat, checkout
//   - contact details and brand images
//
// Pure functions over strings, so they're cheap to run on every page and
// easy to test.

// ── Structured data (JSON-LD) ────────────────────────────────────────────

export interface JsonLdSignals {
  organizationName?: string;
  logoUrl?: string;
  sameAs: string[];
  telephone?: string;
  email?: string;
  address?: string;
  offers: { name?: string; price?: string; currency?: string }[];
  faqs: { question: string; answer?: string }[];
  rating?: { value: number; count?: number };
  reviews: { body: string; author?: string }[];
  people: { name: string; jobTitle?: string }[];
}

type LdNode = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function typesOf(node: LdNode): string[] {
  return asArray(node["@type"] as string | string[] | undefined).map((t) => String(t).toLowerCase());
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "url" in (v as LdNode)) return str((v as LdNode).url);
  if (v && typeof v === "object" && "name" in (v as LdNode)) return str((v as LdNode).name);
  return undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** Every JSON-LD node on the page, with @graph and nested lists flattened. */
function ldNodes(html: string): LdNode[] {
  const out: LdNode[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    const node = v as LdNode;
    if (node["@type"]) out.push(node);
    if (node["@graph"]) visit(node["@graph"], depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()), 0);
    } catch {
      // A broken block on someone else's site; skip it.
    }
  }
  return out;
}

export function extractJsonLd(html: string): JsonLdSignals {
  const out: JsonLdSignals = { sameAs: [], offers: [], faqs: [], reviews: [], people: [] };
  const addOffer = (o: LdNode, fallbackName?: string) => {
    const price = str(o.price) ?? str((o.priceSpecification as LdNode | undefined)?.price) ?? str(o.lowPrice);
    if (!price && !fallbackName) return;
    out.offers.push({ name: str(o.name) ?? fallbackName, price, currency: str(o.priceCurrency) });
  };

  for (const node of ldNodes(html)) {
    const types = typesOf(node);
    if (types.some((t) => ["organization", "localbusiness", "corporation", "professionalservice", "website"].includes(t) || t.endsWith("business"))) {
      out.organizationName ??= str(node.name);
      out.logoUrl ??= str(node.logo) ?? str(node.image);
      out.telephone ??= str(node.telephone);
      out.email ??= str(node.email);
      const addr = node.address as LdNode | string | undefined;
      if (!out.address && addr) {
        out.address =
          typeof addr === "string"
            ? addr
            : [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode, addr.addressCountry].map(str).filter(Boolean).join(", ") || undefined;
      }
      out.sameAs.push(...asArray(node.sameAs as string | string[]).filter((u): u is string => typeof u === "string"));
      for (const f of asArray(node.founder as LdNode | LdNode[])) {
        const name = str(f?.name ?? f);
        if (name) out.people.push({ name, jobTitle: "Founder" });
      }
    }
    if (types.includes("person")) {
      const name = str(node.name);
      if (name) out.people.push({ name, jobTitle: str(node.jobTitle) });
      out.sameAs.push(...asArray(node.sameAs as string | string[]).filter((u): u is string => typeof u === "string"));
    }
    if (types.some((t) => ["product", "service", "course", "event"].includes(t))) {
      const offers = asArray(node.offers as LdNode | LdNode[]);
      if (offers.length === 0) addOffer({}, str(node.name));
      for (const o of offers) addOffer(o, str(node.name));
      const agg = node.aggregateRating as LdNode | undefined;
      if (agg && !out.rating) {
        const value = Number(str(agg.ratingValue));
        if (Number.isFinite(value)) out.rating = { value, count: Number(str(agg.reviewCount) ?? str(agg.ratingCount)) || undefined };
      }
    }
    if (types.includes("offer")) addOffer(node);
    if (types.includes("aggregaterating") && !out.rating) {
      const value = Number(str(node.ratingValue));
      if (Number.isFinite(value)) out.rating = { value, count: Number(str(node.reviewCount) ?? str(node.ratingCount)) || undefined };
    }
    if (types.includes("review")) {
      const body = str(node.reviewBody) ?? str(node.description);
      if (body) out.reviews.push({ body: stripTags(body), author: str(node.author) });
    }
    if (types.includes("faqpage")) {
      for (const q of asArray(node.mainEntity as LdNode | LdNode[])) {
        const question = str(q?.name);
        if (!question) continue;
        const answer = str((q.acceptedAnswer as LdNode | undefined)?.text);
        out.faqs.push({ question: stripTags(question), answer: answer ? stripTags(answer) : undefined });
      }
    }
  }
  out.sameAs = [...new Set(out.sameAs)];
  return out;
}

// ── Social and review profiles ──────────────────────────────────────────

/** Networks worth knowing, with how to tell a profile from a share button. */
const PROFILE_RULES: { key: string; host: RegExp; reject?: RegExp; format?: (url: URL) => string }[] = [
  { key: "instagram", host: /(^|\.)instagram\.com$/, reject: /^\/(p|reel|reels|explore|stories|accounts)\b/ },
  { key: "facebook", host: /(^|\.)(facebook|fb)\.com$/, reject: /^\/(sharer|share|dialog|plugins|tr)\b/ },
  { key: "tiktok", host: /(^|\.)tiktok\.com$/, reject: /^\/(video|tag|music)\b/ },
  { key: "twitter", host: /(^|\.)(twitter|x)\.com$/, reject: /^\/(intent|share|home|search|hashtag|i)\b/, format: (u) => `@${u.pathname.split("/")[1]}` },
  { key: "linkedin", host: /(^|\.)linkedin\.com$/, reject: /^\/(sharing|shareArticle|feed)\b/ },
  { key: "youtube", host: /(^|\.)(youtube\.com|youtu\.be)$/, reject: /^\/(watch|embed|shorts|results|playlist)\b/ },
  { key: "threads", host: /(^|\.)threads\.(net|com)$/ },
  { key: "pinterest", host: /(^|\.)pinterest\.[a-z.]+$/, reject: /^\/pin\b/ },
  { key: "spotify", host: /(^|\.)open\.spotify\.com$/, reject: /^\/(track|album)\b/ },
  { key: "applePodcasts", host: /(^|\.)podcasts\.apple\.com$/ },
  { key: "substack", host: /\.substack\.com$/ },
  { key: "skool", host: /(^|\.)skool\.com$/ },
  { key: "discord", host: /(^|\.)(discord\.gg|discord\.com)$/ },
  { key: "whop", host: /(^|\.)whop\.com$/, reject: /^\/(checkout|login)\b/ },
  { key: "github", host: /(^|\.)github\.com$/ },
  { key: "trustpilot", host: /(^|\.)trustpilot\.com$/, reject: /^\/(?!review\/)/ },
  { key: "g2", host: /(^|\.)g2\.com$/, reject: /^\/(?!products\/)/ },
  { key: "capterra", host: /(^|\.)capterra\.[a-z.]+$/ },
  { key: "yelp", host: /(^|\.)yelp\.[a-z.]+$/, reject: /^\/(?!biz\/)/ },
  { key: "googleBusiness", host: /(^|\.)(g\.page|maps\.app\.goo\.gl|business\.google\.com)$/ },
];

/**
 * Social and review profiles from a set of links. When a network appears
 * more than once, the link the site uses most (usually header or footer,
 * on every page) wins over a one-off mention in a blog post; a
 * company-style LinkedIn page wins over a personal one.
 */
export function extractSocialProfiles(urls: string[]): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    for (const rule of PROFILE_RULES) {
      if (!rule.host.test(host)) continue;
      if (path === "/" && !["googleBusiness", "substack"].includes(rule.key)) break;
      if (rule.reject?.test(path)) break;
      const value = rule.format ? rule.format(url) : `https://${host}${path}`;
      const byValue = counts.get(rule.key) ?? new Map<string, number>();
      byValue.set(value, (byValue.get(value) ?? 0) + 1);
      counts.set(rule.key, byValue);
      break;
    }
  }
  const out: Record<string, string> = {};
  for (const [key, byValue] of counts) {
    const ranked = [...byValue.entries()].sort((a, b) => {
      if (key === "linkedin") {
        const companyA = a[0].includes("/company/") ? 1 : 0;
        const companyB = b[0].includes("/company/") ? 1 : 0;
        if (companyA !== companyB) return companyB - companyA;
      }
      return b[1] - a[1];
    });
    out[key] = ranked[0][0];
  }
  return out;
}

// ── Booking links ─────────────────────────────────────────────────────────

export interface BookingLink {
  platform: "calendly" | "cal_com" | "ghl_calendar" | "oncehub";
  url: string;
  /** The account part of the link (calendly.com/<account>/...). */
  account?: string;
  /** The event part (calendly.com/<account>/<event>), when the link names one. */
  event?: string;
}

const BOOKING_LINK_RE =
  /https?:\/\/(?:www\.)?(calendly\.com|cal\.com|app\.cal\.com|[a-z0-9-]+\.oncehub\.com|go\.oncehub\.com|api\.leadconnectorhq\.com|link\.msgsndr\.com|[a-z0-9.-]+\.msgsndr\.com)\/[^\s"'<>)\\]+/gi;

export function extractBookingLinks(html: string): BookingLink[] {
  const seen = new Set<string>();
  const out: BookingLink[] = [];
  for (const m of html.matchAll(BOOKING_LINK_RE)) {
    const clean = m[0].replace(/&amp;/g, "&").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (seen.has(clean.toLowerCase())) continue;
    let url: URL;
    try {
      url = new URL(clean);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    // Script and asset URLs aren't links anyone books through.
    if (/\.(js|css|png|svg|jpg)$/i.test(url.pathname) || parts[0] === "assets" || parts[0] === "static") continue;
    let link: BookingLink | null = null;
    if (host.endsWith("calendly.com")) {
      if (parts.length === 0 || ["app", "event_types", "assets", "static"].includes(parts[0])) continue;
      link = { platform: "calendly", url: clean, account: parts[0], event: parts[1] };
    } else if (host.endsWith("cal.com")) {
      if (parts.length === 0 || ["docs", "blog", "pricing", "signup", "login", "embed"].includes(parts[0])) continue;
      link = { platform: "cal_com", url: clean, account: parts[0], event: parts[1] };
    } else if (host.includes("oncehub.com")) {
      link = { platform: "oncehub", url: clean, event: parts.at(-1) };
    } else if (host.includes("leadconnectorhq.com") || host.includes("msgsndr.com")) {
      if (!parts.some((p) => ["booking", "widget", "calendars"].includes(p))) continue;
      link = { platform: "ghl_calendar", url: clean, event: parts.at(-1) };
    }
    if (link) {
      seen.add(clean.toLowerCase());
      out.push(link);
    }
  }
  return out;
}

// ── Tools the site runs ───────────────────────────────────────────────────

export interface TechStack {
  /** Email/CRM tools whose tracking or forms are on the site, most likely first. */
  emailCrm: string[];
  adPixels: string[];
  analytics: string[];
  attribution: string[];
  videoPlayers: string[];
  chat: string[];
  checkout: string[];
}

const TECH_SIGNATURES: { group: keyof TechStack; id: string; pattern: RegExp }[] = [
  { group: "emailCrm", id: "hubspot", pattern: /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net|hbspt\.forms/i },
  { group: "emailCrm", id: "klaviyo", pattern: /static\.klaviyo\.com|klaviyo\.com\/onsite|_learnq/i },
  { group: "emailCrm", id: "mailchimp", pattern: /chimpstatic\.com|list-manage\.com|mc\.us\d+\.list-manage/i },
  { group: "emailCrm", id: "activecampaign", pattern: /trackcmp\.net|activehosted\.com|diffuser-cdn\.app-us1\.com/i },
  { group: "emailCrm", id: "convertkit", pattern: /convertkit\.com|ck\.page|kit\.com\/forms/i },
  { group: "emailCrm", id: "ghl", pattern: /msgsndr\.com|leadconnectorhq\.com|link\.gohighlevel/i },
  { group: "adPixels", id: "meta", pattern: /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init/i },
  { group: "adPixels", id: "google_ads", pattern: /googleadservices\.com|gtag\([^)]*['"]AW-/i },
  { group: "adPixels", id: "tiktok", pattern: /analytics\.tiktok\.com|ttq\.load/i },
  { group: "adPixels", id: "linkedin", pattern: /snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/i },
  { group: "analytics", id: "ga4", pattern: /gtag\/js\?id=G-|googletagmanager\.com\/gtag/i },
  { group: "analytics", id: "gtm", pattern: /googletagmanager\.com\/gtm\.js/i },
  { group: "analytics", id: "hotjar", pattern: /static\.hotjar\.com/i },
  { group: "analytics", id: "posthog", pattern: /posthog\.com\/static|posthog\.init/i },
  { group: "attribution", id: "hyros", pattern: /hyros\.com|\.hyros\./i },
  { group: "attribution", id: "wicked_reports", pattern: /wickedreports\.com/i },
  { group: "videoPlayers", id: "wistia", pattern: /fast\.wistia\.(net|com)|wistia_embed/i },
  { group: "videoPlayers", id: "vidalytics", pattern: /vidalytics\.com/i },
  { group: "videoPlayers", id: "vimeo", pattern: /player\.vimeo\.com/i },
  { group: "videoPlayers", id: "youtube", pattern: /youtube\.com\/embed|youtube-nocookie\.com\/embed/i },
  { group: "videoPlayers", id: "loom", pattern: /loom\.com\/embed/i },
  { group: "chat", id: "intercom", pattern: /widget\.intercom\.io|intercomSettings/i },
  { group: "chat", id: "drift", pattern: /js\.driftt\.com/i },
  { group: "chat", id: "crisp", pattern: /client\.crisp\.chat/i },
  { group: "chat", id: "tawk", pattern: /embed\.tawk\.to/i },
  { group: "checkout", id: "stripe", pattern: /js\.stripe\.com|buy\.stripe\.com|checkout\.stripe\.com/i },
  { group: "checkout", id: "whop", pattern: /whop\.com\/checkout|whop\.com\/[a-z0-9-]+\/?["']/i },
  { group: "checkout", id: "thrivecart", pattern: /thrivecart\.com/i },
  { group: "checkout", id: "samcart", pattern: /samcart\.com/i },
  { group: "checkout", id: "kajabi", pattern: /kajabi-cdn\.com|mykajabi\.com/i },
  { group: "checkout", id: "shopify", pattern: /cdn\.shopify\.com/i },
];

/** Tools found across all the pages given, each counted once per page, so
 * a tracking script on every page ranks above a one-off embed. */
export function detectTechStack(pages: string[]): TechStack {
  const hits = new Map<string, number>();
  for (const html of pages) {
    for (const sig of TECH_SIGNATURES) {
      if (sig.pattern.test(html)) hits.set(`${sig.group}:${sig.id}`, (hits.get(`${sig.group}:${sig.id}`) ?? 0) + 1);
    }
  }
  const out: TechStack = { emailCrm: [], adPixels: [], analytics: [], attribution: [], videoPlayers: [], chat: [], checkout: [] };
  for (const [key, count] of [...hits.entries()].sort((a, b) => b[1] - a[1])) {
    const [group, id] = key.split(":") as [keyof TechStack, string];
    if (count > 0) out[group].push(id);
  }
  return out;
}

// ── Contact details and brand images ─────────────────────────────────────

export interface ContactAndBrand {
  emails: string[];
  phones: string[];
  logoUrl?: string;
  ogImage?: string;
  siteName?: string;
  description?: string;
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).toString();
  } catch {
    return undefined;
  }
}

function metaContent(html: string, attr: "property" | "name", key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${key}["']`, "i");
  const m = html.match(re);
  return (m?.[1] ?? m?.[2])?.trim() || undefined;
}

export function extractContactAndBrand(html: string, baseUrl: string): ContactAndBrand {
  const emails = new Set<string>();
  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
  const phones = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)/gi)) phones.add(decodeURIComponent(m[1]).replace(/\s+/g, ""));

  const icon =
    html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*apple-touch-icon[^"']*["']/i)?.[1] ??
    html.match(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["']/i)?.[1];

  return {
    emails: [...emails].filter((e) => /@/.test(e) && !/example\.|sentry|wixpress/.test(e)).slice(0, 5),
    phones: [...phones].slice(0, 3),
    logoUrl: absolute(icon, baseUrl),
    ogImage: absolute(metaContent(html, "property", "og:image"), baseUrl),
    siteName: metaContent(html, "property", "og:site_name"),
    description: metaContent(html, "name", "description") ?? metaContent(html, "property", "og:description"),
  };
}

/** Every absolute link in a page's HTML (the crawl's own link list, when it
 * has one, is preferred; this is the fallback). */
export function linksFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"'#][^"']*)["']/gi)) {
    const abs = absolute(m[1].replace(/&amp;/g, "&"), baseUrl);
    if (abs && /^https?:/i.test(abs)) out.push(abs);
  }
  return out;
}
