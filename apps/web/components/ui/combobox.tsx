"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { TextureButton } from "./texture-button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

export type Choice = { value: string; label: string };
export function Combobox({
  label,
  options,
  value,
  onChange,
  multiple = false,
  placeholder,
  className = "",
}: {
  label: string;
  options: Choice[];
  value: string | string[];
  onChange: (value: string) => void;
  multiple?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value : [value];
  const caption = multiple
    ? `${label}${selected.length ? ` · ${selected.length}` : ""}`
    : (options.find((item) => item.value === value)?.label ??
      placeholder ??
      label);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TextureButton
          variant="secondary"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          className={`cult-combobox ${className}`}
        >
          <span>{caption}</span>
          <ChevronsUpDown size={14} aria-hidden="true" />
        </TextureButton>
      </PopoverTrigger>
      <PopoverContent className="cult-options" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No matches found.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.value}`}
                onSelect={() => {
                  onChange(option.value);
                  if (!multiple) setOpen(false);
                }}
              >
                <Check
                  size={14}
                  aria-hidden="true"
                  style={{ opacity: selected.includes(option.value) ? 1 : 0 }}
                />
                <span>{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
