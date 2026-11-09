import { pgEnum } from "drizzle-orm/pg-core";
import * as v from "../../../shared/constants/database-enums";

export const userStatusEnum = pgEnum("user_status", v.USER_STATUSES);
