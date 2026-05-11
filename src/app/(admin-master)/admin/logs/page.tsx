import EmBreve from "@/components/EmBreve";
import { Terminal } from "lucide-react";
export default function AdminLogsPage() {
  return <EmBreve titulo="Logs do Sistema" descricao="Logs técnicos, erros de aplicação e eventos de infraestrutura." icone={Terminal} />;
}
