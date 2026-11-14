<script setup lang="ts">
import RoleEditor from "~/components/admin/RoleEditor.vue";

// Create a Role (.specs/users-and-roles/spec.md "Role page"). Only a User who may manage Roles reaches it.
definePageMeta({ permission: "manage-roles" });
</script>

<template>
  <RoleEditor />
</template>
