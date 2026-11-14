import { createError, setResponseHeader, type H3Event } from "h3";
import enMessages from "../../i18n/locales/en.json";
import faMessages from "../../i18n/locales/fa.json";
import { adminPwaPaths, buildAdminManifest, type AdminPwaLocale } from "../../shared/utils/admin-pwa";
import { resolveAuthSession } from "./auth-session";

// The manifest and worker answers. The files have an extension, so the private-route guard leaves them alone; this
// gate answers a plain 404 to anyone without a session, and they are never in `public/`. The app name is the per-locale
// `app.name` of the i18n messages: one setting names the panel, the PWA and push.
const APP_NAMES: Record<AdminPwaLocale, string> = { fa: faMessages.app.name, en: enMessages.app.name };

async function gate(event: H3Event, contentType: string): Promise<void> {
  if (!(await resolveAuthSession(event))) throw createError({ statusCode: 404, statusMessage: "Not Found" });
  setResponseHeader(event, "content-type", contentType);
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
}

export async function adminManifestResponse(event: H3Event, locale: AdminPwaLocale): Promise<string> {
  await gate(event, "application/manifest+json; charset=utf-8");
  return JSON.stringify(buildAdminManifest(locale, APP_NAMES[locale]));
}

export async function adminWorkerResponse(event: H3Event, locale: AdminPwaLocale, source: string): Promise<string> {
  await gate(event, "text/javascript; charset=utf-8");
  setResponseHeader(event, "service-worker-allowed", adminPwaPaths(locale).scope);
  return `self.ADMIN_APP_NAME = ${JSON.stringify(APP_NAMES[locale])};\n${source}`;
}
