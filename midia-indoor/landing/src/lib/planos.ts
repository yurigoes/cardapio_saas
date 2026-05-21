/**
 * Planos da Three Digital Mídia Indoor.
 * Editar aqui reflete na landing + página de cadastro.
 */
export interface Plano {
  id:        string;
  nome:      string;
  preco:     number;       // R$/mês por tela
  telas:     string;       // descrição de quantas telas
  destaque?: boolean;
  recursos:  string[];
}

export const PLANOS: Plano[] = [
  {
    id:    "essencial",
    nome:  "Essencial",
    preco: 49.90,
    telas: "1 tela",
    recursos: [
      "1 tela / player",
      "Conteúdo ilimitado (imagens + vídeos)",
      "Agendamento por horário",
      "Painel de gerenciamento",
      "Suporte por WhatsApp",
    ],
  },
  {
    id:    "profissional",
    nome:  "Profissional",
    preco: 39.90,
    telas: "a partir de 3 telas",
    destaque: true,
    recursos: [
      "3+ telas (preço por tela)",
      "Tudo do Essencial",
      "Layouts com múltiplas regiões",
      "Playlists e campanhas",
      "Relatório do que tocou (proof-of-play)",
      "Prioridade no suporte",
    ],
  },
  {
    id:    "rede",
    nome:  "Rede",
    preco: 29.90,
    telas: "a partir de 10 telas",
    recursos: [
      "10+ telas (preço por tela)",
      "Tudo do Profissional",
      "Gestão multi-loja centralizada",
      "Acesso à API",
      "Conteúdo segmentado por loja/região",
      "Gerente de conta dedicado",
    ],
  },
];

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
