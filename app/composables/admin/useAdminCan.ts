import type { PermissionKey } from "~~/shared/constants/permissions";

/** Whether the signed-in admin holds a permission. UX only (a link shown or not); the server decides every request. */
export function useAdminCan() {
  const { session } = useAuthSession();
  const permissions = computed<readonly string[]>(() => (session.value?.loggedIn ? (session.value.user?.permissions ?? []) : []));
  return (key: PermissionKey) => permissions.value.includes(key);
}
