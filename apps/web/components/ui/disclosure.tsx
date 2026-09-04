"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { TextureButton } from "./texture-button";
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="cult-disclosure">
      <TextureButton
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <ChevronDown
          size={16}
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </TextureButton>
      <div id={id} hidden={!open} className="disclosure-content">
        {children}
      </div>
    </section>
  );
}
