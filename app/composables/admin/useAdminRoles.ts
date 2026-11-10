import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { AdminRoleDetail, AdminRoleList, RoleCreateBody, RoleOptionList, RoleSaveBody } from "~~/shared/schemas/admin-roles";
import { buildRoleListUrlQuery, type RoleListState } from "~~/shared/utils/role-list-url";

export const ADMIN_ROLES_KEY = ["admin", "roles"] as const;
export const adminRoleKey = (id: string) => [...ADMIN_ROLES_KEY, "one", id] as const;

// Untyped alias: Nitro's generated route typings are too deep to infer for these calls.
const request: (url: string, options?: Record<string, unknown>) => Promise<unknown> = $fetch as never;
const BASE = "/api/v1/admin/roles";

export function useAdminRolesList(state: Ref<RoleListState>) {
  return useQuery({
    queryKey: computed(() => [...ADMIN_ROLES_KEY, "list", JSON.stringify(buildRoleListUrlQuery(state.value))] as const),
    queryFn: () => request(BASE, { query: buildRoleListUrlQuery(state.value), headers: { accept: "application/json" } }) as Promise<AdminRoleList>,
    placeholderData: keepPreviousData,
    // Client-only: a server-side run has no session cookie, so its 401 would flip the session state in the
    // server-rendered page. The page shows its loading skeleton until hydration.
    enabled: import.meta.client,
    retry: false,
  });
}

/** Every Role, lean, for pickers and the Users list's Role filter (open to `view-users` and `view-roles`). */
export function useAdminRoleOptions() {
  return useQuery({
    queryKey: [...ADMIN_ROLES_KEY, "options"] as const,
    queryFn: () => request("/api/v1/admin/options/roles", { headers: { accept: "application/json" } }) as Promise<RoleOptionList>,
    enabled: import.meta.client,
    staleTime: 15_000,
    retry: false,
  });
}

/** One Role with its Permissions and members. The page owns the editor state, so a background refetch must not replace what is being edited. */
export function useAdminRole(id: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => adminRoleKey(id.value ?? "") as readonly unknown[]),
    queryFn: () => request(`${BASE}/${id.value}`, { headers: { accept: "application/json" } }) as Promise<AdminRoleDetail>,
    enabled: computed(() => import.meta.client && Boolean(id.value)),
    refetchOnMount: "always",
    staleTime: Infinity,
    retry: false,
  });
}

/** Create, save and delete; every success refreshes the lists and the Role options, and a save or create stores the returned Role. */
export function useRoleMutations() {
  const queryClient = useQueryClient();
  const refreshLists = () => Promise.all([queryClient.invalidateQueries({ queryKey: [...ADMIN_ROLES_KEY, "list"] }), queryClient.invalidateQueries({ queryKey: [...ADMIN_ROLES_KEY, "options"] })]);
  return {
    create: useMutation({
      mutationFn: (body: RoleCreateBody) => request(BASE, { method: "POST", body }) as Promise<AdminRoleDetail>,
      onSuccess: (role) => {
        queryClient.setQueryData(adminRoleKey(role.id), role);
        return refreshLists();
      },
    }),
    save: useMutation({
      mutationFn: ({ id, body }: { id: string; body: RoleSaveBody }) => request(`${BASE}/${id}`, { method: "PUT", body }) as Promise<AdminRoleDetail>,
      onSuccess: (role) => {
        queryClient.setQueryData(adminRoleKey(role.id), role);
        return refreshLists();
      },
    }),
    remove: useMutation({
      mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) => request(`${BASE}/${id}`, { method: "DELETE", query: { expectedUpdatedAt } }),
      onSuccess: () => refreshLists(),
    }),
  };
}
