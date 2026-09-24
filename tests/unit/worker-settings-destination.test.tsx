import { describe, it, expect } from "vitest";
import { hasWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { WORKER_IDS, workerSettingsFormId, workerSettingsHref } from "@/lib/worker-registry";

// The Library's gear either opens a skill's settings in place or links to
// them. It used to link skills with no form of their own to their own page,
// which for Pile-On was the same place clicking the skill goes (settings
// still behind the page's own gear), and for the rest a findings page or
// console with no settings on it.
describe("worker settings destination", () => {
  it("gives every skill somewhere its settings actually are", () => {
    for (const id of WORKER_IDS) {
      const formId = workerSettingsFormId(id);
      if (formId) {
        expect(hasWorkerConfigForm(formId), `${id} -> ${formId}`).toBe(true);
      } else {
        expect(workerSettingsHref(id, "eng_1"), id).toBe(`/dashboard/engagements/eng_1/skills/${id}?configure=1`);
      }
    }
  });
});
