import EmBreve from "@/components/EmBreve";
import { Settings } from "lucide-react";
export default function AdminConfigPage() {
  return <EmBreve titulo="Configurações (Master)" descricao="Configurações globais da plataforma, variáveis de sistema e feature flags." icone={Settings} />;
}
