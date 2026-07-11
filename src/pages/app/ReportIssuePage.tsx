import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import freeGrindLogo from "../../images/freegrind-logo.webp";
import { BackToSettings } from "../../components/BackToSettings";
import { submitIssueReport } from "../../services/apiFunctions";
import { useTranslation } from "react-i18next";
import { collectIssueLogs, getIssueAppInfo } from "../../utils/issueTelemetry";

import { useApi } from "../../hooks/useApi";
import { ToggleRow } from "../../components/ui/toggle-row";

type ReportType = "BUG" | "FEATURE";

const REPORTER_DETAILS_STORAGE_KEY = "issue_form_reporter_details";

type StoredReporterDetails = {
  reporterName: string;
  reporterContact: string;
  reporterContactPlatform: string;
};

export function ReportIssuePage() {
  const { t } = useTranslation();
  const { fetchRest } = useApi();
  const [searchParams] = useSearchParams();
  const bugOnly = searchParams.get("kind") === "bug";
  const [kind, setKind] = useState<ReportType>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [reporterContactPlatform, setReporterContactPlatform] = useState("Discord");
  const [includeAppInfo, setIncludeAppInfo] = useState(true);
  const [includeLogs, setIncludeLogs] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const appInfo = useMemo(() => getIssueAppInfo(), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(REPORTER_DETAILS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredReporterDetails>;
      if (typeof parsed.reporterName === "string") {
        setReporterName(parsed.reporterName);
      }
      if (typeof parsed.reporterContact === "string") {
        setReporterContact(parsed.reporterContact);
      }
      if (typeof parsed.reporterContactPlatform === "string") {
        setReporterContactPlatform(parsed.reporterContactPlatform);
      }
    } catch {
      // Ignore malformed stored data and keep empty defaults.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: StoredReporterDetails = {
      reporterName,
      reporterContact,
      reporterContactPlatform,
    };

    try {
      window.localStorage.setItem(REPORTER_DETAILS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }, [reporterName, reporterContact, reporterContactPlatform]);

  useEffect(() => {
    if (kind !== "BUG" && includeLogs) {
      setIncludeLogs(false);
    }
  }, [kind, includeLogs]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (title.trim().length < 3) {
      toast.error(t("issues_form.validation_title"));
      return;
    }

    if (description.trim().length < 10) {
      toast.error(t("issues_form.validation_description"));
      return;
    }

    if (!reporterContact.trim()) {
      toast.error(t("issues_form.validation_contact"));
      return;
    }

    setIsSubmitting(true);
    try {
      const clientLogs = kind === "BUG" && includeLogs ? await collectIssueLogs() : undefined;
      const result = await submitIssueReport(
        {
          kind,
          title: title.trim(),
          description: description.trim(),
          reporterName: reporterName.trim() || undefined,
          reporterContact: reporterContact.trim()
            ? `[${reporterContactPlatform}] ${reporterContact.trim()}`
            : undefined,
          appVersion: includeAppInfo ? appInfo.appVersion : undefined,
          platform: includeAppInfo ? appInfo.platform : undefined,
          otaChannel: includeAppInfo ? appInfo.otaChannel : undefined,
          clientLogs,
        },
        t,
        fetchRest
      );

      toast.success(t("issues_form.success", { id: result.id }));
      setTitle("");
      setDescription("");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("issues_form.error");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (bugOnly) {
    return (
      <div className="fs-card-outer">
        <div className="fs-card-inner fs-card-lg flex flex-col">
          {/* Back link */}
          <div
            className="shrink-0 px-6"
            style={{ paddingTop: "max(56px, env(safe-area-inset-top))" }}
          >
            <Link
              to="/auth/sign-in"
              className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("auth.sign_in.title")}
            </Link>
          </div>

          {/* Header — same as AuthShell */}
          <div className="flex shrink-0 flex-col items-center px-6 pb-10 text-center"
            style={{ paddingTop: "max(32px, 2rem)" }}
          >
            <img
              src={freeGrindLogo}
              alt="Free Grind"
              className="mb-7 h-16 w-16 rounded-2xl object-cover"
            />
            <h1 className="text-2xl font-bold text-[var(--text)]">{t("issues_form.title_bug_only")}</h1>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">{t("issues_form.subtitle")}</p>
          </div>

          {/* Form */}
          <div className="flex flex-1 flex-col overflow-y-auto px-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("issues_form.title_label")}
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("issues_form.title_placeholder")}
                  className="input-field"
                  maxLength={140}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("issues_form.description_label")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("issues_form.description_placeholder")}
                  className="input-field min-h-[120px]"
                  maxLength={4000}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("issues_form.contact_label")} <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={reporterContactPlatform}
                    onChange={(e) => setReporterContactPlatform(e.target.value)}
                    className="input-field w-auto shrink-0"
                  >
                    <option value="Discord">Discord</option>
                    <option value="Telegram">Telegram</option>
                    <option value="Email">Email</option>
                    <option value="Other">Other</option>
                  </select>
                  <input
                    value={reporterContact}
                    onChange={(e) => setReporterContact(e.target.value)}
                    placeholder={t("issues_form.contact_placeholder")}
                    className="input-field min-w-0 flex-1"
                    maxLength={120}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  {t("issues_form.name_label")}
                </label>
                <input
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder={t("issues_form.name_placeholder")}
                  className="input-field"
                  maxLength={80}
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                <ToggleRow
                  checked={includeAppInfo}
                  onChange={setIncludeAppInfo}
                  label={t("issues_form.include_app_info")}
                  description={t("issues_form.include_app_info_hint")}
                />
                <div className="mx-4 h-px bg-[var(--border)]" />
                <ToggleRow
                  checked={includeLogs}
                  onChange={setIncludeLogs}
                  label={t("issues_form.include_logs")}
                  description={t("issues_form.include_logs_hint")}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
              >
                {isSubmitting ? t("issues_form.submitting") : t("issues_form.submit")}
              </button>
            </form>

            <div style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="app-screen">
      <header className="mb-6">
        <BackToSettings />
        <h1 className="app-title mb-2">{t("issues_form.title")}</h1>
        <p className="app-subtitle">{t("issues_form.subtitle")}</p>
      </header>

      <form onSubmit={handleSubmit} className="surface-card grid gap-4 p-4 sm:p-5">
        {!bugOnly ? (
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-[var(--text-muted)]">
              {t("issues_form.type_label")}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKind("BUG")}
                className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition"
                style={{
                  borderColor: kind === "BUG" ? "var(--accent)" : "var(--border)",
                  background:
                    kind === "BUG"
                      ? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
                      : "var(--surface-2)",
                }}
              >
                {t("issues_form.type_bug")}
              </button>
              <button
                type="button"
                onClick={() => setKind("FEATURE")}
                className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold transition"
                style={{
                  borderColor: kind === "FEATURE" ? "var(--accent)" : "var(--border)",
                  background:
                    kind === "FEATURE"
                      ? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
                      : "var(--surface-2)",
                }}
              >
                {t("issues_form.type_feature")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-[var(--text-muted)]">
            {t("issues_form.title_label")}
          </label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("issues_form.title_placeholder")}
            className="input-field"
            maxLength={140}
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-[var(--text-muted)]">
            {t("issues_form.description_label")}
          </label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("issues_form.description_placeholder")}
            className="input-field min-h-[140px]"
            maxLength={4000}
            required
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-[var(--text-muted)]">
              {t("issues_form.name_label")}
            </label>
            <input
              value={reporterName}
              onChange={(event) => setReporterName(event.target.value)}
              placeholder={t("issues_form.name_placeholder")}
              className="input-field"
              maxLength={80}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-[var(--text-muted)]">
              {t("issues_form.contact_label")} <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={reporterContactPlatform}
                onChange={(event) => setReporterContactPlatform(event.target.value)}
                className="input-field w-auto shrink-0"
              >
                <option value="Discord">Discord</option>
                <option value="Telegram">Telegram</option>
                <option value="Email">Email</option>
                <option value="Other">Other</option>
              </select>
              <input
                value={reporterContact}
                onChange={(event) => setReporterContact(event.target.value)}
                placeholder={t("issues_form.contact_placeholder")}
                className="input-field min-w-0 flex-1"
                maxLength={120}
                required
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--text-muted)]">
            {t("issues_form.include_data_label")}
          </p>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={includeAppInfo}
              onChange={(event) => setIncludeAppInfo(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--text)]">
                {t("issues_form.include_app_info")}
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                {t("issues_form.include_app_info_hint")}
              </span>
            </span>
          </label>

          {kind === "BUG" ? (
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <input
                type="checkbox"
                checked={includeLogs}
                onChange={(event) => setIncludeLogs(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text)]">
                  {t("issues_form.include_logs")}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {t("issues_form.include_logs_hint")}
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          {includeAppInfo
            ? t("issues_form.meta", {
                version: appInfo.appVersion,
                platform: appInfo.platform,
                otaChannel: appInfo.otaChannel,
              })
            : t("issues_form.meta_opt_out")}
        </p>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? t("issues_form.submitting") : t("issues_form.submit")}
        </button>
      </form>
    </section>
  );
}
