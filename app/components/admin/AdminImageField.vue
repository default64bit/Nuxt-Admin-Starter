<script setup lang="ts">
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminUploader, precheckImage, UploadError } from "~/utils/admin-upload";
import type { MediaPurpose } from "~~/shared/constants/media";
import { toLocaleDigits } from "~~/shared/utils/locale-digits";

/**
 * The shared image slot of the admin forms (.specs/media/spec.md): pick or drop a file, watch it upload
 * (at most three at a time, cancellable), then give it Persian and English alt text. It emits the
 * staged upload's id with the alt texts; the owning form submits them and the server attaches the image.
 */
export interface ImageFieldValue {
  mediaObjectId: string;
  altFa: string;
  altEn: string;
  previewUrl: string;
  /** Shown beside the preview when known (a freshly picked file). */
  name?: string;
  type?: string;
  size?: number;
  width?: number;
  height?: number;
}

const props = defineProps<{
  purpose: MediaPurpose;
  modelValue: ImageFieldValue | null;
  errors?: { altFa?: string; altEn?: string };
  idPrefix?: string;
  /** Media storage is Off, or the User may not edit: the field shows `hint` and nothing can be picked. */
  disabled?: boolean;
  hint?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: ImageFieldValue | null]; busy: [busy: boolean] }>();

const { t, locale } = useI18n();
const id = props.idPrefix ?? `image-${props.purpose}`;
const input = ref<HTMLInputElement | null>(null);
const status = ref<"idle" | "uploading" | "error">("idle");
const progress = ref(0);
const errorKey = ref<string | null>(null);
const lastFile = ref<File | null>(null);
let controller: AbortController | null = null;

watch(status, (value) => emit("busy", value === "uploading"));

const ERROR_KEYS: Record<string, string> = {
  unsupported_type: "unsupportedType",
  too_large: "tooLarge",
  not_decodable: "notDecodable",
  too_many_pixels: "tooManyPixels",
  rate_limited: "rateLimited",
};
const digitLocale = computed(() => (locale.value === "en" ? "en" : "fa"));
const sizeText = (bytes: number) =>
  bytes >= 1048576
    ? t("admin.media.units.mib", { value: toLocaleDigits((bytes / 1048576).toFixed(1), digitLocale.value) })
    : t("admin.media.units.kib", { value: toLocaleDigits(String(Math.max(1, Math.round(bytes / 1024))), digitLocale.value) });

