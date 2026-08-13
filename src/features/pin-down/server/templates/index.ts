import type { ConfirmationPageContent } from "@/lib/platforms/hosting";
import { buildPageContentModel, type PageBuilderInput, type PageContentModel } from "./content-model";
import { DEFAULT_TEMPLATE, isTemplateId, type TemplateId } from "./types";

import { buildContractHtml } from "./contract";
import { buildGoldenTicketHtml } from "./goldenticket";
import { buildTentativeHoldHtml } from "./tentativehold";
import { buildAssessmentHtml } from "./assessment";
import { buildMinimalistHtml } from "./minimalist";

export type { PageBuilderInput } from "./content-model";
export { TEMPLATE_META, TEMPLATE_IDS, DEFAULT_TEMPLATE, isTemplateId } from "./types";
export type { TemplateId, TemplateMeta } from "./types";

const BUILDERS: Record<TemplateId, (model: PageContentModel) => string> = {

  contract: buildContractHtml,
  goldenticket: buildGoldenTicketHtml,
  tentativehold: buildTentativeHoldHtml,
  assessment: buildAssessmentHtml,
  minimalist: buildMinimalistHtml,
};

/**
 * Builds the confirmation page as a single self-contained HTML document,
 * in whichever of the 5 registered designs the engagement has chosen
 * (falling back to the default for an unset/unrecognized value — e.g. an
 * engagement created before this field existed). This is what every
 * hosting adapter (Webflow CMS item, WordPress page, Vercel static
 * deploy, or the paste-ready fallback) receives — one source of truth for
 * content, platform-specific wrapping happens in hosting.ts.
 */
export function buildConfirmationPageHtml(
  input: PageBuilderInput,
  templateId?: string | null
): ConfirmationPageContent {
  const id: TemplateId = isTemplateId(templateId) ? templateId : DEFAULT_TEMPLATE;
  const model = buildPageContentModel(input);
  return { html: BUILDERS[id](model), title: model.title };
}

/** Used by the template gallery/preview UI to render every design against
 * the same sample (or in-progress-form) data, without going through the
 * hosting/deploy machinery at all. */
export function previewTemplateHtml(input: PageBuilderInput, templateId: TemplateId): string {
  const model = buildPageContentModel(input);
  return BUILDERS[templateId](model);
}
