<script setup lang="ts">
import { IconCheck, IconHome, IconLanguage, IconLogout, IconMoon, IconSun, IconUser } from "@tabler/icons-vue";
import { toast } from "vue-sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminUserMenuLinks } from "~/composables/admin/useAdminNav";
import { removeThisBrowserPush } from "~/composables/admin/useAdminPush";
import { localizedPath } from "~~/shared/utils/locale-path";
import { ADMIN_USER_MENU_ICONS, DEFAULT_USER_MENU_ICON } from "./admin-nav-icons";

const { t, locale } = useI18n();
const { user } = useAuthSession();
const signOut = useSignOut();
const { options } = useLocaleSwitch();
const { isDark, setDark } = useAppearance();
const links = useAdminUserMenuLinks();
const flags = { fa: "/flags/fa.png", en: "/flags/en.png" } as const;

const pathLocale = computed(() => (locale.value === "en" ? "en" : "fa"));
const home = computed(() => localizedPath("/", pathLocale.value));
const name = computed(() => [user.value?.givenName, user.value?.familyName].filter(Boolean).join(" ").trim());
const initial = computed(() => Array.from(name.value)[0] ?? "");

// The language and theme switches live here. Language options are real links keeping path, query and hash; the theme
// is the shared two-state preference (light or dark, never "system" once chosen), and its item keeps the menu open.
// The Inbox slice adds its Web Push and install items above the language entry.

async function onSignOut() {
  // An explicit sign-out removes this browser's push subscription first (it never blocks for long or throws).
  await removeThisBrowserPush();
  try {
    await signOut.mutateAsync();
  } catch {
    toast.error(t("admin.shell.signOutFailed"));
    return;
  }
  // The toast must show on the sign-in page that the hard navigation loads. A hard navigation also drops every
  // cached admin query.
  try {
    sessionStorage.setItem("flash-toast", "signedOut");
  } catch {
    // Storage may be unavailable; signing out still succeeded.
  }
  await navigateTo(localizedPath("/sign-in", pathLocale.value), { external: true });
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button type="button" :aria-label="t('admin.shell.userMenu')" data-slot="admin-user-menu-trigger" class="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2">
        <Avatar class="size-8">
          <AvatarFallback aria-hidden="true"><template v-if="initial">{{ initial }}</template><IconUser v-else class="size-4" /></AvatarFallback>
        </Avatar>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel data-slot="admin-user-label" class="truncate">{{ name || t("admin.shell.userFallback") }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem v-for="link in links" :key="link.key" as-child>
        <NuxtLink :to="link.href"><component :is="ADMIN_USER_MENU_ICONS[link.key] ?? DEFAULT_USER_MENU_ICON" aria-hidden="true" />{{ t(link.labelKey) }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-slot="admin-language-trigger"><IconLanguage aria-hidden="true" />{{ t("language.switch.label") }}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent class="w-40" :aria-label="t('language.switch.menuLabel')">
          <DropdownMenuItem v-for="option in options" :key="option.code" as-child>
            <NuxtLink :to="option.href" :lang="option.code" :hreflang="option.code" :aria-current="option.current ? 'true' : undefined" data-slot="admin-language-option">
              <img :src="flags[option.code]" alt="" width="16" height="16" class="size-4 rounded-full" >
              <span>{{ t(`language.options.${option.code}.name`) }}</span>
              <IconCheck v-if="option.current" aria-hidden="true" class="ms-auto" />
            </NuxtLink>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuCheckboxItem :model-value="isDark" data-slot="admin-theme-item" @update:model-value="setDark(Boolean($event))" @select.prevent>
        <IconSun aria-hidden="true" class="dark:hidden" /><IconMoon aria-hidden="true" class="hidden dark:block" />{{ t("theme.switch.label") }}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem as-child>
        <NuxtLink :to="home" external><IconHome aria-hidden="true" />{{ t("admin.shell.backToHome") }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem data-slot="admin-sign-out" @select="onSignOut"><IconLogout aria-hidden="true" />{{ t("admin.shell.signOut") }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
