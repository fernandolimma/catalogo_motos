import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-black/5 bg-white shadow-soft", className)} {...props} />;
}
