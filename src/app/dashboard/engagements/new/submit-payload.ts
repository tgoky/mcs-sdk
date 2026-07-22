import type { FormData } from "./types";

export function generateEngagementId(buyerName: string): string {
  const slug = buyerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `eng_${slug}_${Date.now().toString(36)}`;
}

export function buildEngagementPayload(form: FormData) {
  const engagementId = form.engagementId || generateEngagementId(form.buyerName);

  const hostingMetaByPlatform: Record<string, Record<string, string>> = {
    webflow: {
      webflow_site_id: form.hostingWebflowSiteId,
      webflow_collection_id: form.hostingWebflowCollectionId,
    },
    wordpress: {
      wordpress_site_url: form.hostingWordpressSiteUrl,
    },
    nextjs_vercel: {
      vercel_project_name: form.hostingVercelProjectName,
      vercel_team_id: form.hostingVercelTeamId,
    },
  };

  const testimonials = form.testimonials.filter((t) => t.name && t.role && t.quote);

  const payload = {
    engagementId,
    whopUserId: "from_session",
    buyerName: form.buyerName,
    offerDetails: {
      name: form.offerName,
      price: form.offerPrice,
      icp: form.offerIcp,
      traffic_temperature: form.trafficTemperature,
      hybrid_mode_enabled: form.hybridMode,
      vertical: form.offerVertical || undefined,
    },
    stack: {
      // 1. Core Platform Selection
      booking_platform: form.bookingPlatform,
      booking_platform_credentials_ref: `secrets://${engagementId}/${form.bookingPlatform}_pat`,
      booking_standing_link: form.bookingStandingLink || undefined,
      email_platform: form.emailPlatform,
      email_platform_credentials_ref: `secrets://${engagementId}/${form.emailPlatform}_key`,
      hosting_platform: form.hostingPlatform,
      hosting_platform_credentials_ref: `secrets://${engagementId}/${form.hostingPlatform}_key`,
      publish_domain: form.publishDomain,
      hosting_platform_meta: hostingMetaByPlatform[form.hostingPlatform] ?? undefined,
      brief_landing_destination: form.briefDestination,
      slack_webhook_url: form.slackWebhookUrl,
      person_match_confidence_threshold: 99,
      buyer_domain: form.marketingDomain || undefined,
      existing_confirmation_page_url: form.existingConfirmationPageUrl || undefined,

      // 2. Flat DB Properties (Matches database schema.ts exactly)
      target_list_id: form.emailTargetListId || undefined,
      recovery_list_id: form.emailRecoveryListId || undefined,
      activecampaign_base_url: form.emailActiveCampaignBaseUrl || undefined,
      recovery_workflow_id: form.emailPlatform === "ghl" ? form.emailGhlRecoveryWorkflowId : undefined,
      target_workflow_id: form.emailPlatform === "ghl" ? form.emailGhlTargetWorkflowId : undefined,
      recovery_automation_id: form.emailPlatform === "activecampaign" ? form.recoveryAutomationId || undefined : undefined,
      long_term_nurture_list_id: form.longTermNurtureListId || undefined,

      // 3. Email Platform Nested Metadata Block (Downstream Backward Compatibility)
      email_platform_meta: {
        target_list_id: form.emailTargetListId || undefined,
        recovery_list_id: form.emailRecoveryListId || undefined,
        base_url: form.emailActiveCampaignBaseUrl || undefined,
        location_id: form.emailGhlLocationId || undefined,
        target_workflow_id: form.emailGhlTargetWorkflowId || undefined,
        recovery_workflow_id: form.emailGhlRecoveryWorkflowId || undefined,
        recovery_automation_id: form.recoveryAutomationId || undefined,
        long_term_nurture_list_id: form.longTermNurtureListId || undefined,
      },

      // 4. Booking Platform Meta (Fixes Calendly Booking + GHL Email location_id bug)
      booking_platform_meta: {
        location_id: form.bookingPlatform === "ghl_calendar"
          ? (form.bookingLocationId || undefined)
          : (form.emailPlatform === "ghl" ? form.emailGhlLocationId || undefined : undefined),
      },

      // 5. Unlisted platform auto-docs discovery triggers
      ...((form.bookingPlatform === "discover_from_docs" || form.hostingPlatform === "discover_from_docs") && {
        discovered_platform_name: form.discoveredPlatformName || undefined,
        discovered_platform_website: form.discoveredPlatformWebsite || undefined,
      }),

      // 6. Pile-On SMS Sequence Metadata
      sms_platform: form.smsPlatform,
      sms_platform_credentials_ref: form.smsPlatform !== "none" ? `secrets://${engagementId}/${form.smsPlatform}_key` : undefined,
      sms_platform_meta:
        form.smsPlatform === "twilio"
          ? {
              twilio_account_sid: form.smsTwilioAccountSid || undefined,
              twilio_messaging_service_sid: form.smsTwilioMessagingServiceSid || undefined,
              twilio_from_number: form.smsTwilioFromNumber || undefined,
            }
          : form.smsPlatform === "ghl_sms"
            ? { ghl_location_id: form.bookingLocationId || form.emailGhlLocationId || undefined }
            : undefined,
      sms_a2p_10dlc_status: form.smsPlatform === "twilio" ? form.smsA2p10dlcStatus : undefined,
      sms_compliance_footer_variant: form.smsComplianceFooterVariant,
      sms_compliance_footer_custom: form.smsComplianceFooterVariant === "custom" ? form.smsComplianceFooterCustom || undefined : undefined,

      // 7. Cohort Attribution Syncer
      ad_data_platform: form.adDataPlatform,
      ad_data_platform_credentials_ref:
        form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" ? `secrets://${engagementId}/${form.adDataPlatform}_key` : undefined,
      ad_data_cohort_id: form.adDataCohortId || undefined,
      ad_data_platform_meta:
        form.adDataPlatform === "hyros"
          ? { hyros_account_id: form.adDataHyrosAccountId || undefined }
          : form.adDataPlatform === "google_sheets"
            ? {
                google_sheets_spreadsheet_id: form.adDataGoogleSheetsSpreadsheetId || undefined,
                google_sheets_cohort_sheet_name: form.adDataGoogleSheetsSheetName || undefined,
              }
            : undefined,

      // 8. Legacy auditing flags & triggers
      existing_pile_on_sequence_flagged: form.existingPileOnSequenceFlagged || undefined,
      brief_trigger_type: form.briefTriggerType,
      brief_lead_time_hours: 12,

      // 9. Video Dropoff Analytics
      video_engagement_platform: form.videoEngagementPlatform,
      video_engagement_credentials_ref:
        form.videoEngagementPlatform !== "none" ? `secrets://${engagementId}/${form.videoEngagementPlatform}_key` : undefined,
      hero_video_id: form.heroVideoId || undefined,
      video_engagement_meta:
        form.videoEngagementPlatform !== "none"
          ? {
              wistia_video_id: form.videoEngagementWistiaVideoId || undefined,
              youtube_channel_id: form.videoEngagementYoutubeChannelId || undefined,
            }
          : undefined,

      // 10. Third-Party Data Integrations (BYOK)
      prospect_research_sources_used: form.prospectResearchSourcesUsed.length > 0 ? form.prospectResearchSourcesUsed : undefined,
      apollo_credentials_ref: form.prospectResearchSourcesUsed.includes("apollo") ? `secrets://${engagementId}/apollo_key` : undefined,
      pdl_credentials_ref: form.prospectResearchSourcesUsed.includes("pdl") ? `secrets://${engagementId}/pdl_key` : undefined,

      // 11. Win-Back Workflow Settings
      reschedule_mode: form.rescheduleMode,
      recovered_from_no_show_tagging_enabled: form.recoveredFromNoShowTaggingEnabled,
      inbound_reply_mode: form.inboundReplyMode,
      hubspot_portal_id: form.inboundReplyMode === "native" && form.emailPlatform === "hubspot" ? form.hubspotPortalId || undefined : undefined,
      // ── Leak Map recovery gap 1 — buyer-configurable, timezone-aware cadence
      weekly_summary_schedule: { dayOfWeek: form.weeklyScheduleDayOfWeek, hourLocal: form.weeklyScheduleHour, timezone: form.leakMapTimezone },
      monthly_deep_dive_schedule: { dayOfMonth: form.monthlyScheduleDayOfMonth, hourLocal: form.weeklyScheduleHour, timezone: form.leakMapTimezone },
      // ── Leak Map recovery gap 2 — report delivery format ────────────────
      audit_output_format: form.auditOutputFormat,
      leak_map_report_email: form.auditOutputFormat === "email" ? form.leakMapReportEmail || undefined : undefined,
      // ── Leak Map recovery gap 4 — existing-audit audit ──────────────────
      existing_audit_flagged: form.existingAuditFlagged || undefined,
      existing_audit_description: form.existingAuditFlagged ? form.existingAuditDescription || undefined : undefined,
      // ── Leak Map recovery gap 3 — notification pack ─────────────────────
      notification_pack_selections: form.notificationPackSelections.length > 0 ? form.notificationPackSelections : undefined,
    },
    topCallQuestions: form.topCallQuestions.split("\n").map((q) => q.trim()).filter(Boolean),
    topObjections: form.topObjections.split("\n").map((o) => o.trim()).filter(Boolean),
    prospectMeets: form.prospectMeets,
    rawVoiceCorpus: form.rawVoiceCorpus,
    existingProof: testimonials.length ? { testimonials } : undefined,
    credentials: {
      booking: form.bookingApiKey,
      email: form.emailApiKey,
      hosting: form.hostingApiKey || undefined,
      sms: form.smsPlatform !== "none" ? form.smsApiKey || undefined : undefined,
      adData: form.adDataPlatform !== "none" && form.adDataPlatform !== "native_crm" ? form.adDataApiKey || undefined : undefined,
      videoEngagement: form.videoEngagementPlatform !== "none" ? form.videoEngagementApiKey || undefined : undefined,
      apollo: form.prospectResearchSourcesUsed.includes("apollo") ? form.apolloApiKey || undefined : undefined,
      pdl: form.prospectResearchSourcesUsed.includes("pdl") ? form.pdlApiKey || undefined : undefined,
      slack_webhook_url: form.slackWebhookUrl,
    },
  };

  return payload;
}
