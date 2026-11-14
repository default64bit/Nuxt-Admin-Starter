<script setup lang="ts">
import { localizedPath } from "~~/shared/utils/locale-path";

const { t, locale } = useI18n();
// Pure string work, so the link needs no session and the cached HTML is identical for every visitor.
const signInPath = computed(() => localizedPath("/sign-in", locale.value === "en" ? "en" : "fa"));
const { other } = useLocaleSwitch();

useSeoMeta({
  title: () => t("landing.seo.title"),
  description: () => t("landing.seo.description"),
  ogTitle: () => t("landing.seo.title"),
  ogDescription: () => t("landing.seo.description"),
});
</script>

<template>
  <div class="flex flex-1 flex-col">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
      <span class="text-lg font-semibold">{{ t("app.name") }}</span>
      <NuxtLink
        :to="other.href"
        :lang="other.code"
        :hreflang="other.code"
        data-testid="landing-language-switch"
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md px-2 py-1 text-sm outline-none focus-visible:ring-3"
      >
        {{ t(`language.options.${other.code}.name`) }}
        <span class="sr-only">, {{ t("language.switch.label") }}</span>
      </NuxtLink>
    </header>
    <main class="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-6 px-6 py-16">
      <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">{{ t("landing.hero.title") }}</h1>
      <p class="text-muted-foreground max-w-xl text-lg">{{ t("landing.hero.description") }}</p>
      <NuxtLink
        :to="signInPath"
        data-testid="landing-sign-in"
        class="bg-primary text-primary-foreground focus-visible:ring-ring/50 rounded-md px-5 py-2.5 text-sm font-medium outline-none focus-visible:ring-3"
      >
        {{ t("landing.signIn.cta") }}
      </NuxtLink>
    </main>
  </div>
</template>
