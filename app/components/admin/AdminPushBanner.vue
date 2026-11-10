<script setup lang="ts">
// MOUNT POINT, empty on purpose. The admin layout renders this under the top bar; the Inbox slice replaces this body
// with the Web Push opt-in banner (and mounts live alerts and the install prompt from the layout and user menu).
</script>

<template>
  <div class="contents" data-slot="admin-push-banner" />
</template>
