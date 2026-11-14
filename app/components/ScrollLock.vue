<script lang="ts">
const LOCK_CLASS = "scroll-locked";
// Shared across instances (module scope, not per component).
let active = 0;
</script>

<script setup lang="ts">
/**
 * Locks page scrolling while `locked` is true. For overlays Reka does not lock itself (non-modal
 * popovers, the navigation menu).
 *
 * This deliberately does not use Reka's `useBodyScrollLock`: that also sets `pointer-events: none` on
 * `<body>`, which is only right for modal layers that re-enable pointer events on themselves. A
 * non-modal panel (the mega menu) would then lose hover and close the moment it opened. This lock only
 * hides overflow, through a class on `<html>` so it composes with Reka's own inline body lock, and is
 * reference-counted so the page unlocks only when the last lock is released.
 *
 * `<html>` reserves the scrollbar gutter (`scrollbar-gutter: stable`) and the `ConfigProvider` sets
 * `scroll-body` off, so nothing shifts.
 */
const props = defineProps<{ locked: boolean }>();

let held = false;
function sync(value: boolean) {
  if (value === held) return;
  held = value;
  active += value ? 1 : -1;
  document.documentElement.classList.toggle(LOCK_CLASS, active > 0);
}

onMounted(() => {
  sync(props.locked);
  watch(() => props.locked, sync);
});
onBeforeUnmount(() => sync(false));
</script>

<template><slot /></template>
