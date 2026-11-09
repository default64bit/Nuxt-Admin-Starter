<script setup lang="ts">
import { IconCheck } from "@tabler/icons-vue";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const props = withDefaults(
  defineProps<{ variant?: "default" | "compact" }>(),
  { variant: "default" },
);

const { t } = useI18n();
const { options, current, other } = useLocaleSwitch();

const open = ref(false);

const flags = { fa: "/flags/fa.png", en: "/flags/en.png" } as const;
const size = computed(() => (props.variant === "default" ? "h-8" : "h-7"));
</script>

<template>
  <Popover v-model:open="open">
    <!--
      The trigger is a real link to the other language, so it works before hydration and without
      JavaScript; with JavaScript the click opens the menu instead of navigating.
    -->
    <PopoverTrigger as-child>
      <a
        :href="other.href"
        :hreflang="other.code"
        data-slot="language-switch-trigger"
        :class="[
          'border-border/50 bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-full border px-1.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3',
          size,
        ]"
        @click.prevent
        @keydown.space.prevent="open = !open"
      >
        <img
          :src="flags[current.code]"
          alt=""
          width="16"
          height="16"
          class="size-4 rounded-full"
        >
        {{ t(`language.options.${current.code}.short`) }}
        <span class="sr-only">, {{ t("language.switch.triggerLabel", { name: t(`language.options.${current.code}.name`) }) }}</span>
      </a>
    </PopoverTrigger>
    <PopoverContent
      side="bottom"
      align="end"
      class="w-36 p-1"
      :aria-label="t('language.switch.menuLabel')"
    >
      <nav :aria-label="t('language.switch.label')" class="flex flex-col gap-0.5">
        <NuxtLink
          v-for="option in options"
          :key="option.code"
          :to="option.href"
          :lang="option.code"
          :hreflang="option.code"
          :aria-current="option.current ? 'true' : undefined"
          class="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-3"
          @click="open = false"
        >
          <img
            :src="flags[option.code]"
            alt=""
            width="16"
            height="16"
            class="size-4 rounded-full"
          >
          <span>{{ t(`language.options.${option.code}.name`) }}</span>
          <IconCheck
            v-if="option.current"
            aria-hidden="true"
            class="ms-auto size-4"
          />
        </NuxtLink>
      </nav>
    </PopoverContent>
  </Popover>
</template>
