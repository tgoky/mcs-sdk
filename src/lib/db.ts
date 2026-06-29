// src/lib/db.ts
// COMPLETELY OFFLINE CONCURRENCY-SAFE MOCK ENGINE FOR FRONTEND UI DESIGN

const mockEngagements = [
  {
    id: "1",
    engagementId: "eng_acme_corp_001",
    buyer: "OCSB Enterprise Group",
    createdAt: new Date(),
    stack: { booking_platform: "calendly", email_platform: "klaviyo" }
  },
  {
    id: "2",
    engagementId: "eng_hyper_growth_002",
    buyer: "HyperGrowth Labs",
    createdAt: new Date(),
    stack: { booking_platform: "cal_com", email_platform: "activecampaign" }
  }
];

const mockSkillRuns = [
  { id: "r1", skillName: "pin-down", phase: "redirect_config", status: "success", costInCents: 4500, startedAt: new Date() },
  { id: "r2", skillName: "pile-on", phase: "hybrid_synthesis", status: "running", costInCents: 1200, startedAt: new Date() },
  { id: "r3", skillName: "pre-call-read", phase: "brief_synthesis", status: "success", costInCents: 1550, startedAt: new Date() },
  { id: "r4", skillName: "leak-map", phase: "stage_5_report", status: "failed", costInCents: 3000, startedAt: new Date() }
];

const mockAlerts = [
  { id: "a1", severity: "critical", metricName: "person_match_confidence", threshold: "99", comparison: "below" }
];

const mockBriefs = [
  { id: "b1", prospectName: "Sarah Jenkins", callTime: new Date(), createdAt: new Date(), destinationDelivered: "slack", personMatchScore: 99 },
  { id: "b2", prospectName: "Michael Chang", callTime: new Date(), createdAt: new Date(), destinationDelivered: "crm_note", personMatchScore: 95 }
];

const mockAudits = [
  {
    id: "au1",
    runType: "weekly",
    createdAt: new Date(),
    topIssues: [
      { name: "Identity match accuracy", delta: -14.2, severity: "high" },
      { name: "Booking show-rate (%)", delta: 5.1, severity: "none" }
    ]
  }
];

function createMockChain(initialTable = "") {
  let currentTable = initialTable;

  const resolveData = () => {
    const t = currentTable.toLowerCase();
    
    // CRITICAL FIX: Match the explicit table names cleanly before checking broad substrings
    if (t.includes("skill_runs") || t.includes("skillname")) return mockSkillRuns;
    if (t.includes("active_alerts") || t.includes("metricname")) return mockAlerts;
    if (t.includes("briefed_calls") || t.includes("prospectname")) return mockBriefs;
    if (t.includes("audit_runs")) return mockAudits;
    if (t.includes("engagement")) return mockEngagements;
    
    return [];
  };

  const chainInstance: any = () => Promise.resolve(resolveData());

  const methods = ["select", "where", "orderBy", "limit", "innerJoin", "leftJoin", "insert", "values", "onConflictDoNothing", "onConflictDoUpdate", "set"];
  methods.forEach(m => {
    chainInstance[m] = () => chainInstance;
  });

  chainInstance.from = (tableObj: any) => {
    let tableName = "";
    if (tableObj) {
      tableName = tableObj?._?.name || tableObj?.config?.name || "";
      if (!tableName && typeof tableObj === "object") {
        try {
          const symbols = Object.getOwnPropertySymbols(tableObj);
          for (const sym of symbols) {
            if (sym.description?.includes("Name") || sym.description?.includes("drizzle")) {
              tableName += "_" + String(tableObj[sym]);
            }
          }
          tableName += "_" + Object.keys(tableObj).join("_");
        } catch {}
      }
    }
    currentTable = tableName;
    return chainInstance;
  };

  chainInstance.then = (onfulfilled: any) => {
    return Promise.resolve(resolveData()).then(onfulfilled);
  };

  return chainInstance;
}

export const db = {
  select: () => createMockChain(),
  insert: () => createMockChain(),
  update: () => createMockChain(),
  delete: () => createMockChain(),
};