import type { Locale } from "./database-enums";

// Web Push (the Web Push + PWA Optional piece, ADR-0028). The test push is a fixed text with no Inbox item behind it and
// no product name: the OS shows the installed app's own name beside it.

/** The `Topic` the test push is sent under; not an Inbox type. */
export const PUSH_TEST_EVENT_KEY = "push.test";

export const PUSH_TEST_COPY: Record<Locale, { title: string; body: string }> = {
  fa: { title: "اعلان آزمایشی", body: "اعلان مرورگر روی این دستگاه کار می‌کند." },
  en: { title: "Test notification", body: "Browser push works on this device." },
};
