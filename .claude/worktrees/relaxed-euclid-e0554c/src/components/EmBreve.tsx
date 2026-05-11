import { Construction } from "lucide-react";

interface EmBreveProps {
  titulo:    string;
  descricao?: string;
  icone?:    React.ElementType;
}

export default function EmBreve({ titulo, descricao, icone: Icon = Construction }: EmBreveProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 border border-white/10">
        <Icon className="h-8 w-8 text-slate-500" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-sm">
          {descricao ?? "Esta funcionalidade está em desenvolvimento e será disponibilizada em breve."}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
        <Construction className="h-3 w-3" />
        Em breve
      </span>
    </div>
  );
}
