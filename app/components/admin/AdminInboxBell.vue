<script setup lang="ts">
// MOUNT POINT, empty on purpose. The top bar renders this between the breadcrumb and the user menu; the Inbox slice
// replaces this body with the bell (unread count, popover) and nothing else in the shell changes.
// `display: contents` on an empty element keeps it out of the header's layout.
</script>

<template>
  <span class="contents" data-slot="admin-inbox-bell" />
</template>
