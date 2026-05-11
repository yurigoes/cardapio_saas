"use client";

import { useRouter } from "next/navigation";
import {
  Boxes,
  ChefHat,
  ClipboardList,
  Crown,
  Gift,
  LayoutGrid,
  LogOut,
  Settings,
  SlidersHorizontal,
  Tags,
  Users,
  Video
} from "lucide-react";
import { clearAdminSession } from "@/lib/adminAuth";
import { AdminUser, canAccessModule } from "@/lib/adminModules";

const items = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, route: "main" },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList, route: "pedidos" },
  { id: "produtos", label: "Produtos", icon: Boxes, route: "main" },
  { id: "cozinha", label: "Cozinha (KDS)", icon: ChefHat, route: "main" },
  { id: "ranking", label: "Ranking (Fidelidade)", icon: Crown, route: "main" },
  { id: "cupons", label: "Cupons e Fidelidade", icon: Gift, route: "main" },
  { id: "personalizacao", label: "Personalização", icon: SlidersHorizontal, route: "main" },
  { id: "usuarios", label: "Contas Admin", icon: Users, route: "usuarios" },
  { id: "categorias", label: "Categorias", icon: Tags, route: "main" },
  { id: "videos", label: "Vídeos", icon: Video, route: "main" },
  { id: "config", label: "Configurações", icon: Settings, route: "main" }
];

export default function Menu({
  active,
  onChange,
  empresa,
  user
}: {
  active: string;
  onChange: (tab: string) => void;
  empresa?: any;
  user?: AdminUser | null;
}) {
  const router = useRouter();

  const empresaId =
    empresa?.Id ||
    empresa?.id ||
    empresa?.empresa_id ||
    empresa?.empresaId ||
    user?.empresa_id ||
    "";

  function handleItemClick(itemId: string, route?: string) {
    if (!empresaId) {
      onChange(itemId);
      return;
    }

    if (route === "pedidos") {
      router.push(`/admin/${empresaId}/pedidos`);
      return;
    }

    if (route === "usuarios") {
      router.push(`/admin/${empresaId}/usuarios`);
      return;
    }

    /**
     * Importante:
     * Quando o usuário está em uma rota isolada, como /admin/4/pedidos,
     * apenas mudar o history.pushState não troca o componente renderizado.
     * Por isso aqui usamos router.push para voltar para a página principal:
     * /admin/4?tab=cozinha
     *
     * O onChange continua sendo chamado para trocar instantaneamente quando
     * o usuário já está dentro de /admin/4.
     */
    onChange(itemId);
    router.push(`/admin/${empresaId}?tab=${itemId}`);
  }

  function logout() {
    clearAdminSession();
    router.replace(`/admin/login?empresaId=${empresaId}`);
  }

  const visibleItems = items.filter((item) => {
    if (!user) return true;
    return canAccessModule(user, item.id);
  });

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#070707]">
      <div className="flex h-24 items-center border-b border-white/10 px-5">
        {empresa?.logo_url ? (
          <img
            src={empresa.logo_url}
            alt={empresa.nome_fantasia || "Logo"}
            className="max-h-14 max-w-[170px] object-contain"
          />
        ) : (
          <div>
            <p className="font-serif text-lg text-white">Yugo Admin</p>
            <p className="text-xs text-zinc-500">Cardápio Digital</p>
          </div>
        )}
      </div>

      {user && (
        <div className="border-b border-white/10 px-4 py-3">
          <p className="truncate text-sm font-black text-white">
            {user.nome || "Administrador"}
          </p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
          <p className="mt-1 text-xs font-bold text-emerald-300">{user.role}</p>
        </div>
      )}

      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id, item.route)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                selected
                  ? "text-black"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
              }`}
              style={{
                background: selected ? "var(--primary-color)" : undefined
              }}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={logout}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-black text-red-200 transition hover:bg-red-500/25"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>

          <p className="text-xs text-zinc-500">
            Sistema preparado para integrações externas: Consumer, iFood, Anota AI e API pública.
          </p>
        </div>
      )}
    </aside>
  );
}
