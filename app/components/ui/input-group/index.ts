import type { VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "vue";
import type { ButtonVariants } from "@/components/ui/button";
import { cva } from "class-variance-authority";

export { default as InputGroup } from "./InputGroup.vue";
export { default as InputGroupAddon } from "./InputGroupAddon.vue";
export { default as InputGroupButton } from "./InputGroupButton.vue";
export { default as InputGroupInput } from "./InputGroupInput.vue";
export { default as InputGroupText } from "./InputGroupText.vue";

export const inputGroupAddonVariants = cva(
  "text-muted-foreground h-full gap-2 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*=size-])]:size-4 flex cursor-text items-center justify-center select-none rounded-s-sm",
  {
    variants: {
      align: {
        "inline-start":
          "ps-2 has-[>button]:-ms-1 has-[>kbd]:ms-[-0.15rem] order-first",
        "inline-end":
          "pe-2 has-[>button]:-me-1 has-[>kbd]:me-[-0.15rem] order-last",
        "block-start":
          "px-2.5 pbs-2 group-has-[>input]/input-group:pbs-2 [.border-be]:pbe-2 order-first w-full justify-start",
        "block-end":
          "px-2.5 pbe-2 group-has-[>input]/input-group:pbe-2 [.border-bs]:pbs-2 order-last w-full justify-start",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

export type InputGroupVariants = VariantProps<typeof inputGroupAddonVariants>;

export const inputGroupButtonVariants = cva(
  "gap-2 text-sm flex items-center shadow-none",
  {
    variants: {
      size: {
        xs: "h-6 gap-1 rounded-[calc(var(--radius)-5px)] px-1.5 [&>svg:not([class*=size-])]:size-3.5",
        sm: "",
        "icon-xs":
          "size-6 rounded-[calc(var(--radius)-5px)] p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  },
);

export type InputGroupButtonVariants = VariantProps<
  typeof inputGroupButtonVariants
>;

export interface InputGroupButtonProps {
  variant?: ButtonVariants["variant"];
  size?: InputGroupButtonVariants["size"];
  class?: HTMLAttributes["class"];
}
