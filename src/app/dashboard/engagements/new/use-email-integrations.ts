import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { FormData, RemoteOption } from "./types";

export interface BookingOption {
  id: string;
  name: string;
  link: string;
}

/**
 * Live-fetches Klaviyo lists / ActiveCampaign lists / GHL locations & workflows / Booking calendars
 * as soon as the relevant API key is present in `form`.
 * Uses a 500ms debounce timer so fetch requests aren't wasted while typing.
 */
export function useEmailIntegrations(
  form: FormData,
  setForm: Dispatch<SetStateAction<FormData>>
) {
  // Booking Options state
  const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
  const [fetchingBookingOptions, setFetchingBookingOptions] = useState(false);
  const [bookingOptionsError, setBookingOptionsError] = useState<string | null>(null);

  // Klaviyo state
  const [klaviyoLists, setKlaviyoLists] = useState<RemoteOption[]>([]);
  const [fetchingLists, setFetchingLists] = useState(false);
  const [listsFetchError, setListsFetchError] = useState<string | null>(null);

  // ActiveCampaign state
  const [acLists, setAcLists] = useState<RemoteOption[]>([]);
  const [fetchingAcLists, setFetchingAcLists] = useState(false);
  const [acListsError, setAcListsError] = useState<string | null>(null);

  // GHL state
  const [ghlLocations, setGhlLocations] = useState<RemoteOption[]>([]);
  const [fetchingGhlLocations, setFetchingGhlLocations] = useState(false);
  const [ghlLocationsError, setGhlLocationsError] = useState<string | null>(null);
  const [ghlWorkflows, setGhlWorkflows] = useState<RemoteOption[]>([]);
  const [fetchingGhlWorkflows, setFetchingGhlWorkflows] = useState(false);
  const [ghlWorkflowsError, setGhlWorkflowsError] = useState<string | null>(null);

  // 0. GHL: mirror the single shared ghlApiKey/ghlLocationId into whichever
  // per-slot fields are currently pointed at a GHL variant. A GHL Private
  // Integration Token covers calendars, workflows, and SMS for its one
  // sub-account all at once, so there's no reason to make the user paste
  // it into 2-3 separate password fields — they fill in the shared pair
  // once in the panel credentials-step.tsx renders, and this effect keeps
  // bookingApiKey/emailApiKey/smsApiKey and bookingLocationId/
  // emailGhlLocationId (the fields the rest of the app already reads) in
  // sync with it.
  useEffect(() => {
    setForm((f) => {
      const next = { ...f };
      let changed = false;

      const wantsKey = f.bookingPlatform === "ghl_calendar" || f.emailPlatform === "ghl" || f.smsPlatform === "ghl_sms";
      const wantsLocation = f.bookingPlatform === "ghl_calendar" || f.emailPlatform === "ghl";

      if (wantsKey) {
        if (f.bookingPlatform === "ghl_calendar" && f.bookingApiKey !== f.ghlApiKey) {
          next.bookingApiKey = f.ghlApiKey;
          changed = true;
        }
        if (f.emailPlatform === "ghl" && f.emailApiKey !== f.ghlApiKey) {
          next.emailApiKey = f.ghlApiKey;
          changed = true;
        }
        if (f.smsPlatform === "ghl_sms" && f.smsApiKey !== f.ghlApiKey) {
          next.smsApiKey = f.ghlApiKey;
          changed = true;
        }
      }
      if (wantsLocation) {
        if (f.bookingPlatform === "ghl_calendar" && f.bookingLocationId !== f.ghlLocationId) {
          next.bookingLocationId = f.ghlLocationId;
          changed = true;
        }
        if (f.emailPlatform === "ghl" && f.emailGhlLocationId !== f.ghlLocationId) {
          next.emailGhlLocationId = f.ghlLocationId;
          changed = true;
        }
      }

      return changed ? next : f;
    });
  }, [
    form.ghlApiKey,
    form.ghlLocationId,
    form.bookingPlatform,
    form.emailPlatform,
    form.smsPlatform,
    setForm,
  ]);

  // 1. Booking Calendar / Event Types: Fetch active booking options (500ms Debounce)
  useEffect(() => {
    let cancelled = false;

    if (form.bookingApiKey?.trim() && form.bookingPlatform) {
      const timer = setTimeout(() => {
        setFetchingBookingOptions(true);
        setBookingOptionsError(null);

        fetch(`/api/integrations/booking/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: form.bookingPlatform,
            apiKey: form.bookingApiKey.trim(),
            locationId: form.bookingLocationId || form.emailGhlLocationId,
          }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `Booking options request failed [${res.status}]`);
            }
            return data;
          })
          .then((data) => {
            if (cancelled) return;
            if (data.success) {
              setBookingOptions(data.options ?? []);
            } else {
              throw new Error(data.error ?? "Failed to fetch booking options");
            }
          })
          .catch((err: any) => {
            if (cancelled) return;
            console.error("[useEmailIntegrations] booking options fetch error:", err);
            setBookingOptionsError(err.message || "Could not retrieve booking calendars.");
          })
          .finally(() => {
            if (!cancelled) setFetchingBookingOptions(false);
          });
      }, 500);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setBookingOptions([]);
      setBookingOptionsError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    form.bookingPlatform,
    form.bookingApiKey,
    form.bookingLocationId,
    form.emailGhlLocationId,
  ]);

  // 2. Klaviyo: Fetch lists (500ms Debounce)
  useEffect(() => {
    let cancelled = false;

    if (form.emailPlatform === "klaviyo" && form.emailApiKey?.trim()) {
      const timer = setTimeout(() => {
        setFetchingLists(true);
        setListsFetchError(null);

        fetch(`/api/integrations/klaviyo/lists`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: form.emailApiKey.trim() }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `Klaviyo request failed [${res.status}]`);
            }
            return data;
          })
          .then((data) => {
            if (cancelled) return;
            if (data.success) {
              setKlaviyoLists(data.lists ?? []);
            } else {
              throw new Error(data.error ?? "API Resolution anomaly");
            }
          })
          .catch((err: any) => {
            if (cancelled) return;
            console.error("[useEmailIntegrations] klaviyo fetch error:", err);
            setListsFetchError(err.message || "Could not retrieve profiles from Klaviyo. Please check your token scopes.");
          })
          .finally(() => {
            if (!cancelled) setFetchingLists(false);
          });
      }, 500);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setKlaviyoLists([]);
      setListsFetchError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [form.emailPlatform, form.emailApiKey]);

  // 3. ActiveCampaign: Fetch lists when base URL is provided (500ms Debounce)
  useEffect(() => {
    let cancelled = false;

    if (
      form.emailPlatform === "activecampaign" &&
      form.emailApiKey?.trim() &&
      form.emailActiveCampaignBaseUrl?.trim()
    ) {
      const timer = setTimeout(() => {
        setFetchingAcLists(true);
        setAcListsError(null);

        fetch(`/api/integrations/activecampaign/lists`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: form.emailApiKey.trim(),
            baseUrl: form.emailActiveCampaignBaseUrl.trim(),
          }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `ActiveCampaign request failed [${res.status}]`);
            }
            return data;
          })
          .then((data) => {
            if (cancelled) return;
            if (data.success) {
              setAcLists(data.lists ?? []);
            } else {
              throw new Error(data.error ?? "Unknown error");
            }
          })
          .catch((err: any) => {
            if (cancelled) return;
            console.error("[useEmailIntegrations] activecampaign fetch error:", err);
            setAcListsError(err.message || "Could not retrieve ActiveCampaign lists.");
          })
          .finally(() => {
            if (!cancelled) setFetchingAcLists(false);
          });
      }, 500);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setAcLists([]);
      setAcListsError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [form.emailPlatform, form.emailApiKey, form.emailActiveCampaignBaseUrl]);

  // 4. Custom SMTP: Compose JSON credential blob into emailApiKey
  useEffect(() => {
    if (form.emailPlatform !== "smtp") return;
    const required = [form.smtpHost, form.smtpPort, form.smtpUsername, form.smtpPassword, form.smtpFromAddress];
    if (required.some((v) => !v?.trim())) {
      if (form.emailApiKey) setForm((f) => ({ ...f, emailApiKey: "" }));
      return;
    }
    const blob = JSON.stringify({
      host: form.smtpHost.trim(),
      port: Number(form.smtpPort),
      secure: form.smtpSecure,
      username: form.smtpUsername.trim(),
      password: form.smtpPassword,
      fromAddress: form.smtpFromAddress.trim(),
      fromName: form.smtpFromName?.trim() || undefined,
    });
    if (blob !== form.emailApiKey) setForm((f) => ({ ...f, emailApiKey: blob }));
  }, [
    form.emailPlatform,
    form.smtpHost,
    form.smtpPort,
    form.smtpSecure,
    form.smtpUsername,
    form.smtpPassword,
    form.smtpFromAddress,
    form.smtpFromName,
    form.emailApiKey,
    setForm,
  ]);

  // 5. GHL: Verify the shared Location ID against the shared API key
  // (500ms Debounce). There's nothing to list here — a Private Integration
  // Token only ever sees the one sub-account it was created in — so this
  // just confirms the ID the user typed is a real location that token can
  // reach, and surfaces its name back so they know it matched.
  useEffect(() => {
    let cancelled = false;
    const needsGhl = form.bookingPlatform === "ghl_calendar" || form.emailPlatform === "ghl";
    if (needsGhl && form.ghlApiKey?.trim() && form.ghlLocationId?.trim()) {
      const timer = setTimeout(() => {
        setFetchingGhlLocations(true);
        setGhlLocationsError(null);
        setGhlWorkflows([]);
        setForm((f) => ({ ...f, emailGhlTargetWorkflowId: "", emailGhlRecoveryWorkflowId: "" }));

        fetch(`/api/integrations/ghl/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: form.ghlApiKey.trim(), locationId: form.ghlLocationId.trim() }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `GHL request failed [${res.status}]`);
            }
            return data;
          })
          .then((data) => {
            if (cancelled) return;
            if (data.success) {
              setGhlLocations(data.location ? [data.location] : []);
            } else {
              throw new Error(data.error ?? "Unknown error");
            }
          })
          .catch((err: any) => {
            if (cancelled) return;
            console.error("[useEmailIntegrations] ghl location verify error:", err);
            setGhlLocationsError(err.message || "Could not verify this Location ID against your key.");
            setGhlLocations([]);
          })
          .finally(() => {
            if (!cancelled) setFetchingGhlLocations(false);
          });
      }, 500);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setGhlLocations([]);
      setGhlLocationsError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [form.bookingPlatform, form.emailPlatform, form.ghlApiKey, form.ghlLocationId, setForm]);

  // 6. GHL: Fetch workflows once the location above is verified
  useEffect(() => {
    let cancelled = false;

    if (
      form.emailPlatform === "ghl" &&
      form.emailGhlLocationId &&
      form.emailApiKey?.trim() &&
      ghlLocations.length > 0
    ) {
      setFetchingGhlWorkflows(true);
      setGhlWorkflowsError(null);

      fetch(`/api/integrations/ghl/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.emailApiKey.trim(),
          locationId: form.emailGhlLocationId,
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error || `GHL request failed [${res.status}]`);
          }
          return data;
        })
        .then((data) => {
          if (cancelled) return;
          if (data.success) {
            setGhlWorkflows(data.workflows ?? []);
          } else {
            throw new Error(data.error ?? "Unknown error");
          }
        })
        .catch((err: any) => {
          if (cancelled) return;
          console.error("[useEmailIntegrations] ghl workflows fetch error:", err);
          setGhlWorkflowsError(err.message || "Could not retrieve GHL workflows.");
        })
        .finally(() => {
          if (!cancelled) setFetchingGhlWorkflows(false);
        });
    } else {
      setGhlWorkflows([]);
      setGhlWorkflowsError(null);
    }

    return () => {
      cancelled = true;
    };
  }, [form.emailPlatform, form.emailGhlLocationId, form.emailApiKey, ghlLocations]);

  // "Start over" needs to wipe this too. The five fetch effects above are
  // reactive to form fields and do clear themselves once those fields go
  // back to their defaults, but a request already in flight at the moment
  // of reset would still land afterward and repopulate a list right after
  // it was cleared (fixed above with `cancelled` guards) — this gives
  // "Start over" an immediate, explicit clear on top of that so nothing
  // sits stale even for the one render before the effects catch up.
  function resetIntegrations() {
    setBookingOptions([]);
    setFetchingBookingOptions(false);
    setBookingOptionsError(null);
    setKlaviyoLists([]);
    setFetchingLists(false);
    setListsFetchError(null);
    setAcLists([]);
    setFetchingAcLists(false);
    setAcListsError(null);
    setGhlLocations([]);
    setFetchingGhlLocations(false);
    setGhlLocationsError(null);
    setGhlWorkflows([]);
    setFetchingGhlWorkflows(false);
    setGhlWorkflowsError(null);
  }

  const klaviyoMissingKeyMessage =
    form.emailPlatform === "klaviyo" && !form.emailApiKey?.trim()
      ? "Enter your Klaviyo API key above to load your lists."
      : null;

  return {
    // Booking Integrations
    bookingOptions,
    fetchingBookingOptions,
    bookingOptionsError,

    // Klaviyo
    klaviyoLists,
    fetchingLists,
    listsFetchError,
    klaviyoMissingKeyMessage,

    // ActiveCampaign
    acLists,
    fetchingAcLists,
    acListsError,

    // GHL
    ghlLocations,
    fetchingGhlLocations,
    ghlLocationsError,
    ghlWorkflows,
    fetchingGhlWorkflows,
    ghlWorkflowsError,

    resetIntegrations,
  };
}