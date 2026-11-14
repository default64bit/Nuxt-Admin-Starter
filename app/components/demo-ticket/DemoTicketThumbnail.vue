<!-- demo-ticket:start (whole file) -->
<script setup lang="ts">
import { IconPhoto } from "@tabler/icons-vue";
import { useMediaStatus } from "~/composables/admin/useMediaStatus";
import type { DemoTicketRow } from "~~/shared/schemas/demo-ticket";
import { mediaImageUrl } from "~~/shared/utils/media-image";

// The Cards thumbnail of a ticket's image (.specs/demo-tickets/spec.md "Image"). It shows the image variant while media
// storage is On and the ticket has one; otherwise a neutral placeholder, so the card looks the same with media Off.
const props = defineProps<{ image: DemoTicketRow["image"] }>();
const { locale } = useI18n();
const media = useMediaStatus();
const failed = ref(false);
watch(() => props.image?.key, () => (failed.value = false));
const show = computed(() => media.enabled.value && props.image !== null && !failed.value);
</script>

<template>
  <img
    v-if="show && image"
    :src="mediaImageUrl(image.key, { width: 96, height: 96 })"
    :alt="locale === 'en' ? image.altEn : image.altFa"
    width="48"
    height="48"
    loading="lazy"
    class="size-full object-cover"
    data-slot="demo-ticket-thumbnail"
    @error="failed = true"
  >
  <IconPhoto v-else class="text-muted-foreground size-5" aria-hidden="true" data-slot="demo-ticket-thumbnail-placeholder" />
</template>
<!-- demo-ticket:end -->
