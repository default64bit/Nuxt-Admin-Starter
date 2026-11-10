<script setup lang="ts">
import RoleEditor from "~/components/admin/RoleEditor.vue";

// One Role (.specs/users-and-roles/spec.md "Role page"); a User with only `view-roles` sees it read-only.
definePageMeta({ permission: "view-roles" });
const route = useRoute();
</script>

<template>
  <RoleEditor :key="String(route.params.id)" :role-id="String(route.params.id)" />
</template>
