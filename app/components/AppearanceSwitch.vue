<script setup lang="ts">
import { IconMoon, IconSun } from "@tabler/icons-vue";

const props = withDefaults(
  defineProps<{ variant?: "default" | "compact" }>(),
  { variant: "default" },
);

const { t } = useI18n();
const { isDark, setDark } = useAppearance();

// The variant changes only size and spacing. Thumb travel = track width - thumb size - 4px.
const sizing = computed(() =>
  props.variant === "default"
    ? "h-8 w-14 **:data-[slot=switch-thumb]:size-7 dark:ltr:**:data-[slot=switch-thumb]:translate-x-6! dark:rtl:**:data-[slot=switch-thumb]:-translate-x-6!"
    : "h-7 w-12 **:data-[slot=switch-thumb]:size-6 dark:ltr:**:data-[slot=switch-thumb]:translate-x-5! dark:rtl:**:data-[slot=switch-thumb]:-translate-x-5!",
);
</script>

<template>
  <!--
    State is shown by CSS from the `.dark` class that the pre-paint script sets, so cached HTML
    has the right thumb position on first paint; `aria-checked` follows after mount.
  -->
  <Switch
    :model-value="isDark"
    :aria-label="t('theme.switch.label')"
    data-slot="appearance-switch"
    :class="[
      'border-border/50 bg-input! dark:bg-muted! relative motion-reduce:transition-none **:data-[slot=switch-thumb]:absolute **:data-[slot=switch-thumb]:inset-s-0.5 **:data-[slot=switch-thumb]:grid **:data-[slot=switch-thumb]:place-items-center **:data-[slot=switch-thumb]:translate-x-0! **:data-[slot=switch-thumb]:bg-background! motion-reduce:**:data-[slot=switch-thumb]:transition-none',
      sizing,
    ]"
    @update:model-value="setDark"
  >
    <template #thumb>
      <!-- One icon, centered in the thumb; which one shows follows the `.dark` class. -->
      <IconSun aria-hidden="true" :size="14" class="text-foreground dark:hidden" />
      <IconMoon aria-hidden="true" :size="14" class="text-foreground hidden dark:block" />
    </template>
  </Switch>
</template>
