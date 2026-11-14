<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminFormat } from "~/composables/admin/useAdminFormat";

// The Analytics strip frame above a list page: a labelled region that owns the loading skeleton and the
// "Couldn't load" state with Retry (this strip only); the figures go in the default slot.
defineProps<{ name: string; label: string; status: "loading" | "error" | "ready" }>();
defineEmits<{ retry: [] }>();
const { t } = useAdminFormat();
</script>

<template>
  <Card :data-admin-strip="name" :data-status="status" role="region" :aria-label="label" class="px-4 py-4">
    <div v-if="status === 'loading'" class="grid gap-4 sm:grid-cols-3" aria-busy="true" data-slot="strip-loading">
      <Skeleton v-for="n in 3" :key="n" class="h-16 w-full" />
    </div>
    <div v-else-if="status === 'error'" role="alert" class="flex flex-wrap items-center justify-between gap-3">
      <p class="m-0 text-sm font-medium">{{ t("admin.strip.loadError") }}</p>
      <Button type="button" variant="outline" size="sm" @click="$emit('retry')">{{ t("admin.shell.retry") }}</Button>
    </div>
    <slot v-else />
  </Card>
</template>
