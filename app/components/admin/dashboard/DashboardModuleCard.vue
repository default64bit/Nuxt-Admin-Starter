<script setup lang="ts">
import { IconRefresh } from "@tabler/icons-vue";
import type { Component } from "vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTime } from "~~/shared/utils/format-date";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

// A Dashboard module's frame (admin-dashboard spec "Module look, links and states"): a title with a tinted
// icon tile in the module's own colour, the content, and a footer with "Updated HH:MM" and Refresh. It owns the
// states: a skeleton while loading, "Couldn't load" with Retry on an error (this module only), and the content
// otherwise. Motion plays once (a staggered entrance and a hover lift) and is off under reduced motion.
const props = defineProps<{
  moduleKey: string;
  title: string;
  icon: Component;
  status: "loading" | "error" | "ready";
  /** When the data last arrived, in epoch ms. */
  updatedAt?: number;
  refreshing?: boolean;
  /** Position in the grid, for the staggered entrance. */
  index?: number;
}>();
const emit = defineEmits<{ refresh: [] }>();
const { t, locale } = useI18n();
const lang = computed(() => (locale.value === "en" ? "en" : "fa"));
const headingId = useId();

// Literal classes so Tailwind finds them; the delay steps up per card and stops at the last one.
const DELAYS = ["delay-0", "delay-75", "delay-150", "delay-200", "delay-300", "delay-500"] as const;
const delay = computed(() => DELAYS[Math.min(props.index ?? 0, DELAYS.length - 1)]);
const updated = computed(() => (props.updatedAt ? toLocaleDigits(formatTime(new Date(props.updatedAt), lang.value), lang.value) : null));
</script>

<template>
  <Card
    :data-dashboard-module="moduleKey"
    data-slot="dashboard-module"
    :data-status="status"
    :aria-labelledby="headingId"
    role="region"
    :class="
      cn(
        'h-full gap-4 shadow-[0_8px_32px_-16px_hsl(var(--dashboard-hue)_70%_50%/35%)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none',
        delay,
      )
    "
  >
    <CardHeader class="flex items-center gap-3">
      <span
        data-slot="dashboard-module-icon"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--dashboard-hue)_70%_50%/16%)] text-[hsl(var(--dashboard-hue)_70%_38%)] dark:text-[hsl(var(--dashboard-hue)_80%_72%)]"
      >
        <component :is="icon" class="size-5" aria-hidden="true" />
      </span>
      <CardTitle :id="headingId" class="min-w-0 flex-1 text-base font-semibold"><h2>{{ title }}</h2></CardTitle>
      <slot name="header-actions" />
    </CardHeader>
    <CardContent class="min-h-24 flex-1">
      <div v-if="status === 'loading'" data-slot="dashboard-module-loading" role="status" :aria-label="t('admin.dashboard.module.loading')" class="grid gap-3">
        <slot name="skeleton">
          <Skeleton v-for="n in 3" :key="n" class="h-6 w-full" />
        </slot>
      </div>
      <div v-else-if="status === 'error'" data-slot="dashboard-module-error" role="alert" class="flex flex-col items-start gap-3">
        <p class="text-muted-foreground text-sm">{{ t("admin.dashboard.module.error") }}</p>
        <Button type="button" variant="outline" size="sm" data-slot="dashboard-module-retry" @click="emit('refresh')">{{ t("admin.dashboard.module.retry") }}</Button>
      </div>
      <slot v-else />
    </CardContent>
    <CardFooter class="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
      <span data-slot="dashboard-module-updated" class="tabular-nums">{{ updated ? t("admin.dashboard.module.updated", { time: updated }) : "" }}</span>
      <div class="flex items-center gap-2">
        <slot name="footer-link" />
        <Button type="button" variant="ghost" size="sm" data-slot="dashboard-module-refresh" :disabled="refreshing || status === 'loading'" :aria-label="t('admin.dashboard.module.refresh')" @click="emit('refresh')">
          <IconRefresh class="size-4" :class="refreshing && 'animate-spin motion-reduce:animate-none'" aria-hidden="true" />
          {{ t("admin.dashboard.module.refresh") }}
        </Button>
      </div>
    </CardFooter>
  </Card>
</template>
