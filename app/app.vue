<script setup lang="ts">
import { ConfigProvider } from "reka-ui";
import { Toaster } from "@/components/ui/sonner";
import "vue-sonner/style.css";

const { direction } = useRootAttributes();
const colorMode = useColorMode();
useFontPreload();
</script>

<template>
  <ConfigProvider :dir="direction" :scroll-body="false">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ClientOnly>
      <Toaster close-button :dir="direction" :theme="colorMode.value === 'dark' ? 'dark' : 'light'" />
    </ClientOnly>
  </ConfigProvider>
</template>
