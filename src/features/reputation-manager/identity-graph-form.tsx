"use client";

import { InputField, TextAreaField } from "@/app/dashboard/engagements/new/form-fields";
import { Plus, Trash2 } from "lucide-react";
import type { RepEntity, RepCompetitor, RepCollision } from "@/models/schema";

/**
 * Everything rep-onboarding's form needs to hold, in the shape the save
 * endpoint (RepIntakeInput in onboarding-service.ts) expects — this is
 * the client-side mirror of that type, list fields kept as newline-
 * separated strings here and split on submit rather than needing a
 * separate tag-input component for each one.
 *
 * offerings deliberately not in this v1 form: onboarding-service.ts's
 * own validation requires each offering's parentEntityName to match a
 * real entity, which needs the entities list to exist and be selectable
 * from first — real, buildable, just its own follow-up rather than
 * something to rush into this pass. saveRepIdentityGraphIntake already
 * accepts an empty offerings array with no validation error, so leaving
 * it out here doesn't block anything else.
 */
export type IdentityGraphFormState = {
  operatorName: string;
  soleAuthorityName: string;
  operatorAliases: string; // newline-separated
  operatorDomains: string; // newline-separated
  operatorEmailContacts: string; // newline-separated
  operatorHandles: string; // "platform: handle" per line
  trustedSources: string; // newline-separated
  seedPanelPrompts: string; // newline-separated
  crisisThresholdOverride: string; // numeric string, "" means unset
  entities: RepEntity[];
  competitors: RepCompetitor[];
  collisions: RepCollision[];
};

export const EMPTY_IDENTITY_GRAPH_FORM: IdentityGraphFormState = {
  operatorName: "",
  soleAuthorityName: "",
  operatorAliases: "",
  operatorDomains: "",
  operatorEmailContacts: "",
  operatorHandles: "",
  trustedSources: "",
  seedPanelPrompts: "",
  crisisThresholdOverride: "",
  entities: [],
  competitors: [],
  collisions: [],
};

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseHandles(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of splitLines(value)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const platform = line.slice(0, idx).trim();
    const handle = line.slice(idx + 1).trim();
    if (platform && handle) result[platform] = handle;
  }
  return result;
}

function formatHandles(handles: Record<string, string>): string {
  return Object.entries(handles)
    .map(([platform, handle]) => `${platform}: ${handle}`)
    .join("\n");
}

/** Converts the form's editable state into exactly the payload
 * POST /api/engagements/[id]/bridges/rep-onboarding (and the fresh-start
 * equivalent) expects. */
export function toIntakePayload(form: IdentityGraphFormState) {
  return {
    operatorName: form.operatorName.trim(),
    soleAuthorityName: form.soleAuthorityName.trim(),
    operatorAliases: splitLines(form.operatorAliases),
    operatorDomains: splitLines(form.operatorDomains),
    operatorEmailContacts: splitLines(form.operatorEmailContacts),
    operatorHandles: parseHandles(form.operatorHandles),
    trustedSources: splitLines(form.trustedSources),
    seedPanelPrompts: splitLines(form.seedPanelPrompts),
    crisisThresholdOverride: form.crisisThresholdOverride.trim() ? Number(form.crisisThresholdOverride.trim()) : null,
    entities: form.entities,
    offerings: [],
    competitors: form.competitors,
    collisions: form.collisions,
  };
}

/** Converts a saved graph (from the GET endpoint) back into editable form
 * state — the inverse of toIntakePayload, for prefilling an existing
 * engagement's form. */
