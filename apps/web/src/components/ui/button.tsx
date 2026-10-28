import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-lime text-ink hover:bg-[#d2ef77]",
        dark: "bg-ink text-white hover:bg-pine",
        outline: "border border-ink/15 bg-white text-ink hover:border-ink/35",
        ghost: "text-ink hover:bg-black/5",
      },
      size: {
        default: "min-h-11 px-5 text-sm",
        small: "min-h-9 px-4 text-xs",
        large: "min-h-13 px-7 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}
