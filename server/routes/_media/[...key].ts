import { useMediaVariants } from "../../services/media-variants.service";
import { mediaVariantResponse, mediaNotConfiguredResponse } from "../../utils/media-variant-handler";
import { tryObjectStorage } from "../../utils/object-storage";

// Image variants: `GET|HEAD /_media/<public key>?w=&h=&fit=&f=&q=`. Answers "not configured" while media storage is Off.
export default defineEventHandler((event) => {
  const storage = tryObjectStorage();
  return storage ? mediaVariantResponse(event, useMediaVariants(storage)) : mediaNotConfiguredResponse(event);
});
