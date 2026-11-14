<script setup lang="ts">
import SignInForm from "~/components/auth/SignInForm.vue";
import { parseSignInReason } from "~~/shared/utils/return-path";

// Admin sign-in with a phone number and an SMS code. Uncached and noindex through the route rules; the server
// already redirects signed-in visitors, and the form sends everyone else on after success.
const { t } = useI18n();
const route = useRoute();
const heading = ref({ title: t("auth.signIn.title"), description: t("auth.signIn.description") });
// A session that ended (30 minutes idle, 12 hours in total, signed out elsewhere, account disabled) says so here.
const sessionEnded = computed(() => parseSignInReason(route.query.reason) === "session-ended");
useHead({ title: () => t("auth.signIn.title"), meta: [{ name: "robots", content: "noindex" }] });
</script>

<template>
  <main class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
    <div v-if="sessionEnded" role="alert" data-testid="session-ended" class="border-border bg-muted text-foreground rounded-lg border p-4 text-sm">
      <p class="font-medium">{{ t("auth.sessionEnded.title") }}</p>
      <p class="mt-1">{{ t("auth.sessionEnded.body") }}</p>
    </div>
    <div class="bg-card text-card-foreground border-border w-full rounded-xl border p-6 shadow-xs">
      <h1 class="mb-1 text-xl font-semibold">{{ heading.title }}</h1>
      <p class="text-muted-foreground mb-4 text-sm">{{ heading.description }}</p>
      <SignInForm @heading="heading = $event" />
    </div>
  </main>
</template>