export function fromSavedGraph(graph: {
  operatorName: string;
  operatorAliases: string[];
  operatorHandles: Record<string, string>;
  operatorDomains: string[];
  operatorEmailContacts: string[];
  entities: RepEntity[];
  competitors: RepCompetitor[];
  collisions: (RepCollision & { source: "buyer" | "collision_check" })[];
  trustedSources: string[];
  seedPanelPrompts: string[];
  soleAuthorityName: string;
  crisisThresholdOverride: number | null;
}): IdentityGraphFormState {
  return {
    operatorName: graph.operatorName,
    soleAuthorityName: graph.soleAuthorityName,
    operatorAliases: graph.operatorAliases.join("\n"),
    operatorDomains: graph.operatorDomains.join("\n"),
    operatorEmailContacts: graph.operatorEmailContacts.join("\n"),
    operatorHandles: formatHandles(graph.operatorHandles),
    trustedSources: graph.trustedSources.join("\n"),
    seedPanelPrompts: graph.seedPanelPrompts.join("\n"),
    crisisThresholdOverride: graph.crisisThresholdOverride != null ? String(graph.crisisThresholdOverride) : "",
    entities: graph.entities,
    // collision_check-sourced entries are shown read-only lower in the
    // form (see IdentityGraphForm's collisions section) rather than
    // mixed into the editable buyer list — re-submitting the form only
    // ever replaces the buyer's own entries (saveRepIdentityGraphIntake's
    // "replace_buyer_entries" merge mode), so editable state should only
    // ever hold what the buyer actually owns.
    collisions: graph.collisions
      .filter((c) => c.source === "buyer")
      .map(({ name, whoTheyAre, disambiguationNote }) => ({ name, whoTheyAre, disambiguationNote })),
    competitors: graph.competitors,
  };
}

const ENTITY_TYPES: RepEntity["type"][] = ["company", "brand", "product", "service", "publication"];

function RepeatingGroupHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{title}</label>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
      >
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer shrink-0"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

