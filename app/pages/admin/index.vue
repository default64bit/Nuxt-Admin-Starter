<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { localizedPath } from "~~/shared/utils/locale-path";

// PLACEHOLDER. A trivial landing page so sign-in has somewhere to go; the admin shell replaces this file with the
// real dashboard inside the shell layout. It only proves the session and offers sign-out.
const { t, locale } = useI18n();
const { user } = useAuthSession();
const signOut = useSignOut();
useHead({ title: () => t("admin.placeholder.title") });

const displayName = computed(() => [user.value?.givenName, user.value?.familyName].filter(Boolean).join(" "));

async function onSignOut() {
  await signOut.mutateAsync().catch(() => undefined);
  try {
    sessionStorage.setItem("flash-toast", "signedOut");
  } catch {
    // Storage unavailable: the page still loads, just without the toast.
  }
  // A hard navigation drops every cached admin query.
  await navigateTo(localizedPath("/sign-in", locale.value === "en" ? "en" : "fa"), { external: true });
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t("admin.placeholder.title") }}</h1>
    <p v-if="displayName" class="text-muted-foreground" data-testid="admin-user-name">{{ t("admin.placeholder.welcome", { name: displayName }) }}</p>
    <p v-else class="text-muted-foreground">{{ t("admin.placeholder.welcomeAnonymous") }}</p>
    <Button type="button" variant="outline" data-testid="sign-out" :disabled="signOut.isPending.value" @click="onSignOut">{{ t("admin.placeholder.signOut") }}</Button>
  </main>
</template>
