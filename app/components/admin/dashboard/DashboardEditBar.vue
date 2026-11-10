<script setup lang="ts">
import { IconLayoutGrid, IconRestore } from "@tabler/icons-vue";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// The sticky edit bar of Customize mode (admin-dashboard spec "Customize mode"), below the admin top bar: Choose
// modules (opens the dialog), Reset to default (after a confirmation; it changes the draft only),
// Cancel (discards the draft) and Save (busy while saving). A failed Save stays here with its error; a stale Save
// says the Dashboard was changed on another device and offers Load latest.
defineProps<{ saving: boolean; saveError: boolean; stale: boolean }>();
const emit = defineEmits<{ choose: []; reset: []; cancel: []; save: []; "load-latest": [] }>();
const { t } = useI18n();
const confirmingReset = ref(false);
</script>

<template>
  <section data-slot="dashboard-edit-bar" :aria-label="t('admin.dashboard.customize.bar')" class="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-14 z-10 -mx-1 flex flex-col gap-2 rounded-lg border px-3 py-2 shadow-sm backdrop-blur">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" data-slot="dashboard-choose-modules" :disabled="saving" @click="emit('choose')">
          <IconLayoutGrid class="size-4" aria-hidden="true" />
          {{ t("admin.dashboard.customize.chooseModules") }}
        </Button>
        <Button type="button" variant="outline" size="sm" data-slot="dashboard-reset" :disabled="saving" @click="confirmingReset = true">
          <IconRestore class="size-4" aria-hidden="true" />
          {{ t("admin.dashboard.customize.reset") }}
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" data-slot="dashboard-cancel" :disabled="saving" @click="emit('cancel')">{{ t("admin.dashboard.customize.cancel") }}</Button>
        <Button type="button" size="sm" data-slot="dashboard-save" :disabled="saving" :aria-busy="saving" @click="emit('save')">
          {{ saving ? t("admin.dashboard.customize.saving") : t("admin.dashboard.customize.save") }}
        </Button>
      </div>
    </div>
    <div v-if="stale" role="alert" data-slot="dashboard-stale" class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p class="m-0">{{ t("admin.dashboard.customize.stale") }}</p>
      <Button type="button" variant="outline" size="sm" data-slot="dashboard-load-latest" @click="emit('load-latest')">{{ t("admin.dashboard.customize.loadLatest") }}</Button>
    </div>
    <p v-else-if="saveError" role="alert" data-slot="dashboard-save-error" class="text-destructive m-0 text-sm">{{ t("admin.dashboard.customize.saveFailed") }}</p>

    <AlertDialog v-model:open="confirmingReset">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("admin.dashboard.customize.resetTitle") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t("admin.dashboard.customize.resetBody") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("admin.dashboard.customize.cancel") }}</AlertDialogCancel>
          <AlertDialogAction data-slot="dashboard-reset-confirm" @click="emit('reset')">{{ t("admin.dashboard.customize.resetConfirm") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
