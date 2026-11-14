import { pgEnum } from "drizzle-orm/pg-core";
import * as v from "../../../shared/constants/database-enums";

export const userStatusEnum = pgEnum("user_status", v.USER_STATUSES);
export const otpPurposeEnum = pgEnum("otp_purpose", v.OTP_PURPOSES);
export const auditOutcomeEnum = pgEnum("audit_outcome", v.AUDIT_OUTCOMES);
export const localeEnum = pgEnum("locale", v.LOCALES);
export const notificationChannelEnum = pgEnum("notification_channel", v.NOTIFICATION_CHANNELS);
export const outboxStatusEnum = pgEnum("outbox_status", v.OUTBOX_STATUSES);
export const mediaBucketEnum = pgEnum("media_bucket", v.MEDIA_BUCKETS);
