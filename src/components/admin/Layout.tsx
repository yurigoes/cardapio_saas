"use client";

import { ReactNode } from "react";
import Menu from "./Menu";
import { AdminUser } from "@/lib/adminModules";

export default function AdminLayout({
  children,
  active,
  onChange,
  empresa,
  user
}: {
  children: ReactNode;
  active: string;
  onChange: (tab: string) => void;
  empresa?: any;
  user?: AdminUser | null;
}) {
  const primaryColor =
    String(empresa?.cor_primaria || "").trim().startsWith("#")
      ? String(empresa?.cor_primaria).trim()
      : "#d9b35f";

  return (
    <div
      className="flex h-screen overflow-hidden bg-black text-white"
      style={
        {
          "--primary-color": primaryColor
        } as React.CSSProperties
      }
    >
      <Menu active={active} onChange={onChange} empresa={empresa} user={user} />

      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
