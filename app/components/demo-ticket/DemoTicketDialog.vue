<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { toast } from "vue-sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import AdminImageField, { type ImageFieldValue } from "~/components/admin/AdminImageField.vue";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useMediaStatus } from "~/composables/admin/useMediaStatus";
import { useDemoTicketAssignees, useDemoTicketMutations } from "~/composables/demo-ticket/useDemoTickets";
import { DEMO_TICKET_DESCRIPTION_MAX, DEMO_TICKET_PRIORITIES, DEMO_TICKET_STATUS_MESSAGE_KEYS, DEMO_TICKET_TITLE_MAX, type DemoTicketPriority, type DemoTicketStatus } from "~~/shared/constants/demo-ticket";
import { DEMO_TICKET_IMAGE_PURPOSE } from "~~/shared/constants/media";
import type { DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { mediaImageUrl } from "~~/shared/utils/media-image";
import { parseApiError, parseFieldErrors } from "~~/shared/utils/api-error-client";
import { nextDemoTicketStatus } from "~~/shared/utils/demo-ticket-rules";

// Create and edit in one dialog (.specs/demo-tickets/spec.md "Create and edit"). `ticket` is the ticket being edited, or
// null for a new one; a User without `manage-demo-tickets` sees it read-only. A ticket's status can only move one
// step forward, so the status field offers the current status and the next one. The dialog owns its mutations and
// reports `saved` / `deleted`; a failed request keeps what was typed.
const props = defineProps<{
  ticket: DemoTicketRow | null;
  /** The ticket is still loading (a `?ticket=<id>` link): the form shows a skeleton. */
  loading?: boolean;
  /** The ticket could not be loaded, or no longer exists. */
  failed?: "error" | "gone" | null;
  canManage: boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ saved: []; deleted: []; retry: [] }>();

const { t } = useI18n();
const { create, update, remove } = useDemoTicketMutations();
const assignees = useDemoTicketAssignees();
const media = useMediaStatus();
const NONE = "none";

const isNew = computed(() => props.ticket === null && !props.loading && !props.failed);
const editable = computed(() => props.canManage);
const pending = computed(() => create.isPending.value || update.isPending.value || remove.isPending.value || uploading.value);
// The image field works only while media storage is On; with it Off the field says so and the rest of the form still saves.
const imageDisabled = computed(() => !props.canManage || !media.enabled.value);
const imageHint = computed(() => (media.settled.value && !media.enabled.value ? t("admin.media.notConfigured") : undefined));

const form = reactive({ title: "", description: "", priority: "normal" as DemoTicketPriority, assigneeId: NONE, status: "open" as DemoTicketStatus });
const image = ref<ImageFieldValue | null>(null);
const uploading = ref(false);
const errors = ref<Partial<Record<"title" | "description" | "assigneeId" | "imageAltFa" | "imageAltEn", string>>>({});
const deleteOpen = ref(false);

function reset() {
  form.title = props.ticket?.title ?? "";
  form.description = props.ticket?.description ?? "";
  form.priority = props.ticket?.priority ?? "normal";
  form.assigneeId = props.ticket?.assignee?.id ?? NONE;
  form.status = props.ticket?.status ?? "open";
  const saved = props.ticket?.image;
  image.value = saved
    ? { mediaObjectId: saved.mediaObjectId, altFa: saved.altFa, altEn: saved.altEn, previewUrl: mediaImageUrl(saved.key, { width: 128, height: 128 }), width: saved.width, height: saved.height }
    : null;
  errors.value = {};
}
// Each opening, and every new version of the ticket (a save, a reload after a conflict), starts from the saved values.
watch([open, () => props.ticket?.id, () => props.ticket?.updatedAt], () => open.value && reset(), { immediate: true });

const statusOptions = computed<DemoTicketStatus[]>(() => {
  const current = props.ticket?.status;
  if (!current) return [];
  const next = nextDemoTicketStatus(current);
  return next ? [current, next] : [current];
});
const statusLabel = (status: DemoTicketStatus) => t(`admin.demoTickets.statuses.${DEMO_TICKET_STATUS_MESSAGE_KEYS[status]}`);

/** The assignee options: active Users, plus the current assignee if they have since been disabled. */
const assigneeOptions = computed(() => {
  const items = assignees.data.value?.items ?? [];
  const current = props.ticket?.assignee;
  return current && !items.some((person) => person.id === current.id) ? [current, ...items] : items;
});

const messageOf = (code: string) => t(`admin.demoTickets.errors.${{ required: "required", too_long: "tooLong", control_characters: "controlCharacters", unknown: "assigneeUnknown" }[code] ?? "invalid"}`);

function validate(): boolean {
  const next: typeof errors.value = {};
  const title = form.title.trim();
  if (!title) next.title = messageOf("required");
  else if (title.length > DEMO_TICKET_TITLE_MAX) next.title = messageOf("too_long");
  if (form.description.trim().length > DEMO_TICKET_DESCRIPTION_MAX) next.description = messageOf("too_long");
  if (image.value && !image.value.altFa.trim()) next.imageAltFa = t("admin.media.errors.required");
  if (image.value && !image.value.altEn.trim()) next.imageAltEn = t("admin.media.errors.required");
  errors.value = next;
  return Object.keys(next).length === 0;
}

function showServerErrors(error: unknown): boolean {
  const fields = parseFieldErrors(error);
  const next: typeof errors.value = {};
  for (const field of ["title", "description", "assigneeId"] as const) if (fields[field]?.[0]) next[field] = messageOf(fields[field][0]);
  for (const field of ["imageAltFa", "imageAltEn"] as const) if (fields[field]?.[0]) next[field] = t("admin.media.errors.required");
  errors.value = next;
  return Object.keys(next).length > 0;
}

async function submit() {
  if (pending.value || !editable.value || !validate()) return;
  const assigneeId = form.assigneeId === NONE ? null : form.assigneeId;
  const saved = props.ticket?.image ?? null;
  const picked = image.value;
  const imageBody = picked ? { imageMediaObjectId: picked.mediaObjectId, imageAltFa: picked.altFa.trim(), imageAltEn: picked.altEn.trim() } : { imageMediaObjectId: null, imageAltFa: null, imageAltEn: null };
  // An unchanged image is left out of the save, so a ticket whose image cannot be reached (media Off) still saves.
  const imageUnchanged = (picked?.mediaObjectId ?? null) === (saved?.mediaObjectId ?? null) && picked?.altFa.trim() === saved?.altFa && picked?.altEn.trim() === saved?.altEn;
  try {
    if (props.ticket) {
      await update.mutateAsync({
        id: props.ticket.id,
        body: { title: form.title, description: form.description, priority: form.priority, assigneeId, status: form.status, expectedUpdatedAt: props.ticket.updatedAt, ...(imageUnchanged || (!picked && !saved) ? {} : imageBody) },
      });
    } else {
      await create.mutateAsync({ title: form.title, description: form.description, priority: form.priority, assigneeId, ...(picked ? imageBody : { imageAltFa: undefined, imageAltEn: undefined }) });
    }
    toast.success(t(props.ticket ? "admin.demoTickets.toast.saved" : "admin.demoTickets.toast.created"));
    emit("saved");
  } catch (error) {
    handleFailure(error);
  }
}

function handleFailure(error: unknown) {
  const parsed = parseApiError(error);
  if (parsed.status === 400 && showServerErrors(error)) return;
  if (parsed.code === "media_invalid") toast.error(t("admin.media.errors.mediaInvalid"));
  else if (parsed.code === "stale_version") toast.error(t("admin.demoTickets.toast.stale"));
  else if (parsed.code === "invalid_transition") toast.error(t("admin.demoTickets.toast.invalidTransition"));
  else if (parsed.code === "not_found") {
    toast.error(t("admin.demoTickets.toast.gone"));
    emit("deleted");
  } else if (parsed.status !== 401 && parsed.status !== 403) toast.error(t("admin.demoTickets.toast.failed"));
  // The lists and the ticket are refetched by the mutation; the form then restarts from the reloaded ticket.
}

async function confirmDelete() {
  if (!props.ticket) return;
  try {
    await remove.mutateAsync(props.ticket.id);
    toast.success(t("admin.demoTickets.toast.deleted"));
    deleteOpen.value = false;
    emit("deleted");
  } catch (error) {
    deleteOpen.value = false;
    handleFailure(error);
  }
}

const title = computed(() => t(isNew.value ? "admin.demoTickets.dialog.createTitle" : editable.value ? "admin.demoTickets.dialog.editTitle" : "admin.demoTickets.dialog.viewTitle"));
const description = computed(() => t(isNew.value ? "admin.demoTickets.dialog.createDescription" : editable.value ? "admin.demoTickets.dialog.editDescription" : "admin.demoTickets.dialog.viewDescription"));
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-slot="demo-ticket-dialog">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="grid gap-3" aria-busy="true" :aria-label="t('admin.demoTickets.dialog.loading')">
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-9 w-full" />
      </div>
      <div v-else-if="failed" role="alert" class="flex flex-col items-start gap-3">
        <p class="text-sm font-medium">{{ t(failed === "gone" ? "admin.demoTickets.dialog.notFound" : "admin.demoTickets.dialog.loadError") }}</p>
        <Button v-if="failed === 'error'" type="button" variant="outline" size="sm" @click="emit('retry')">{{ t("admin.shell.retry") }}</Button>
      </div>
      <form v-else class="grid gap-4" novalidate @submit.prevent="submit">
        <div class="grid gap-1.5">
          <Label for="demo-ticket-title">{{ t("admin.demoTickets.fields.title") }}</Label>
          <Input
            id="demo-ticket-title"
            v-model="form.title"
            autocomplete="off"
            :disabled="!editable"
            :aria-invalid="Boolean(errors.title)"
            :aria-describedby="errors.title ? 'demo-ticket-title-error' : undefined"
            @update:model-value="errors.title = undefined"
          />
          <p v-if="errors.title" id="demo-ticket-title-error" class="text-destructive text-sm" role="alert">{{ errors.title }}</p>
        </div>
        <div class="grid gap-1.5">
          <Label for="demo-ticket-description">{{ t("admin.demoTickets.fields.description") }}</Label>
          <Textarea
            id="demo-ticket-description"
            v-model="form.description"
            rows="4"
            :disabled="!editable"
            :aria-invalid="Boolean(errors.description)"
            :aria-describedby="errors.description ? 'demo-ticket-description-error' : undefined"
            @update:model-value="errors.description = undefined"
          />
          <p v-if="errors.description" id="demo-ticket-description-error" class="text-destructive text-sm" role="alert">{{ errors.description }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-1.5">
            <Label for="demo-ticket-priority">{{ t("admin.demoTickets.fields.priority") }}</Label>
            <Select v-model="form.priority" :disabled="!editable">
              <SelectTrigger id="demo-ticket-priority" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="priority in DEMO_TICKET_PRIORITIES" :key="priority" :value="priority">{{ t(`admin.demoTickets.priorities.${priority}`) }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-1.5">
            <Label for="demo-ticket-assignee">{{ t("admin.demoTickets.fields.assignee") }}</Label>
            <Select v-model="form.assigneeId" :disabled="!editable">
              <SelectTrigger id="demo-ticket-assignee" class="w-full" :aria-invalid="Boolean(errors.assigneeId)"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE">{{ t("admin.demoTickets.unassigned") }}</SelectItem>
                <SelectItem v-for="person in assigneeOptions" :key="person.id" :value="person.id">{{ demoTicketPersonName(person, t("admin.demoTickets.unnamedUser")) }}</SelectItem>
              </SelectContent>
            </Select>
            <p v-if="errors.assigneeId" class="text-destructive text-sm" role="alert">{{ errors.assigneeId }}</p>
          </div>
        </div>
        <AdminImageField
          v-model="image"
          :purpose="DEMO_TICKET_IMAGE_PURPOSE"
          id-prefix="demo-ticket-image"
          :disabled="imageDisabled"
          :hint="imageHint"
          :errors="{ altFa: errors.imageAltFa, altEn: errors.imageAltEn }"
          @busy="uploading = $event"
        />
        <div v-if="ticket" class="grid gap-1.5">
          <Label for="demo-ticket-status">{{ t("admin.demoTickets.fields.status") }}</Label>
          <Select v-model="form.status" :disabled="!editable || statusOptions.length < 2">
            <SelectTrigger id="demo-ticket-status" class="w-full" aria-describedby="demo-ticket-status-hint"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="status in statusOptions" :key="status" :value="status">{{ statusLabel(status) }}</SelectItem>
            </SelectContent>
          </Select>
          <p id="demo-ticket-status-hint" class="text-muted-foreground text-sm">{{ t(statusOptions.length < 2 ? "admin.demoTickets.dialog.statusFinal" : "admin.demoTickets.dialog.statusHint") }}</p>
        </div>
        <DialogFooter class="gap-2 sm:justify-between">
          <Button v-if="ticket && editable" type="button" variant="outline" class="text-destructive" data-slot="delete-demo-ticket" :disabled="pending" @click="deleteOpen = true">{{ t("admin.demoTickets.delete.button") }}</Button>
          <span v-else />
          <span class="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" :disabled="pending" @click="open = false">{{ t(editable ? "admin.demoTickets.dialog.cancel" : "admin.demoTickets.dialog.close") }}</Button>
            <Button v-if="editable" type="submit" :loading="create.isPending.value || update.isPending.value">{{ t(ticket ? "admin.demoTickets.dialog.save" : "admin.demoTickets.dialog.create") }}</Button>
          </span>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog v-model:open="deleteOpen">
    <AlertDialogContent data-slot="delete-demo-ticket-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("admin.demoTickets.delete.title") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("admin.demoTickets.delete.description", { title: ticket?.title ?? "" }) }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("admin.demoTickets.delete.cancel") }}</AlertDialogCancel>
        <AlertDialogAction variant="outline" class="text-destructive" data-slot="confirm-delete-demo-ticket" @click.prevent="confirmDelete">{{ t("admin.demoTickets.delete.confirm") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
