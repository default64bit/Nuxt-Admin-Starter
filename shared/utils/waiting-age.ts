export type WaitingUnit = "minutes" | "hours" | "days";

/**
 * How long a request has waited, in the largest whole unit (`3 h`): minutes below an hour, hours below a
 * day, days after. A moment in the future (a clock that is slightly behind) reads as 0 minutes.
 */
export function waitingAge(from: string | Date, now: Date): { unit: WaitingUnit; n: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 60_000));
  if (minutes < 60) return { unit: "minutes", n: minutes };
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? { unit: "hours", n: hours } : { unit: "days", n: Math.floor(hours / 24) };
}
