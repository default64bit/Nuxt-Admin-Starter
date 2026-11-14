<script setup lang="ts">
import { IconUserCircle } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAccount } from "~/composables/admin/useAdminAccount";
import { useAdminBreadcrumbs } from "~/composables/admin/useAdminBreadcrumbs";
import type { NameErrors, NameValues } from "~~/shared/utils/account-form";

// My account (users-and-roles spec): any signed-in User edits their own names and changes their phone through a
// code sent to the new number. It has no page Permission, so there is no `permission` meta: the admin middleware
// lets every signed-in User in and the API answers 401 to anyone else.
const { t } = useI18n();
const title = computed(() => t("admin.account.title"));
useHead({ title });
useAdminBreadcrumbs([{ labelKey: "admin.account.title" }]);

const { account, isPending, isError, retry, save, isSaving } = useAdminAccount();
const serverErrors = ref<NameErrors>();
const changeOpen = ref(false);

async function onSubmit(values: NameValues) {
  const outcome = await save(values);
  serverErrors.value = outcome.status === "invalid" ? outcome.errors : undefined;
}
</script>

<template>
  <AdminPageHeader :title="title" :icon="IconUserCircle">
    <div v-if="account" class="flex flex-col gap-6">
      <AdminAccountForm :account="account" :saving="isSaving" :server-errors="serverErrors" @submit="onSubmit" @change-phone="changeOpen = true" />
      <AdminPhoneChangeDialog v-model:open="changeOpen" :current-phone="account.phone" />
    </div>
    <div v-else-if="isError" role="alert" data-slot="account-error" class="flex max-w-2xl flex-col items-start gap-3 rounded-lg border p-4">
      <p class="text-sm font-medium">{{ t("admin.account.loadFailed") }}</p>
      <Button data-slot="account-retry" variant="outline" size="sm" @click="retry()">{{ t("admin.shell.retry") }}</Button>
    </div>
    <div v-else-if="isPending" data-slot="account-skeleton" class="flex max-w-2xl flex-col gap-6" role="status" :aria-label="t('admin.account.loading')">
      <Card>
        <CardContent class="flex flex-col gap-4">
          <div class="grid gap-4 md:grid-cols-2">
            <Skeleton class="h-[3.75rem]" />
            <Skeleton class="h-[3.75rem]" />
          </div>
          <Skeleton class="h-[3.75rem]" />
        </CardContent>
      </Card>
      <Skeleton class="h-9 w-20" />
    </div>
  </AdminPageHeader>
</template>
