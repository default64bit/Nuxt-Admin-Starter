import { MEDIA_MAX_UPLOAD_BYTES } from "../../../../../shared/constants/media";
import type { MediaStatus } from "../../../../../shared/schemas/media";
import { tryObjectStorage } from "../../../../utils/object-storage";
import { requireSignedIn } from "../../../../utils/require-auth";

// Whether media storage is configured, so image fields can disable themselves with a hint while it is Off.
export default defineEventHandler(async (event): Promise<MediaStatus> => {
  await requireSignedIn(event);
  return { enabled: tryObjectStorage() !== undefined, maxBytes: MEDIA_MAX_UPLOAD_BYTES };
});
