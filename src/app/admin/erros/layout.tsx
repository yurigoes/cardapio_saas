import MasterShell from "@/components/admin/MasterShell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MasterShell>{children}</MasterShell>;
}
