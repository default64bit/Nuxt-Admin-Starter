import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { AdminUserList, AdminUserPage, UserCreateBody, UserNamesBody, UserRolesBody, UserStatusBody } from "~~/shared/schemas/admin-users";
import { buildUserListUrlQuery, type UserListState } from "~~/shared/utils/user-list-url";
import { ADMIN_ROLES_KEY } from "~/composables/admin/useAdminRoles";

export const ADMIN_USERS_KEY = ["admin", "users"] as const;
export const adminUserKey = (id: string) => [...ADMIN_USERS_KEY, "one", id] as const;
const BASE = "/api/v1/admin/users";

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;

/** One page of the Users list; the previous rows stay while the next page or filter loads. */
export function useAdminUsersList(state: Ref<UserListState>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_USERS_KEY, "list", JSON.stringify(buildUserListUrlQuery(state.value))] as const),
    queryFn: () => request(BASE, { query: buildUserListUrlQuery(state.value), headers: { accept: "application/json" } }) as Promise<AdminUserList>,
    placeholderData: keepPreviousData,
    // Client-only: a server-side run has no session cookie, so its 401 would flip the session state in the
    // server-rendered page. The page shows its loading skeleton until hydration.
    enabled: import.meta.client,
    // Refetched when the list is opened again (an account may have changed); never polled.
    staleTime: 0,
    retry: false,
  });
}

/** One account for the User page. Refetched on every mount; never polled. */
export function useAdminUser(id: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => adminUserKey(id.value ?? "") as readonly unknown[]),
    queryFn: () => request(`${BASE}/${id.value}`, { headers: { accept: "application/json" } }) as Promise<AdminUserPage>,
    enabled: computed(() => import.meta.client && Boolean(id.value)),
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
}

/**
 * The account actions. Every success refetches the lists and the open User (and the Roles, whose member lists and
 * counts follow); errors surface to the caller (the dialog), which maps the code to its own message. A mutation's
 * response is the account without the viewer's flags, so it is never written into the page's cache: the refetch is.
 */
export function useUserMutations() {
  const queryClient = useQueryClient();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY }), queryClient.invalidateQueries({ queryKey: ADMIN_ROLES_KEY })]);
  return {
    create: useMutation({ mutationFn: (body: UserCreateBody) => request(BASE, { method: "POST", body }) as Promise<AdminUserPage>, onSuccess: refresh }),
    rename: useMutation({ mutationFn: ({ id, body }: { id: string; body: UserNamesBody }) => request(`${BASE}/${id}`, { method: "PATCH", body }), onSuccess: refresh }),
    disable: useMutation({ mutationFn: ({ id, body }: { id: string; body: UserStatusBody }) => request(`${BASE}/${id}/disable`, { method: "POST", body }), onSuccess: refresh }),
    enable: useMutation({ mutationFn: ({ id, body }: { id: string; body: UserStatusBody }) => request(`${BASE}/${id}/enable`, { method: "POST", body }), onSuccess: refresh }),
    setRoles: useMutation({ mutationFn: ({ id, body }: { id: string; body: UserRolesBody }) => request(`${BASE}/${id}/roles`, { method: "PUT", body }), onSuccess: refresh }),
  };
}
