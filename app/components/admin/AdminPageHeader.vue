<script setup lang="ts">
import type { Component, HTMLAttributes } from "vue";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { ADMIN_TINT_CLASS } from "~/components/admin/admin-nav-icons";
import { useAdminNav } from "~/composables/admin/useAdminNav";
import { adminHue } from "~~/shared/constants/admin-nav";
import type { Crumb } from "~~/shared/utils/admin-breadcrumbs";

// Title, optional icon, and `actions` / `toolbar` slots. Crumbs normally come from `useAdminBreadcrumbs`; pass them
// here only for an in-page trail. The icon sits in a tinted tile in the hue of the section the page belongs to (or
// the `hue` given); a section without a hue gets the default one.
const props = withDefaults(defineProps<{ crumbs?: Crumb[]; title?: string; icon?: Component; hue?: number; class?: HTMLAttributes["class"] }>(), {
  crumbs: () => [],
  title: undefined,
  icon: undefined,
  hue: undefined,
  class: undefined,
});
const { current } = useAdminNav();
const tint = computed(() => props.hue ?? adminHue(current.value?.key));
</script>

<template>
  <div :class="cn('flex w-full flex-col gap-4', props.class)">
    <Breadcrumb v-if="crumbs.length">
      <BreadcrumbList class="opacity-100">
        <template v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`">
          <BreadcrumbItem>
            <BreadcrumbPage v-if="index === crumbs.length - 1">{{ crumb.label }}</BreadcrumbPage>
            <BreadcrumbLink v-else-if="crumb.to" as-child>
              <NuxtLink :to="crumb.to">{{ crumb.label }}</NuxtLink>
            </BreadcrumbLink>
            <span v-else>{{ crumb.label }}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator v-if="index < crumbs.length - 1" />
        </template>
      </BreadcrumbList>
    </Breadcrumb>
    <div v-if="title" class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <div
          v-if="icon"
          :class="cn(ADMIN_TINT_CLASS, 'text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl')"
          :style="{ '--admin-hue': `${tint}deg` }"
          data-slot="page-icon"
        >
          <component :is="icon" class="size-6" aria-hidden="true" />
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <slot name="after-title" />
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2"><slot name="actions" /></div>
    </div>
    <div v-if="$slots.toolbar" class="flex flex-wrap items-center justify-between gap-3"><slot name="toolbar" /></div>
    <slot />
  </div>
</template>
