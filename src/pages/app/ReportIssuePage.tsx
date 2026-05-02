import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BackToSettings } from "../../components/BackToSettings";
import { submitIssueReport } from "../../services/apiFunctions";
import { useTranslation } from "react-i18next";

type ReportType = "BUG" | "FEATURE";

export function ReportIssuePage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ReportType>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const appVersion = useMemo(() => import.meta.env.VITE_APP_VERSION || "unknown", []);
  const platform = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      return "android";
    }
    if (ua.includes("iphone") || ua.includes("ipad")) {
      return "ios";
    }
    if (ua.includes("mac")) {
      return "macos";
    }
    if (ua.includes("win")) {
      return "windows";
    }
    if (ua.includes("linux")) {
      return "linux";
    }
    return "web";
  }, []);

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

    setIsSubmitting(true);
    try {
      const result = await submitIssueReport({
        kind,
        title: title.trim(),
        description: description.trim(),
        reporterName: reporterName.trim() || undefined,
        reporterContact: reporterContact.trim() || undefined,
        appVersion,
        platform,
      });

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

  return (
    <section className="app-screen">
      <header className="mb-6">
        <BackToSettings />
        <h1 className="app-title mb-2">{t("issues_form.title")}</h1>
        <p className="app-subtitle">{t("issues_form.subtitle")}</p>
      </header>

      <form onSubmit={handleSubmit} className="surface-card grid gap-4 p-4 sm:p-5">
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
              {t("issues_form.contact_label")}
            </label>
            <input
              value={reporterContact}
              onChange={(event) => setReporterContact(event.target.value)}
              placeholder={t("issues_form.contact_placeholder")}
              className="input-field"
              maxLength={120}
            />
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          {t("issues_form.meta", { version: appVersion, platform })}
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
