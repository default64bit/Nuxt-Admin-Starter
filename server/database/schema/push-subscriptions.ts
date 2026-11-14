import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, uuidPk } from "./_helpers";
import { localeEnum } from "./enums";
import { users } from "./identity";

// The browsers a User turned Web Push on in (the Web Push + PWA Optional piece, ADR-0028). The endpoint is a capability
// URL: unique here, read only at send time, never copied into the outbox (whose `recipient` is this row's id), logs or
// audit. `device_label` comes from the user agent, which is not stored. Subscriptions outlive sessions; the worker
// purges the ones with no success for 90 days. Removing the piece drops this table (docs/optional-pieces/web-push-pwa.md).
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    // The locale of the service worker that subscribed (`/admin` = fa, `/en/admin` = en).
    localeScope: localeEnum().notNull(),
    deviceLabel: text().notNull(),
    createdAt: createdAt(),
    lastSuccessAt: timestamptz(),
    lastFailureAt: timestamptz(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_unique").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)],
);
