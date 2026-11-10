<script setup lang="ts">
import { ADMIN_NAV } from "~~/shared/constants/admin-nav";
import { ADMIN_NAV_ICONS } from "./admin-nav-icons";

// Title-only stand-in for a destination whose feature is not built yet. The feature replaces the page file that
// renders this; nothing else changes.
const props = defineProps<{ navKey: string }>();
const { t } = useI18n();
const item = computed(() => ADMIN_NAV.find((entry) => entry.key === props.navKey));
const title = computed(() => (item.value ? t(item.value.labelKey) : ""));
useHead({ title });
</script>

<template>
  <AdminPageHeader :title="title" :icon="ADMIN_NAV_ICONS[navKey]" />
</template>
