<script setup lang="ts">
// Parent of every admin page: one route middleware (the page Permission) and the admin layout cover `/admin`,
// `/en/admin` and all children.
definePageMeta({ middleware: "admin", layout: "admin" });
</script>

<template>
  <NuxtPage />
</template>