async function start(file: File) {
  lastFile.value = file;
  const refused = precheckImage(file);
  if (refused) {
    errorKey.value = ERROR_KEYS[refused]!;
    status.value = "error";
    return;
  }
  controller = new AbortController();
  status.value = "uploading";
  progress.value = 0;
  errorKey.value = null;
  try {
    const media = await adminUploader.upload(file, props.purpose, { onProgress: (fraction) => (progress.value = fraction), signal: controller.signal });
    emit("update:modelValue", { mediaObjectId: media.id, altFa: "", altEn: "", previewUrl: media.previewUrl, name: file.name, type: media.mimeType, size: media.byteSize, width: media.width, height: media.height });
    status.value = "idle";
  } catch (error) {
    if (error instanceof UploadError && error.aborted) {
      status.value = "idle";
      return;
    }
    const code = error instanceof UploadError ? error.code : null;
    errorKey.value = code && ERROR_KEYS[code] ? ERROR_KEYS[code]! : error instanceof UploadError && error.network ? "network" : "failed";
    status.value = "error";
  } finally {
    controller = null;
  }
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = ""; // picking the same file again must fire `change` again
  if (file) void start(file);
}
function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (file) void start(file);
}
const choose = () => input.value?.click();
const cancel = () => controller?.abort();
const remove = () => emit("update:modelValue", null);
const retry = () => lastFile.value && void start(lastFile.value);
const setAlt = (field: "altFa" | "altEn", value: string | number) => props.modelValue && emit("update:modelValue", { ...props.modelValue, [field]: String(value) });
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="grid gap-2" data-slot="admin-image-field" @dragover.prevent @drop.prevent="onDrop">
    <span :id="`${id}-label`" class="text-sm leading-none font-medium">{{ t("admin.media.field.label") }}</span>
    <input :id="`${id}-input`" ref="input" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" tabindex="-1" :aria-labelledby="`${id}-label`" @change="onPick">

    <!-- Uploading -->
    <div v-if="status === 'uploading'" class="grid gap-2 rounded-lg border p-3" role="status">
      <p class="text-sm">{{ t("admin.media.field.uploading") }} <span v-if="lastFile" dir="ltr" class="text-muted-foreground">{{ lastFile.name }}</span></p>
      <div class="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" :aria-label="t('admin.media.field.progress')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(progress * 100)">
        <div class="bg-primary h-full transition-all" :style="{ width: `${Math.round(progress * 100)}%` }" />
      </div>
      <div><Button type="button" variant="outline" size="sm" @click="cancel">{{ t("admin.media.field.cancel") }}</Button></div>
    </div>

    <!-- Ready -->
    <div v-else-if="modelValue" class="grid gap-3 rounded-lg border p-3">
      <div class="flex items-center gap-3">
        <img :src="modelValue.previewUrl" :alt="t('admin.media.field.previewAlt')" width="64" height="64" class="bg-muted size-16 shrink-0 rounded-md object-cover" >
        <div class="min-w-0 flex-1 text-sm">
          <p v-if="modelValue.name" class="truncate font-medium" dir="ltr">{{ modelValue.name }}</p>
          <p v-if="modelValue.type && modelValue.size" class="text-muted-foreground text-xs" dir="ltr">{{ modelValue.type }} · {{ sizeText(modelValue.size) }}</p>
          <p v-else-if="modelValue.width && modelValue.height" class="text-muted-foreground text-xs">{{ t("admin.media.field.dimensions", { width: toLocaleDigits(String(modelValue.width), digitLocale), height: toLocaleDigits(String(modelValue.height), digitLocale) }) }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" :disabled="disabled" @click="choose"><IconUpload aria-hidden="true" />{{ t("admin.media.field.replace") }}</Button>
          <Button type="button" variant="ghost" size="icon-sm" :disabled="disabled" :aria-label="t('admin.media.field.remove')" @click="remove"><IconTrash aria-hidden="true" /></Button>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="grid gap-1.5">
          <Label :for="`${id}-alt-fa`" class="text-xs">{{ t("admin.media.field.altFa") }}</Label>
          <Input :id="`${id}-alt-fa`" :model-value="modelValue.altFa" :disabled="disabled" dir="rtl" autocomplete="off" :aria-invalid="Boolean(errors?.altFa)" :aria-describedby="errors?.altFa ? `${id}-alt-fa-error` : undefined" @update:model-value="setAlt('altFa', $event)" />
          <p v-if="errors?.altFa" :id="`${id}-alt-fa-error`" class="text-destructive text-sm" role="alert">{{ errors.altFa }}</p>
        </div>
        <div class="grid gap-1.5">
          <Label :for="`${id}-alt-en`" class="text-xs">{{ t("admin.media.field.altEn") }}</Label>
          <Input :id="`${id}-alt-en`" :model-value="modelValue.altEn" :disabled="disabled" dir="ltr" autocomplete="off" :aria-invalid="Boolean(errors?.altEn)" :aria-describedby="errors?.altEn ? `${id}-alt-en-error` : undefined" @update:model-value="setAlt('altEn', $event)" />
          <p v-if="errors?.altEn" :id="`${id}-alt-en-error`" class="text-destructive text-sm" role="alert">{{ errors.altEn }}</p>
        </div>
      </div>
    </div>

    <!-- Idle or failed -->
    <div v-else class="grid gap-2 rounded-lg border border-dashed p-3">
      <div class="flex items-center gap-3">
        <div class="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md"><IconPhoto class="size-5" aria-hidden="true" /></div>
        <div class="min-w-0 flex-1 text-sm">
          <p class="text-muted-foreground">{{ t("admin.media.field.idle") }}</p>
          <p class="text-muted-foreground text-xs">{{ hint ?? t("admin.media.field.hint") }}</p>
        </div>
        <Button type="button" variant="outline" size="sm" :disabled="disabled" @click="choose"><IconUpload aria-hidden="true" />{{ t("admin.media.field.select") }}</Button>
      </div>
      <div v-if="status === 'error' && errorKey" class="flex flex-wrap items-center gap-2" role="alert">
        <p class="text-destructive text-sm">{{ t(`admin.media.errors.${errorKey}`) }}</p>
        <Button v-if="lastFile" type="button" variant="outline" size="xs" @click="retry">{{ t("admin.media.field.retry") }}</Button>
      </div>
    </div>
  </div>
</template>
