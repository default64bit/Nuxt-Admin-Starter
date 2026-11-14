// demo-ticket:start (whole file) -- the dev seed of the Reference module; `just demo-remove` deletes this file.
//
// Used by the CLI `scripts/db/demo-ticket-dev-seed.ts` (`just db-seed-dev`): about 40 demo tickets across every status, priority and assignee (some waiting
// long) and 3 dev Users holding `super`, so every view has data locally. It is a dev convenience only:
//   - it refuses to run unless NUXT_APP_ENV is `local`, and no production or test database path calls it,
//   - it is safe to rerun: the Users are upserted by phone and the tickets are added only to an empty table, so it
//     never overwrites what was changed in the panel.
import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import sharp from "sharp";
import { DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUSES, type DemoTicketPriority, type DemoTicketStatus } from "../../shared/constants/demo-ticket";
import { DEMO_TICKET_IMAGE_PURPOSE } from "../../shared/constants/media";
import type { ObjectStorage } from "../utils/object-storage";
import * as schema from "./schema";
import type { Tx } from "./types";

export const DEV_USERS = [
  { phoneE164: "+989120000101", givenName: "Dev", familyName: "Alpha" },
  { phoneE164: "+989120000102", givenName: "Dev", familyName: "Beta" },
  { phoneE164: "+989120000103", givenName: "Dev", familyName: "Gamma" },
] as const;

const SUBJECTS = ["Login page", "Invoice export", "Search results", "Profile photo", "Password reset", "Dark mode", "Email digest", "Mobile menu", "CSV import", "Audit filter"];
const PROBLEMS = ["is slow to load", "shows the wrong total", "does not save changes", "needs a clearer label", "breaks on small screens", "fails for new accounts"];
const HOUR = 60 * 60 * 1000;

export interface DevTicket {
  title: string;
  description: string | null;
  status: DemoTicketStatus;
  priority: DemoTicketPriority;
  /** Index into DEV_USERS, or null for unassigned. */
  assignee: number | null;
  createdAt: Date;
  statusSince: Date;
}

/** The dev tickets, deterministic for a given `now`: 40 of them, newest first by index. */
export function buildDevTickets(now: Date, total = 40): DevTicket[] {
  return Array.from({ length: total }, (_, index) => {
    const status = DEMO_TICKET_STATUSES[index % DEMO_TICKET_STATUSES.length]!;
    const priority = DEMO_TICKET_PRIORITIES[(index * 2 + 1) % DEMO_TICKET_PRIORITIES.length]!;
    // Every ticket is older than two days, so the long-waiting ones can have sat in their status past both limits.
    const createdAt = new Date(now.getTime() - (index * 7 + 50) * HOUR);
    // Every third open and in-progress ticket has not moved since it was created: the waiting-long chip shows.
    const waitingLong = (status === "open" || status === "in_progress") && index % 3 === 0;
    const sinceHours = status === "open" ? 3 : status === "in_progress" ? 5 : 2;
    return {
      title: `${SUBJECTS[index % SUBJECTS.length]} ${PROBLEMS[(index * 3) % PROBLEMS.length]} (${index + 1})`,
      description: index % 4 === 0 ? null : `Reported during a demo walkthrough. Steps to reproduce are in the notes for ticket ${index + 1}.`,
      status,
      priority,
      assignee: index % 5 === 4 ? null : index % DEV_USERS.length,
      createdAt,
      statusSince: waitingLong ? createdAt : new Date(now.getTime() - sinceHours * HOUR),
    };
  });
}

/** About a quarter of the dev tickets carry an image (when media storage is configured). */
export const hasDevImage = (index: number) => index % 4 === 1;

const IMAGE_COLOURS = ["#6d8fb3", "#b38f6d", "#6db38f", "#b36d8f", "#8f6db3"];

/**
 * Upserts the dev Users with the `super` Role and adds the dev tickets when there are none. Returns how many tickets were
 * added. With a `storage`, the tickets for which `hasDevImage` is true get a generated placeholder image in the public
 * bucket; without one (media Off) no ticket has an image.
 */
export async function seedDemoTicketDevData(tx: Tx, now = new Date(), storage?: ObjectStorage): Promise<number> {
  const [superRole] = await tx.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.isSuper, true));
  if (!superRole) throw new Error("the super role is missing; run the production seed first (just db-seed)");
  const userIds: string[] = [];
  for (const user of DEV_USERS) {
    const [row] = await tx
      .insert(schema.users)
      .values({ ...user, phoneVerifiedAt: now })
      .onConflictDoUpdate({ target: schema.users.phoneE164, set: { phoneE164: user.phoneE164 } })
      .returning({ id: schema.users.id });
    userIds.push(row!.id);
    await tx.insert(schema.userRoles).values({ userId: row!.id, roleId: superRole.id }).onConflictDoNothing();
  }
  const [existing] = await tx.select({ total: count() }).from(schema.demoTickets);
  if ((existing?.total ?? 0) > 0) return 0;
  const tickets = buildDevTickets(now);
  const images = new Map<number, string>();
  if (storage) {
    for (const [index] of tickets.entries()) {
      if (!hasDevImage(index)) continue;
      const png = await sharp({ create: { width: 480, height: 320, channels: 3, background: IMAGE_COLOURS[index % IMAGE_COLOURS.length]! } }).png().toBuffer();
      const objectKey = `images/${randomUUID()}.png`;
      await storage.put("public", objectKey, png, "image/png");
      const [media] = await tx
        .insert(schema.mediaObjects)
        .values({ bucket: "public", objectKey, mimeType: "image/png", byteSize: png.byteLength, width: 480, height: 320, purpose: DEMO_TICKET_IMAGE_PURPOSE, uploadedByUserId: userIds[index % userIds.length]! })
        .returning({ id: schema.mediaObjects.id });
      images.set(index, media!.id);
    }
  }
  await tx.insert(schema.demoTickets).values(
    tickets.map((ticket, index) => ({
      imageMediaObjectId: images.get(index) ?? null,
      imageAltFa: images.has(index) ? "تصویر نمونه" : null,
      imageAltEn: images.has(index) ? "Sample image" : null,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      assigneeId: ticket.assignee === null ? null : userIds[ticket.assignee]!,
      createdBy: userIds[index % userIds.length]!,
      createdAt: ticket.createdAt,
      updatedAt: ticket.createdAt,
      statusSince: ticket.statusSince,
    })),
  );
  return tickets.length;
}

// demo-ticket:end
