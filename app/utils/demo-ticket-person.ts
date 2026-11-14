// demo-ticket:start (whole file)
/** A person's display name (given and family name), or the fallback for an account that has none. */
export function demoTicketPersonName(person: { givenName: string | null; familyName: string | null } | null | undefined, fallback: string): string {
  return [person?.givenName, person?.familyName].map((part) => part?.trim()).filter(Boolean).join(" ") || fallback;
}
// demo-ticket:end
