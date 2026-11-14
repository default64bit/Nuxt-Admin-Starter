import type { Db, Executor } from "../database/types";
import { CREDENTIAL_FAILURE, type ChannelAvailability } from "../../shared/constants/admin-channels";
import { applyOutcome, claimProbe, healthOf, type HealthTransition } from "../repositories/admin-channels.repository";
import type { AdminChannelRegistry, AdminNotificationChannel, ChannelDeliveryResult } from "./admin-channels";

// The Channel circuit breaker (ADR-0021). Pure orchestration over the health repository: the readiness probe and the app
// never depend on it.

export type HealthLog = (line: Record<string, unknown>) => void;

/** Configuration first (not configured, kill switch), then the breaker. */
export async function channelAvailability(db: Executor, channel: AdminNotificationChannel): Promise<ChannelAvailability> {
  const configured = channel.availability();
  if (configured !== "operational") return configured;
  return (await healthOf(db, channel.key))?.status === "degraded" ? "degraded" : "operational";
}

/** Each change is one structured log line (and the seam error reporting hangs on); never carries a recipient or token. */
export function reportTransition(transition: HealthTransition, channel: string, category: string | null, log: HealthLog): void {
  if (!transition) return;
  log({
    level: transition === "degraded" ? "error" : "info",
    event: "admin_channel_health",
    channel,
    transition,
    ...(category ? { category } : {}),
  });
}

/** Folds the result of one send into the breaker; a recipient-level refusal is neutral. */
export async function recordSend(db: Db, channel: AdminNotificationChannel, result: ChannelDeliveryResult, log: HealthLog): Promise<void> {
  let transition: HealthTransition = null;
  let category: string | null = null;
  if (result.ok) transition = await applyOutcome(db, channel.key, { kind: "success" });
  else if (result.category === CREDENTIAL_FAILURE) {
    category = result.category;
    transition = await applyOutcome(db, channel.key, { kind: "credential", category });
  } else if (!result.permanent) {
    category = result.category;
    transition = await applyOutcome(db, channel.key, { kind: "transient", category });
  }
  reportTransition(transition, channel.key, category, log);
}

/**
 * Probes every degraded Channel whose time has come; a success restores it. Nothing queued while it was down is
 * replayed: those rows were already closed as skipped.
 */
export async function runProbes(db: Db, registry: AdminChannelRegistry, log: HealthLog): Promise<void> {
  for (const channel of registry) {
    if (channel.availability() !== "operational") continue;
    if (!(await claimProbe(db, channel.key))) continue;
    const result = await channel.probe();
    const transition = await applyOutcome(db, channel.key, result.ok ? { kind: "success" } : { kind: "transient", category: result.category });
    reportTransition(transition, channel.key, result.ok ? null : result.category, log);
  }
}
