import { getRequestHeader } from "h3";
import { z } from "zod";
import { isMediaPurpose, MEDIA_MAX_UPLOAD_BYTES, MEDIA_PURPOSE_PERMISSIONS } from "../../../../shared/constants/media";
import { uploadStagedImage } from "../../../services/admin-media.service";
import { DomainError } from "../../../utils/domain-errors";
import { useObjectStorage } from "../../../utils/object-storage";
import { parseQuery } from "../../../utils/parse-query";
import { readLimited } from "../../../utils/read-limited-body";
import { requirePermission } from "../../../utils/require-auth";

/**
 * One raw binary body per request, read with its own size limit (no multipart parser). The CSRF guard allowlists exactly
 * this route and keeps its Origin check. The claimed Content-Type is never used: the real type is sniffed from the bytes.
 * Each purpose is gated by the Permission of the record it is for.
 */
export default defineEventHandler(async (event) => {
  const { purpose } = parseQuery(event, z.object({ purpose: z.string().refine(isMediaPurpose, "invalid") }));
  const actor = await requirePermission(event, MEDIA_PURPOSE_PERMISSIONS[purpose]!);
  const storage = useObjectStorage();
  const length = Number(getRequestHeader(event, "content-length"));
  const body = await readLimited(event.node.req, MEDIA_MAX_UPLOAD_BYTES, Number.isNaN(length) ? undefined : length);
  if (body.byteLength === 0) throw new DomainError(415, "Unsupported Media Type", "unsupported_type");
  const media = await uploadStagedImage({ db: useDb(), storage }, { userId: actor.userId }, { purpose, body });
  setResponseStatus(event, 201);
  return media;
});
