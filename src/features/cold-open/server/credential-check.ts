// src/features/cold-open/server/credential-check.ts
//
// "Am I still authenticated" probes for Cold Open's per-engagement ESP and
// Apify credentials — same real, live list-campaigns endpoints Send
// Connect's own campaign verification already depends on (see esp/*.ts),
// not new/unverified surface. Kept separate from the ESPAdapter classes
// because those resolve their own credential from the vault internally
// (see esp/base.ts's header); the credential-health cron and the
// Settings "Test" button both already have the secret resolved before
// they call in, so these take the raw secret directly and hit the
// provider once, the same shape credential-health.ts's own VALIDATORS map
// requires for every other provider.

export async function checkInstantlyCredential(secret: string): Promise<void> {
  const res = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=1", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`Instantly API ${res.status}: credential rejected`);
}

export async function checkSmartleadCredential(secret: string): Promise<void> {
  const res = await fetch(`https://server.smartlead.ai/api/v1/campaigns?api_key=${encodeURIComponent(secret)}`);
  if (!res.ok) throw new Error(`SmartLead API ${res.status}: credential rejected`);
}

export async function checkLemlistCredential(secret: string): Promise<void> {
  const token = Buffer.from(`:${secret}`).toString("base64");
  const res = await fetch("https://api.lemlist.com/api/campaigns", {
    headers: { Authorization: `Basic ${token}` },
  });
  if (!res.ok) throw new Error(`Lemlist API ${res.status}: credential rejected`);
}

export async function checkReplyIoCredential(secret: string): Promise<void> {
  const res = await fetch("https://api.reply.io/v1/campaigns", {
    headers: { "X-Api-Key": secret },
  });
  if (!res.ok) throw new Error(`Reply.io API ${res.status}: credential rejected`);
}

export async function checkApifyCredential(secret: string): Promise<void> {
  const res = await fetch("https://api.apify.com/v2/users/me", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`Apify API ${res.status}: token rejected`);
}
