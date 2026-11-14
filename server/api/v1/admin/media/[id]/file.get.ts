import { readMediaFile } from "../../../../../services/admin-media.service";
import { uuidParam } from "../../../../../utils/admin-handlers";
import { useObjectStorage } from "../../../../../utils/object-storage";
import { requireSignedIn } from "../../../../../utils/require-auth";

// Preview of a stored image, including a private (staged) one that has no public URL. Any signed-in User may read it:
// the id is an unguessable uuid and the bytes are an image the User just uploaded or one that is already public.
export default defineEventHandler(async (event) => {
  await requireSignedIn(event);
  const { buffer, mimeType } = await readMediaFile({ db: useDb(), storage: useObjectStorage() }, uuidParam(event));
  setResponseHeader(event, "content-type", mimeType);
  setResponseHeader(event, "x-content-type-options", "nosniff");
  return buffer;
});
