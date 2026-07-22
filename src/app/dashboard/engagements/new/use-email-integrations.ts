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

  // 1. Booking Calendar / Event Types: Fetch active booking options (500ms Debounce)
  useEffect(() => {
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
            if (data.success) {
              setBookingOptions(data.options ?? []);
            } else {
              throw new Error(data.error ?? "Failed to fetch booking options");
            }
          })
          .catch((err: any) => {
            console.error("[useEmailIntegrations] booking options fetch error:", err);
            setBookingOptionsError(err.message || "Could not retrieve booking calendars.");
          })
          .finally(() => {
            setFetchingBookingOptions(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setBookingOptions([]);
    }
  }, [
    form.bookingPlatform,
    form.bookingApiKey,
    form.bookingLocationId,
    form.emailGhlLocationId,
  ]);

  // 2. Klaviyo: Fetch lists (500ms Debounce)
  useEffect(() => {
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
            if (data.success) {
              setKlaviyoLists(data.lists ?? []);
            } else {
              throw new Error(data.error ?? "API Resolution anomaly");
            }
          })
          .catch((err: any) => {
            console.error("[useEmailIntegrations] klaviyo fetch error:", err);
            setListsFetchError(err.message || "Could not retrieve profiles from Klaviyo. Please check your token scopes.");
          })
          .finally(() => {
            setFetchingLists(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setKlaviyoLists([]);
    }
  }, [form.emailPlatform, form.emailApiKey]);

  // 3. ActiveCampaign: Fetch lists when base URL is provided (500ms Debounce)
  useEffect(() => {
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
            if (data.success) {
              setAcLists(data.lists ?? []);
            } else {
              throw new Error(data.error ?? "Unknown error");
            }
          })
          .catch((err: any) => {
            console.error("[useEmailIntegrations] activecampaign fetch error:", err);
            setAcListsError(err.message || "Could not retrieve ActiveCampaign lists.");
          })
          .finally(() => {
            setFetchingAcLists(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setAcLists([]);
    }
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

  // 5. GHL: Fetch locations (500ms Debounce)
  useEffect(() => {
    if (form.emailPlatform === "ghl" && form.emailApiKey?.trim()) {
      const timer = setTimeout(() => {
        setFetchingGhlLocations(true);
        setGhlLocationsError(null);
        setGhlWorkflows([]);
        setForm((f) => ({ ...f, emailGhlTargetWorkflowId: "", emailGhlRecoveryWorkflowId: "" }));

        fetch(`/api/integrations/ghl/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: form.emailApiKey.trim() }),
        })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `GHL request failed [${res.status}]`);
            }
            return data;
          })
          .then((data) => {
            if (data.success) {
              setGhlLocations(data.locations ?? []);
            } else {
              throw new Error(data.error ?? "Unknown error");
            }
          })
          .catch((err: any) => {
            console.error("[useEmailIntegrations] ghl locations fetch error:", err);
            setGhlLocationsError(err.message || "Could not retrieve GHL locations.");
          })
          .finally(() => {
            setFetchingGhlLocations(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setGhlLocations([]);
    }
  }, [form.emailPlatform, form.emailApiKey, setForm]);

  // 6. GHL: Fetch workflows when location is selected
  useEffect(() => {
    if (
      form.emailPlatform === "ghl" &&
      form.emailGhlLocationId &&
      form.emailApiKey?.trim()
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
          if (data.success) {
            setGhlWorkflows(data.workflows ?? []);
          } else {
            throw new Error(data.error ?? "Unknown error");
          }
        })
        .catch((err: any) => {
          console.error("[useEmailIntegrations] ghl workflows fetch error:", err);
          setGhlWorkflowsError(err.message || "Could not retrieve GHL workflows.");
        })
        .finally(() => {
          setFetchingGhlWorkflows(false);
        });
    } else {
      setGhlWorkflows([]);
    }
  }, [form.emailPlatform, form.emailGhlLocationId, form.emailApiKey]);

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
  };
}