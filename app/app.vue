<script setup lang="ts">
import { ConfigProvider } from "reka-ui";

const { direction } = useRootAttributes();
useFontPreload();
</script>

<template>
  <ConfigProvider :dir="direction" :scroll-body="false">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </ConfigProvider>
</template>
