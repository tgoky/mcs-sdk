import { Workflow } from "lucide-react";
import { ComingSoonPage } from "@/components/coming-soon-page";

export default function PlanPage() {
  return (
    <ComingSoonPage
      icon={Workflow}
      title="Plan"
      description="A workshop for planning a client's week — connectors and tools to enrich a client, generate Win-Back video scripts, and handle the other one-off asks that currently go outside the app."
      bullets={[
        "Plan a specific client's upcoming week",
        "Generate Win-Back video scripts here",
        "Connectors for whatever else the moment needs",
      ]}
    />
  );
}
