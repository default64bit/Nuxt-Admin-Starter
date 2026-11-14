<script setup lang="ts">
// In-place message for a read or action that came back 403 (a Permission lost or never held while the page was
// open). The page keeps the shell around it; the server stays the authority.
const { t } = useI18n();
</script>

<template>
  <div role="alert" data-slot="admin-forbidden" class="rounded-lg border p-4 text-sm">
    <p class="font-medium">{{ t("admin.forbidden.title") }}</p>
    <p class="text-muted-foreground mt-1">{{ t("admin.forbidden.body") }}</p>
  </div>
</template>
