"use client";

export function AdminField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-bold text-zinc-400">{label}</span>
      {children}
    </label>
  );
}