import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { AUTH_SESSION_KEY } from "~/composables/useAuthSession";
import type { AccountResponse } from "~~/shared/schemas/account";
import { fieldErrorsFromServer, type NameErrors, type NameValues } from "~~/shared/utils/account-form";
import { parseApiError, parseFieldErrors } from "~~/shared/utils/api-error-client";
import type { SessionPayload } from "~~/shared/utils/session-state";

export const ACCOUNT_KEY = ["admin", "account"] as const;

// Untyped alias: Nitro's generated route typings are too deep to infer for this call.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

export type SaveOutcome = { status: "saved" } | { status: "invalid"; errors: NameErrors } | { status: "failed" };

/**
 * The signed-in User's own account (names and sign-in phone) and the save of the two names. My account is a private
 * server-rendered page, so the account is fetched during SSR and hydrated. A saved account replaces the cache and
 * the session payload's names, so the user menu shows the new name without a reload. A `401` mid-save is handled
 * once for the whole app (the Vue Query plugin sends the person to sign-in).
 */
export function useAdminAccount() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const requestFetch = import.meta.server ? useRequestFetch() : null;

  const query = useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: () => (requestFetch ?? $fetch)<AccountResponse>("/api/v1/admin/account", { headers: { accept: "application/json" } }),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Registered on the server AND the client so component ids match across hydration (see `useAuthSession`).
  onServerPrefetch(async () => {
    await query.suspense();
  });

  const mutation = useMutation({
    mutationFn: (values: NameValues) => request("/api/v1/admin/account", { method: "PATCH", body: values }) as Promise<AccountResponse>,
    onSuccess: (saved) => {
      queryClient.setQueryData(ACCOUNT_KEY, saved);
      queryClient.setQueryData<SessionPayload>(AUTH_SESSION_KEY, (previous) =>
        previous?.user ? { ...previous, user: { ...previous.user, givenName: saved.givenName, familyName: saved.familyName } } : previous,
      );
    },
    retry: false,
  });

  async function save(values: NameValues): Promise<SaveOutcome> {
    try {
      await mutation.mutateAsync(values);
      toast.success(t("admin.account.saved"));
      return { status: "saved" };
    } catch (error) {
      const errors = parseApiError(error).status === 400 ? fieldErrorsFromServer(parseFieldErrors(error)) : {};
      if (Object.keys(errors).length > 0) return { status: "invalid", errors };
      toast.error(t("admin.account.saveFailed"));
      return { status: "failed" };
    }
  }

  return {
    account: query.data,
    isPending: computed(() => query.isPending.value),
    isError: computed(() => query.isError.value),
    retry: () => query.refetch(),
    save,
    isSaving: mutation.isPending,
  };
}
