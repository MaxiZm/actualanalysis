"use client";
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
export function Hint({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="cult-tooltip" sideOffset={6}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
