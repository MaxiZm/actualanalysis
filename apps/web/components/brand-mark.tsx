/** Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V4 */
export function BrandMark({
  className = "",
  size = 30,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={`brand-logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="13" fill="var(--color-brand)" />
      <path
        d="M9 46 21 18h7l12 28h-8l-7.5-18L17 46H9Z"
        fill="var(--color-brand-ink)"
      />
      <path
        d="M28 46 40 18h7l12 28h-8l-7.5-18L36 46h-8Z"
        fill="var(--color-brand-ink)"
      />
      <path d="M17 36h15v6H17zM36 36h15v6H36z" fill="var(--color-brand-ink)" />
    </svg>
  );
}
