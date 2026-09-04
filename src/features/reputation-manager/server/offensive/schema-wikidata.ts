import type { RepEntity, RepHandleMap, RepOffering, RepCollision } from "@/models/schema";

/**
 * Move A — Schema.org JSON-LD + Wikidata (offensive/schema-wikidata.md).
 *
 * Both functions here only GENERATE — the deploy steps (pasting the JSON-LD
 * into a <head>, running the Rich Results Test, creating the actual
 * Wikidata item) stay manual, tracked via checklist.ts's "a" items. There
 * is deliberately no "publish" button: Wikidata submission requires a human
 * account and human judgment on borderline statements, and a site's <head>
 * is the operator's to edit, not this app's.
 */

export type SchemaGraphInput = {
  operatorName: string;
  operatorAliases: string[];
  operatorHandles: RepHandleMap;
  operatorDomains: string[];
  entities: RepEntity[];
  offerings: RepOffering[];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "entity";
}

function withScheme(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

/** Best-effort platform handle -> profile URL. Platforms not in this map,
 * or a handle that's already a full URL, pass through as-is (or get
 * dropped if neither applies) — better to omit a sameAs entry than to
 * emit a broken one. */
function handleToUrl(platform: string, handle: string): string | null {
  const h = handle.trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;

  const key = platform.trim().toLowerCase();
  const bare = h.replace(/^@/, "");

  switch (key) {
    case "x":
    case "twitter":
      return `https://x.com/${bare}`;
    case "linkedin":
      return `https://linkedin.com${h.startsWith("/") ? h : `/${h}`}`;
    case "youtube":
      return `https://youtube.com/${h.startsWith("@") ? h : `@${bare}`}`;
    case "reddit":
      return `https://reddit.com/user/${bare}`;
    case "instagram":
      return `https://instagram.com/${bare}`;
    case "tiktok":
      return `https://tiktok.com/@${bare}`;
    case "facebook":
      return `https://facebook.com/${bare}`;
    default:
      return null;
  }
}

function sameAsFromHandles(handles: RepHandleMap): string[] {
  return Object.entries(handles)
    .map(([platform, handle]) => handleToUrl(platform, handle))
    .filter((url): url is string => url !== null);
}

function schemaTypeForEntity(type: RepEntity["type"]): "Organization" | "Product" {
  return type === "product" || type === "service" ? "Product" : "Organization";
}

/**
 * Builds the @graph JSON-LD document: one Person node for the operator,
 * one node per entity (Organization or Product depending on
 * RepEntity.type), and one Product node per offering — cross-linked via
 * founder/worksFor and brand/manufacturer, matching the template's
 * Organization + Person + Product block structure.
 */
export function generateSchemaJsonLd(input: SchemaGraphInput): object {
  const personId = "#person";
  const entityNodes = input.entities.map((entity) => ({ entity, id: `#${slugify(entity.name)}` }));
  const primaryEntity = entityNodes.find((e) => e.entity.highPriority) ?? entityNodes[0] ?? null;

  const personNode: Record<string, unknown> = {
    "@type": "Person",
    "@id": personId,
    name: input.operatorName,
    ...(input.operatorAliases.length > 0 ? { alternateName: input.operatorAliases } : {}),
    ...(input.operatorDomains.length > 0 ? { url: withScheme(input.operatorDomains[0]) } : {}),
    ...(sameAsFromHandles(input.operatorHandles).length > 0 ? { sameAs: sameAsFromHandles(input.operatorHandles) } : {}),
    ...(primaryEntity ? { worksFor: { "@id": primaryEntity.id } } : {}),
  };

  const orgOrProductNodes = entityNodes.map(({ entity, id }) => {
    const type = schemaTypeForEntity(entity.type);
    const node: Record<string, unknown> = {
      "@type": type,
      "@id": id,
      name: entity.name,
      ...(entity.aliases.length > 0 ? { alternateName: entity.aliases } : {}),
      ...(entity.domainsOwned.length > 0 ? { url: withScheme(entity.domainsOwned[0]) } : {}),
      ...(sameAsFromHandles(entity.handles).length > 0 ? { sameAs: sameAsFromHandles(entity.handles) } : {}),
    };
    if (type === "Organization") {
      node.founder = { "@id": personId };
    } else if (primaryEntity && primaryEntity.id !== id) {
      node.brand = { "@id": primaryEntity.id };
      node.manufacturer = { "@id": primaryEntity.id };
    }
    return node;
  });

  const offeringNodes = input.offerings.map((offering) => {
    const parent = entityNodes.find((e) => e.entity.name === offering.parentEntityName);
    return {
      "@type": "Product",
      "@id": `#${slugify(offering.name)}`,
      name: offering.name,
      ...(offering.aliases.length > 0 ? { alternateName: offering.aliases } : {}),
      ...(offering.surfaces.length > 0 ? { url: withScheme(offering.surfaces[0]) } : {}),
      ...(parent ? { brand: { "@id": parent.id }, manufacturer: { "@id": parent.id } } : {}),
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [personNode, ...orgOrProductNodes, ...offeringNodes],
  };
}

export interface WikidataStatement {
  property: string;
  label: string;
  value: string;
  needsManualInput: boolean;
  referenceUrl: string | null;
  note?: string;
}

/**
 * The Wikidata statements table from the template's P-code list, pre-filled
 * with whatever the identity graph already knows and flagged
 * needsManualInput everywhere it doesn't (gender, citizenship, occupation,
 * work-period-start — none of which this app collects, correctly, since
 * they're not reputation-monitoring inputs). Every statement still needs
 * its own P854 reference URL + P813 retrieved-date at submission time per
 * the template; referenceUrl here is a suggested source, not a substitute
 * for that step.
 */
export function generateWikidataStatements(input: {
  operatorDomains: string[];
  operatorHandles: RepHandleMap;
  entities: RepEntity[];
  collisions: RepCollision[];
}): WikidataStatement[] {
  const officialSite = input.operatorDomains[0] ? withScheme(input.operatorDomains[0]) : null;
  const founderOf = input.entities.map((e) => e.name).join(", ") || null;

  const handleStatement = (platform: string, property: string, label: string): WikidataStatement => {
    const raw = input.operatorHandles[platform];
    const url = raw ? handleToUrl(platform, raw) : null;
    return {
      property,
      label,
      value: url ?? "",
      needsManualInput: !url,
      referenceUrl: url,
    };
  };

  const statements: WikidataStatement[] = [
    { property: "P31", label: "instance of", value: "human (Q5)", needsManualInput: false, referenceUrl: null },
    { property: "P21", label: "sex or gender", value: "", needsManualInput: true, referenceUrl: null },
    { property: "P27", label: "country of citizenship", value: "", needsManualInput: true, referenceUrl: null },
    { property: "P106", label: "occupation", value: "", needsManualInput: true, referenceUrl: null, note: "Add two occupation statements per the template." },
    { property: "P101", label: "field of work", value: "", needsManualInput: true, referenceUrl: null },
    { property: "P735", label: "given name", value: "", needsManualInput: true, referenceUrl: null },
    {
      property: "P856",
      label: "official website",
      value: officialSite ?? "",
      needsManualInput: !officialSite,
      referenceUrl: officialSite,
    },
    handleStatement("x", "P2002", "Twitter username"),
    handleStatement("linkedin", "P6634", "LinkedIn personal profile ID"),
    handleStatement("youtube", "P2397", "YouTube channel ID"),
    handleStatement("reddit", "P4265", "Reddit username"),
    {
      property: "P112",
      label: "founded by (as founder of)",
      value: founderOf ?? "",
      needsManualInput: !founderOf,
      referenceUrl: null,
    },
    { property: "P2031", label: "work period (start)", value: "", needsManualInput: true, referenceUrl: null },
  ];

  for (const collision of input.collisions) {
    statements.push({
      property: "P1889",
      label: `different from (${collision.name})`,
      value: collision.disambiguationNote,
      needsManualInput: false,
      referenceUrl: null,
      note: `Who they are: ${collision.whoTheyAre}`,
    });
  }

  return statements;
}
