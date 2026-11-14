import { z } from "zod";
import { typeError } from "./issue-messages";

// The image part shared by every record that can carry one (a ticket): a staged upload's
// id with Persian and English alt text. Omitting `imageMediaObjectId` leaves the image unchanged and
// `null` removes it; once an image is set both alt texts are required.

const optionalAlt = z
  .string(typeError({ invalid: "invalid" }))
  .trim()
  .max(300, "too_long")
  .nullish()
  .transform((value) => (value === undefined ? undefined : value ? value : null));

export const ownerImageShape = {
  imageMediaObjectId: z.string().uuid("invalid").nullish(),
  imageAltFa: optionalAlt,
  imageAltEn: optionalAlt,
};

type WithImage = { imageMediaObjectId?: string | null; imageAltFa?: string | null; imageAltEn?: string | null };

/** Adds the rule "both alt texts are required once an image is set" to a schema that includes `ownerImageShape`. */
// Generic over the parsed output (not the schema type) so the full output type survives `superRefine`.
export function withOwnerImageRule<Out extends WithImage, In>(schema: z.ZodType<Out, In>) {
  return schema.superRefine((input, ctx) => {
    if (!input.imageMediaObjectId) return;
    if (!input.imageAltFa) ctx.addIssue({ code: "custom", path: ["imageAltFa"], message: "required" });
    if (!input.imageAltEn) ctx.addIssue({ code: "custom", path: ["imageAltEn"], message: "required" });
  });
}

/** An attached image as the admin API returns it (the public object key, never a bucket). */
export interface OwnerImage {
  mediaObjectId: string;
  /** The public object key; `mediaImageUrl(key, ...)` builds the URL of a variant. */
  key: string;
  width: number;
  height: number;
  altFa: string;
  altEn: string;
}
