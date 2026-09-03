import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** ELIO typography utilities (`text-body`, `text-h1`, …) are font-size only — keep them separate from `text-*` color utilities in merge. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-lg",
            "display",
            "h1",
            "h2",
            "h3",
            "body-lg",
            "body",
            "body-sm",
            "caption",
            "money",
            "money-hero",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
