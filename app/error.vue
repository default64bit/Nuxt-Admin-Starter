<script setup lang="ts">
import type { NuxtError } from "#app";
import { ConfigProvider } from "reka-ui";

const props = defineProps<{ error: NuxtError }>();

const { t } = useI18n();
const localePath = useLocalePath();
const { direction } = useRootAttributes();
useFontPreload();

const kind = computed(() => (props.error.statusCode === 404 ? "notFound" : props.error.statusCode === 403 ? "forbidden" : "generic"));
useHead({ title: () => `${t(`error.${kind.value}.title`)} · ${t("app.name")}` });
// A signed-in User denied a page (403) goes back into the panel; everything else goes to the landing page.
const home = computed(() => (kind.value === "forbidden" ? localePath("/admin") : localePath("/")));
</script>

<template>
  <ConfigProvider :dir="direction" :scroll-body="false">
    <NuxtLayout name="default">
      <section class="grid min-h-[60dvh] flex-1 place-items-center p-6 text-center">
        <div class="flex max-w-md flex-col items-center gap-4">
          <p class="text-muted-foreground text-5xl font-semibold" dir="ltr">
            {{ error.statusCode }}
          </p>
          <h1 class="text-2xl font-semibold">{{ t(`error.${kind}.title`) }}</h1>
          <p class="text-muted-foreground">{{ t(`error.${kind}.description`) }}</p>
          <NuxtLink
            :to="home"
            class="bg-primary text-primary-foreground focus-visible:ring-ring/50 rounded-md px-5 py-2.5 text-sm font-medium outline-none focus-visible:ring-3"
            @click="clearError()"
          >
            {{ kind === "forbidden" ? t("error.backToAdmin") : t("error.backHome") }}
          </NuxtLink>
        </div>
      </section>
    </NuxtLayout>
  </ConfigProvider>
</template>
