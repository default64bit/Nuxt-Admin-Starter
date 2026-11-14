import type { Tx } from "../database/types";
import type { MediaPurpose } from "../../shared/constants/media";
import type { MediaOwner } from "../repositories/media-owners";
import { mediaNotConfigured } from "../utils/domain-errors";
import type { ObjectStorage } from "../utils/object-storage";
import { promoteStagedMedia, resolveStagedMedia, type Promotion } from "./admin-media.service";

/** The image part of an owner's save body: omitted leaves the image alone, `null` removes it, an id attaches a staged upload. */
export interface OwnerImageInput {
  imageMediaObjectId?: string | null;
  imageAltFa?: string | null;
  imageAltEn?: string | null;
}

/** What to write to the owner's image columns: `undefined` = leave alone, `null` = remove. */
export type OwnerImageValues = { mediaObjectId: string; altFa: string; altEn: string } | null;

/**
 * Resolves the image part of an owner save inside its transaction (.specs/media/spec.md): nothing to do when the input
 * leaves the image alone, `null` removes it, and an id must be a staged upload of this User for this purpose (or the
 * owner's own current image). A still-staged upload is promoted to the public bucket; the caller deletes the private
 * copy after the transaction commits. With media Off (no `storage`) only "leave alone" and "remove" work.
 */
export async function applyOwnerImage(
  tx: Tx,
  storage: ObjectStorage | undefined,
  actorUserId: string,
  target: { purpose: MediaPurpose; owner?: MediaOwner },
  input: OwnerImageInput,
): Promise<{ image: OwnerImageValues | undefined; promotion?: Promotion }> {
  if (input.imageMediaObjectId === undefined) return { image: undefined };
  if (input.imageMediaObjectId === null) return { image: null };
  const media = await resolveStagedMedia(tx, { mediaObjectId: input.imageMediaObjectId, purpose: target.purpose, actorUserId, owner: target.owner });
  const image = { mediaObjectId: media.id, altFa: input.imageAltFa!, altEn: input.imageAltEn! };
  if (media.attached) return { image };
  if (!storage) throw mediaNotConfigured();
  return { image, promotion: await promoteStagedMedia(tx, storage, media) };
}
