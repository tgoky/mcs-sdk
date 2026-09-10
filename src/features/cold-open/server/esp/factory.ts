// src/features/cold-open/server/esp/factory.ts
import { ESPAdapter } from "./base";
import { InstantlyAdapter } from "./instantly";
import { SmartleadAdapter } from "./smartlead";
import { LemlistAdapter } from "./lemlist";
import { ReplyIoAdapter } from "./reply-io";
import type { ColdOpenSendPlatformId } from "@/models/schema";

export function createEspAdapter(engagementId: string, platform: ColdOpenSendPlatformId, cfg: { baseUrl?: string } = {}): ESPAdapter {
  switch (platform) {
    case "instantly":
      return new InstantlyAdapter(engagementId, cfg);
    case "smartlead":
      return new SmartleadAdapter(engagementId, cfg);
    case "lemlist":
      return new LemlistAdapter(engagementId, cfg);
    case "reply_io":
      return new ReplyIoAdapter(engagementId, cfg);
  }
}