export function IdentityGraphForm({
  form,
  onChange,
  readOnlyCollisions,
}: {
  form: IdentityGraphFormState;
  onChange: (next: IdentityGraphFormState) => void;
  /** collision_check-sourced entries — the collision pass's own finds,
   * shown for visibility but not editable here since re-submitting this
   * form never touches them (see fromSavedGraph's comment). Empty until
   * rep-onboarding has actually run once for this engagement. */
  readOnlyCollisions?: (RepCollision & { source: "collision_check" })[];
}) {
  function set<K extends keyof IdentityGraphFormState>(key: K, value: IdentityGraphFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          Operator
        </h2>
        <InputField
          label="Operator name"
          required
          value={form.operatorName}
          onChange={(v) => set("operatorName", v)}
          placeholder="Marvo Roofing Co."
          helpText="The name every downstream monitor and prompt panel is built around."
        />
        <InputField
          label="Sole authority"
          required
          value={form.soleAuthorityName}
          onChange={(v) => set("soleAuthorityName", v)}
          placeholder="Full name of the one person who can declare a crisis or approve a public response"
          helpText="Reputation Manager never publishes or approves anything on its own — this is who it always defers to."
        />
        <TextAreaField
          label="Aliases"
          value={form.operatorAliases}
          onChange={(v) => set("operatorAliases", v)}
          placeholder={"Marvo\nMarvo Roofing\nMarvo Co"}
          rows={2}
          helpText="One per line. Other names AI engines or reviewers might use for this operator."
        />
        <TextAreaField
          label="Domains"
          value={form.operatorDomains}
          onChange={(v) => set("operatorDomains", v)}
          placeholder={"marvoroofing.com"}
          rows={2}
        />
        <TextAreaField
          label="Handles"
          value={form.operatorHandles}
          onChange={(v) => set("operatorHandles", v)}
          placeholder={"x: @marvoroofing\nlinkedin: /company/marvo-roofing"}
          rows={2}
          helpText={'One per line, as "platform: handle".'}
        />
        <TextAreaField
          label="Email contacts"
          value={form.operatorEmailContacts}
          onChange={(v) => set("operatorEmailContacts", v)}
          placeholder={"hello@marvoroofing.com"}
          rows={2}
        />
      </div>

      <div className="space-y-3">
        <RepeatingGroupHeader
          title="Entities"
          onAdd={() =>
            set("entities", [
              ...form.entities,
              { name: "", aliases: [], type: "company", domainsOwned: [], handles: {}, highPriority: false },
            ])
          }
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 -mt-2">
          Companies, brands, products, or publications this operator is publicly associated with.
        </p>
        <div className="space-y-2">
          {form.entities.map((entity, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <input
                  value={entity.name}
                  onChange={(e) => {
                    const next = [...form.entities];
                    next[i] = { ...entity, name: e.target.value };
                    set("entities", next);
                  }}
                  placeholder="Entity name"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
                <select
                  value={entity.type}
                  onChange={(e) => {
                    const next = [...form.entities];
                    next[i] = { ...entity, type: e.target.value as RepEntity["type"] };
                    set("entities", next);
                  }}
                  className="bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-200 shadow-xs"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={entity.highPriority}
                    onChange={(e) => {
                      const next = [...form.entities];
                      next[i] = { ...entity, highPriority: e.target.checked };
                      set("entities", next);
                    }}
                  />
                  High priority
                </label>
              </div>
              <RemoveRowButton onClick={() => set("entities", form.entities.filter((_, j) => j !== i))} />
            </div>
          ))}
          {form.entities.length === 0 && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">None added yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <RepeatingGroupHeader
          title="Competitors"
          onAdd={() => set("competitors", [...form.competitors, { name: "", monitorFor: [], highPriority: false }])}
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 -mt-2">
          The 3 to 7 competitors prospects actually compare this operator against — not every company in the category.
        </p>
        <div className="space-y-2">
          {form.competitors.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input
                  value={c.name}
                  onChange={(e) => {
                    const next = [...form.competitors];
                    next[i] = { ...c, name: e.target.value };
                    set("competitors", next);
                  }}
                  placeholder="Competitor name"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
                <input
                  value={c.monitorFor.join(", ")}
                  onChange={(e) => {
                    const next = [...form.competitors];
                    next[i] = {
                      ...c,
                      monitorFor: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    };
                    set("competitors", next);
                  }}
                  placeholder="Monitor for (comma-separated)"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={c.highPriority}
                    onChange={(e) => {
                      const next = [...form.competitors];
                      next[i] = { ...c, highPriority: e.target.checked };
                      set("competitors", next);
                    }}
                  />
                  High priority
                </label>
              </div>
              <RemoveRowButton onClick={() => set("competitors", form.competitors.filter((_, j) => j !== i))} />
            </div>
          ))}
          {form.competitors.length === 0 && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">None added yet.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <RepeatingGroupHeader
          title="Same-name collisions"
          onAdd={() => set("collisions", [...form.collisions, { name: "", whoTheyAre: "", disambiguationNote: "" }])}
        />
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 -mt-2">
          Other real people or companies sharing this name that AI engines could confuse with the operator. A
          one-time search for anything missed here runs automatically the first time this form is saved.
        </p>
        <div className="space-y-2">
          {form.collisions.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <div className="flex-1 space-y-2">
                <input
                  value={c.name}
                  onChange={(e) => {
                    const next = [...form.collisions];
                    next[i] = { ...c, name: e.target.value };
                    set("collisions", next);
                  }}
                  placeholder="Their name"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
                <input
                  value={c.whoTheyAre}
                  onChange={(e) => {
                    const next = [...form.collisions];
                    next[i] = { ...c, whoTheyAre: e.target.value };
                    set("collisions", next);
                  }}
                  placeholder="Who they actually are"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
                <input
                  value={c.disambiguationNote}
                  onChange={(e) => {
                    const next = [...form.collisions];
                    next[i] = { ...c, disambiguationNote: e.target.value };
                    set("collisions", next);
                  }}
                  placeholder="What distinguishes them from the operator"
                  className="w-full bg-background border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-xs"
                />
              </div>
              <RemoveRowButton onClick={() => set("collisions", form.collisions.filter((_, j) => j !== i))} />
            </div>
          ))}
          {form.collisions.length === 0 && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-600 italic">None added yet.</p>
          )}
        </div>

        {readOnlyCollisions && readOnlyCollisions.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Found automatically — not editable here:</p>
            {readOnlyCollisions.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-[11px] text-zinc-500 dark:text-zinc-400"
              >
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">{c.name}</span> — {c.whoTheyAre}. {c.disambiguationNote}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          Sources & panel
        </h2>
        <TextAreaField
          label="Trusted sources"
          value={form.trustedSources}
          onChange={(v) => set("trustedSources", v)}
          placeholder={"g2.com\ncapterra.com"}
          rows={2}
        />
        <TextAreaField
          label="Seed AI-engine prompts"
          value={form.seedPanelPrompts}
          onChange={(v) => set("seedPanelPrompts", v)}
          placeholder={"Who is Marvo Roofing?\nIs Marvo Roofing legit?"}
          rows={3}
          helpText="5-8 starting prompts. Expanded into the full monitoring panel by a future skill — this just seeds it."
        />
        <InputField
          label="Crisis threshold override"
          value={form.crisisThresholdOverride}
          onChange={(v) => set("crisisThresholdOverride", v)}
          placeholder="Leave blank to use the shared default (80)"
          type="number"
        />
      </div>
    </div>
  );
}
