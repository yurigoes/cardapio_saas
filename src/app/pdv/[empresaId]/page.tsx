"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Minus,
  Plus,
  QrCode,
  ShoppingCart,
  Trash2,
  UserRound
} from "lucide-react";

const API =
  process.env.NEXT_PUBLIC_CONNECT_API || "https://connect.yugochat.com.br";

type Produto = {
  Id: number;
  nome: string;
  descricao?: string;
  preco: number;
  imagem_url?: string;
  categoria_id?: number;
};

type Categoria = {
  Id: number;
  nome: string;
};

type Empresa = {
  Id: number;
  nome_fantasia: string;
  logo_url?: string;
  cor_primaria?: string;
  video_caixa?: string;
};

type Caixa = {
  Id: number;
  operador_nome: string;
  status: string;
  total_dinheiro?: number;
  total_pix?: number;
  total_cartao?: number;
  total_geral?: number;
};

type UsuarioCardapio = {
  Id: number;
  empresa_id: number | string;
  nome: string;
  email?: string;
  senha_hash?: string;
  role: string;
  telefone?: string | null;
  ativo?: boolean | string | number;
  pin?: string | null;
  codigo_de_barras?: string | null;
  codigo?: string | null;
};

type CartItem = Produto & {
  quantidade: number;
  observacao?: string;
  insumos_texto?: string;
};

type FechamentoValores = {
  dinheiro: number;
  pix: number;
  cartao: number;
};

const cargosSupervisor = ["admin", "adm", "supervisor", "gerente"];

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function isAtivo(value: UsuarioCardapio["ativo"]) {
  return value === true || value === 1 || value === "true" || value === "1";
}

function diferenca(informado: number, sistema: number) {
  return Number(informado || 0) - Number(sistema || 0);
}

export default function PdvPage({
  params
}: {
  params: { empresaId: string };
}) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categoria, setCategoria] = useState<number | "todos">("todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [caixa, setCaixa] = useState<Caixa | null>(null);

  const [supervisorLogado, setSupervisorLogado] =
    useState<UsuarioCardapio | null>(null);
  const [operadorLogado, setOperadorLogado] =
    useState<UsuarioCardapio | null>(null);

  const [valorAbertura, setValorAbertura] = useState(0);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<
    "Dinheiro" | "Pix" | "Cartão"
  >("Dinheiro");

  const [modalMsg, setModalMsg] = useState("");
  const [online, setOnline] = useState(true);
  const [showOnline, setShowOnline] = useState(false);
  const [horaAtual, setHoraAtual] = useState("");

  const [loginSupervisorCodigo, setLoginSupervisorCodigo] = useState("");
  const [loginSupervisorPin, setLoginSupervisorPin] = useState("");
  const [mostrarPinSupervisor, setMostrarPinSupervisor] = useState(false);

  const [mostrarLoginOperador, setMostrarLoginOperador] = useState(false);
  const [mostrarDadosOperador, setMostrarDadosOperador] = useState(false);
  const [loginOperadorCodigo, setLoginOperadorCodigo] = useState("");
  const [loginOperadorPin, setLoginOperadorPin] = useState("");

const [operadorParaAbertura, setOperadorParaAbertura] =
  useState<UsuarioCardapio | null>(null);
const [modalAberturaCaixa, setModalAberturaCaixa] = useState(false);

const [modalSangria, setModalSangria] = useState(false);
const [modalReforco, setModalReforco] = useState(false);
const [valorMovimentacao, setValorMovimentacao] = useState(0);
const [observacaoMovimentacao, setObservacaoMovimentacao] = useState("");

const supervisorInputRef = useRef<HTMLInputElement | null>(null);
const operadorInputRef = useRef<HTMLInputElement | null>(null);

  const [modalFechamento, setModalFechamento] = useState(false);
  const [fechamentoEtapa, setFechamentoEtapa] = useState<
    "supervisor-inicial" | "valores" | "operador" | "supervisor-final"
  >("supervisor-inicial");

  const [fechamentoSupervisorCodigo, setFechamentoSupervisorCodigo] =
    useState("");
  const [fechamentoSupervisorPin, setFechamentoSupervisorPin] = useState("");
  const [fechamentoOperadorCodigo, setFechamentoOperadorCodigo] = useState("");
  const [fechamentoOperadorPin, setFechamentoOperadorPin] = useState("");

  const [valoresFechamento, setValoresFechamento] =
    useState<FechamentoValores>({
      dinheiro: 0,
      pix: 0,
      cartao: 0
    });

  const [observacaoFechamento, setObservacaoFechamento] = useState("");

  const primaryColor = empresa?.cor_primaria || "#d9b35f";

  const sistemaDinheiro = Number(caixa?.total_dinheiro || 0);
  const sistemaPix = Number(caixa?.total_pix || 0);
  const sistemaCartao = Number(caixa?.total_cartao || 0);
  const sistemaGeral = Number(caixa?.total_geral || 0);

  const informadoGeral =
    Number(valoresFechamento.dinheiro || 0) +
    Number(valoresFechamento.pix || 0) +
    Number(valoresFechamento.cartao || 0);

  const total = useMemo(() => {
    return cart.reduce(
      (sum, item) =>
        sum + Number(item.preco || 0) * Number(item.quantidade || 1),
      0
    );
  }, [cart]);

  const produtosFiltrados = useMemo(() => {
    if (categoria === "todos") return produtos;

    return produtos.filter(
      (produto) => Number(produto.categoria_id) === Number(categoria)
    );
  }, [produtos, categoria]);

  async function loadBase() {
    const empresaRes = await fetch(
      `${API}/api/db/empresas_cardapio?where=(Id,eq,${params.empresaId})&limit=1`,
      { cache: "no-store" }
    );

    const empresaData = await empresaRes.json();
    setEmpresa(empresaData.list?.[0] || null);

    const categoriasRes = await fetch(
      `${API}/api/db/categorias_cardapio?where=(empresa_id,eq,${params.empresaId})&limit=200`,
      { cache: "no-store" }
    );

    const categoriasData = await categoriasRes.json();
    setCategorias(categoriasData.list || []);

    const produtosRes = await fetch(
      `${API}/api/db/produtos_cardapio?where=(empresa_id,eq,${params.empresaId})&limit=500`,
      { cache: "no-store" }
    );

    const produtosData = await produtosRes.json();
    setProdutos(produtosData.list || []);
  }

  async function loadCaixa() {
    const res = await fetch(
      `${API}/api/cardapio/pdv/${params.empresaId}/caixa/aberto`,
      { cache: "no-store" }
    );

    const data = await res.json();

    if (data.sucesso) {
      setCaixa(data.caixa);
    } else {
      setCaixa(null);
    }
  }

    async function buscarUsuario(
    codigoDigitado: string,
    senhaDigitada: string,
    exigirSupervisor: boolean
  ) {
    const codigoLimpo = String(codigoDigitado || "").trim();
    const senhaLimpa = String(senhaDigitada || "").trim();

    if (!codigoLimpo) {
      setModalMsg("Informe o código ou código de barras.");
      return null;
    }

    const res = await fetch(
  `${API}/api/db/usuarios_cardapio?limit=1000`,
  { cache: "no-store" }
);

const data = await res.json();
const todosUsuarios: UsuarioCardapio[] = data.list || [];

const usuarios: UsuarioCardapio[] = todosUsuarios.filter((item) => {
  const roleOriginal = String(item.role || "").trim();

  // ADM em maiúsculo acessa todas as empresas.
  if (roleOriginal === "ADM") return true;

  // Todos os demais acessam apenas a empresa atual.
  return String(item.empresa_id) === String(params.empresaId);
});

    const usuario = usuarios.find((item: any) => {
      const codigo = String(item.codigo || "").trim();
      const codigoDeBarras = String(item.codigo_de_barras || "").trim();

      const pin = String(item.pin || "").trim();
      const senhaHash = String(item.senha_hash || "").trim();

      const codigoInformadoConfere =
        codigo !== "" && codigo === codigoLimpo;

      const codigoBarrasConfere =
        codigoDeBarras !== "" && codigoDeBarras === codigoLimpo;

      const senhaConfere =
        senhaLimpa !== "" &&
        (pin === senhaLimpa || senhaHash === senhaLimpa);

      // Se for código de barras, libera direto sem exigir PIN/senha.
      if (codigoBarrasConfere) return true;

      // Se for código manual, exige PIN ou senha_hash.
      if (codigoInformadoConfere && senhaConfere) return true;

      return false;
    });

    if (!usuario) {
      setModalMsg("Usuário não encontrado ou senha/PIN incorreto.");
      return null;
    }

    if (!isAtivo(usuario.ativo)) {
      setModalMsg("Usuário inativo.");
      return null;
    }

    if (exigirSupervisor) {
  const roleOriginal = String(usuario.role || "").trim();
  const role = roleOriginal.toLowerCase();

  if (roleOriginal !== "ADM" && !cargosSupervisor.includes(role)) {
    setModalMsg("Esse usuário não tem permissão de supervisor.");
    return null;
  }
}

return usuario;
}

async function liberarSupervisorCaixaFechado() {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    const supervisor = await buscarUsuario(
      loginSupervisorCodigo,
      mostrarPinSupervisor ? loginSupervisorPin : "",
      true
    );

    if (!supervisor) return;

    setSupervisorLogado(supervisor);
    setMostrarLoginOperador(true);
  }

  async function liberarOperadorAbrirCaixa() {
  if (!online) {
    setModalMsg("Sistema offline");
    return;
  }

  const operador = await buscarUsuario(
    loginOperadorCodigo,
    mostrarDadosOperador ? loginOperadorPin : "",
    false
  );

  if (!operador) return;

  setOperadorLogado(operador);
  setOperadorParaAbertura(operador);
  setModalAberturaCaixa(true);
}
async function confirmarAberturaCaixa() {
  if (!online) {
    setModalMsg("Sistema offline");
    return;
  }

  if (!operadorParaAbertura) {
    setModalMsg("Informe o operador antes de abrir o caixa.");
    return;
  }

  await abrirCaixa(operadorParaAbertura);
  setModalAberturaCaixa(false);
}

  async function abrirCaixa(operador: UsuarioCardapio) {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    if (!supervisorLogado) {
      setModalMsg("Libere o acesso com um supervisor antes de abrir o caixa.");
      return;
    }

    const res = await fetch(`${API}/api/cardapio/pdv/caixa/abrir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        empresa_id: Number(params.empresaId),
        operador_id: operador.Id,
        operador_nome: operador.nome,
        supervisor_abertura_id: supervisorLogado.Id,
        supervisor_abertura_nome: supervisorLogado.nome,
        valor_abertura: valorAbertura
      })
    });

    const data = await res.json();

    if (data.sucesso) {
      setCaixa(data.caixa);
      setLoginSupervisorCodigo("");
      setLoginSupervisorPin("");
      setLoginOperadorCodigo("");
      setLoginOperadorPin("");
      setMostrarPinSupervisor(false);
      setMostrarLoginOperador(false);
      setMostrarDadosOperador(false);
      setOperadorParaAbertura(null);
      setModalAberturaCaixa(false);
    } else {
      setModalMsg(data.error || "Erro ao abrir caixa.");
    }
  }

  function abrirModalFechamento() {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    if (!caixa) return;

    setValoresFechamento({
      dinheiro: sistemaDinheiro,
      pix: sistemaPix,
      cartao: sistemaCartao
    });

    setObservacaoFechamento("");
    setFechamentoSupervisorCodigo("");
    setFechamentoSupervisorPin("");
    setFechamentoOperadorCodigo("");
    setFechamentoOperadorPin("");
    setFechamentoEtapa("supervisor-inicial");
    setModalFechamento(true);
  }

  async function validarSupervisorFechamento(finalizar = false) {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    const supervisor = await buscarUsuario(
      fechamentoSupervisorCodigo,
      fechamentoSupervisorPin,
      true
    );

    if (!supervisor) return;

    if (finalizar) {
      await fecharCaixa(supervisor);
      return;
    }

    setFechamentoEtapa("valores");
    setFechamentoSupervisorCodigo("");
    setFechamentoSupervisorPin("");
  }

  async function validarOperadorFechamento() {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    const operador = await buscarUsuario(
      fechamentoOperadorCodigo,
      fechamentoOperadorPin,
      false
    );

    if (!operador) return;

    setFechamentoEtapa("supervisor-final");
    setFechamentoOperadorCodigo("");
    setFechamentoOperadorPin("");
    setFechamentoSupervisorCodigo("");
    setFechamentoSupervisorPin("");
  }

  async function fecharCaixa(supervisorFinal: UsuarioCardapio) {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    if (!caixa) return;

    const res = await fetch(`${API}/api/cardapio/pdv/caixa/${caixa.Id}/fechar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valor_fechamento: informadoGeral,
        valor_fechamento_dinheiro: valoresFechamento.dinheiro,
        valor_fechamento_pix: valoresFechamento.pix,
        valor_fechamento_cartao: valoresFechamento.cartao,
        diferenca_dinheiro: diferenca(valoresFechamento.dinheiro, sistemaDinheiro),
        diferenca_pix: diferenca(valoresFechamento.pix, sistemaPix),
        diferenca_cartao: diferenca(valoresFechamento.cartao, sistemaCartao),
        diferenca_geral: diferenca(informadoGeral, sistemaGeral),
        observacao: observacaoFechamento || "Fechado pelo PDV",
        supervisor_fechamento_id: supervisorFinal.Id,
        supervisor_fechamento_nome: supervisorFinal.nome,
        operador_nome: operadorLogado?.nome || caixa.operador_nome
      })
    });

    const data = await res.json();

    if (data.sucesso) {
      setCaixa(null);
      setCart([]);
      setModalFechamento(false);
      setSupervisorLogado(null);
      setOperadorLogado(null);
      setModalMsg("Caixa fechado com sucesso.");
    } else {
      setModalMsg(data.error || "Erro ao fechar caixa.");
    }
  }

async function abrirGaveta() {
  if (!online) {
    setModalMsg("Sistema offline");
    return;
  }

  if (!caixa) {
    setModalMsg("Abra o caixa antes de abrir a gaveta.");
    return;
  }

  setModalMsg("Comando de abertura da gaveta acionado. Integre este comando ao módulo de impressão térmica.");
}

async function confirmarMovimentacaoCaixa(tipo: "SANGRIA" | "REFORCO") {
  if (!online) {
    setModalMsg("Sistema offline");
    return;
  }

  if (!caixa) {
    setModalMsg("Abra o caixa antes de movimentar valores.");
    return;
  }

  if (valorMovimentacao <= 0) {
    setModalMsg("Informe um valor maior que zero.");
    return;
  }

  const endpoint = `${API}/api/cardapio/pdv/caixa/${caixa.Id}/movimentacao`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        empresa_id: Number(params.empresaId),
        caixa_id: caixa.Id,
        tipo,
        valor: valorMovimentacao,
        observacao: observacaoMovimentacao,
        operador_id: operadorLogado?.Id,
        operador_nome: operadorLogado?.nome || caixa.operador_nome
      })
    });

    const data = await res.json();

    if (!res.ok || !data.sucesso) {
      setModalMsg(
        data.error ||
          `Não foi possível registrar ${
            tipo === "SANGRIA" ? "a sangria" : "o reforço"
          }. Verifique se o endpoint existe no backend.`
      );
      return;
    }

    setModalSangria(false);
    setModalReforco(false);
    setValorMovimentacao(0);
    setObservacaoMovimentacao("");
    setModalMsg(tipo === "SANGRIA" ? "Sangria registrada." : "Reforço registrado.");
    await loadCaixa();
  } catch {
    setModalMsg(
      `Endpoint de ${
        tipo === "SANGRIA" ? "sangria" : "reforço"
      } ainda não encontrado no backend.`
    );
  }
}
  function addProduto(produto: Produto) {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    setCart((current) => {
      const exists = current.find((item) => item.Id === produto.Id);

      if (exists) {
        return current.map((item) =>
          item.Id === produto.Id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        );
      }

      return [
        ...current,
        {
          ...produto,
          quantidade: 1,
          observacao: "",
          insumos_texto: ""
        }
      ];
    });
  }

  function changeQtd(id: number, delta: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.Id === id
            ? { ...item, quantidade: Math.max(item.quantidade + delta, 0) }
            : item
        )
        .filter((item) => item.quantidade > 0)
    );
  }

  function atualizarItemCarrinho(
    id: number,
    campo: "observacao" | "insumos_texto",
    valor: string
  ) {
    setCart((current) =>
      current.map((item) =>
        item.Id === id
          ? {
              ...item,
              [campo]: valor
            }
          : item
      )
    );
  }

  function limparCarrinho() {
    setCart([]);
  }

  async function finalizarVenda() {
    if (!online) {
      setModalMsg("Sistema offline");
      return;
    }

    if (!caixa) {
      setModalMsg("Abra o caixa antes de vender.");
      return;
    }

    if (!cart.length) {
      setModalMsg("Adicione produtos ao carrinho.");
      return;
    }

    const itensTratados = cart.map((item) => ({
      ...item,
      insumos_json: item.insumos_texto
        ? [
            {
              nome: item.insumos_texto,
              quantidade: 1,
              preco: 0,
              observacao: "Informado manualmente pelo operador"
            }
          ]
        : []
    }));

    const res = await fetch(`${API}/api/cardapio/pdv/venda`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        empresa_id: Number(params.empresaId),
        caixa_id: caixa.Id,
        operador_id: operadorLogado?.Id,
        operador_nome: operadorLogado?.nome || caixa.operador_nome,
        itens: itensTratados,
        total,
        forma_pagamento: formaPagamento,
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        observacao: "Venda balcão"
      })
    });

    const data = await res.json();

    if (!res.ok || !data.sucesso) {
      setModalMsg(data.error || "Erro ao finalizar venda.");
      return;
    }

    setModalMsg(`Venda finalizada. Pedido ${data.numero_pedido}`);
    setCart([]);
    setClienteNome("");
    setClienteTelefone("");
    await loadCaixa();
  }

  function renderDiferenca(informado: number, sistema: number) {
    const diff = diferenca(informado, sistema);

    const texto =
      diff > 0
        ? `+ ${formatMoney(diff)}`
        : diff < 0
          ? `- ${formatMoney(Math.abs(diff))}`
          : formatMoney(0);

    const cor =
      diff === 0
        ? "text-emerald-400"
        : diff < 0
          ? "text-red-400"
          : "text-yellow-300";

    return <span className={`font-black ${cor}`}>{texto}</span>;
  }

  useEffect(() => {
    loadBase();
    loadCaixa();
  }, []);

  useEffect(() => {
    function updateStatus() {
      const status = navigator.onLine;

      if (status && !online) {
        setShowOnline(true);

        setTimeout(() => {
          setShowOnline(false);
        }, 3000);
      }

      setOnline(status);
    }

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [online]);

  useEffect(() => {
    function atualizarHora() {
      setHoraAtual(
        new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        })
      );
    }

    atualizarHora();

    const interval = setInterval(atualizarHora, 1000);

    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
  function handleGlobalKeyDown(event: KeyboardEvent) {
    if (event.key === "F2") {
      event.preventDefault();

      if (caixa) {
        setModalMsg("O caixa já está aberto.");
        return;
      }

      setMostrarLoginOperador(false);
      setMostrarDadosOperador(false);

      setTimeout(() => {
        supervisorInputRef.current?.focus();
      }, 100);

      return;
    }

    if (event.key === "F4") {
      event.preventDefault();
      abrirGaveta();
      return;
    }

    if (event.key === "F6") {
      event.preventDefault();
      abrirModalFechamento();
      return;
    }

    if (event.key === "F7") {
      event.preventDefault();

      if (!caixa) {
        setModalMsg("Abra o caixa antes de realizar sangria.");
        return;
      }

      setValorMovimentacao(0);
      setObservacaoMovimentacao("");
      setModalSangria(true);
      return;
    }

    if (event.key === "F8") {
      event.preventDefault();

      if (!caixa) {
        setModalMsg("Abra o caixa antes de realizar reforço.");
        return;
      }

      setValorMovimentacao(0);
      setObservacaoMovimentacao("");
      setModalReforco(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (modalAberturaCaixa) {
        setModalAberturaCaixa(false);
        return;
      }

      if (modalSangria) {
        setModalSangria(false);
        return;
      }

      if (modalReforco) {
        setModalReforco(false);
        return;
      }

      if (modalFechamento) {
        setModalFechamento(false);
        return;
      }

      if (modalMsg) {
        setModalMsg("");
        return;
      }

      if (mostrarLoginOperador) {
        setMostrarLoginOperador(false);
        setMostrarDadosOperador(false);
        return;
      }

      return;
    }

    if (event.key === "Enter") {
      if (modalAberturaCaixa) {
        event.preventDefault();
        confirmarAberturaCaixa();
        return;
      }

      if (modalSangria) {
        event.preventDefault();
        confirmarMovimentacaoCaixa("SANGRIA");
        return;
      }

      if (modalReforco) {
        event.preventDefault();
        confirmarMovimentacaoCaixa("REFORCO");
        return;
      }

      if (modalFechamento && fechamentoEtapa === "supervisor-inicial") {
        event.preventDefault();
        validarSupervisorFechamento(false);
        return;
      }

      if (modalFechamento && fechamentoEtapa === "operador") {
        event.preventDefault();
        validarOperadorFechamento();
        return;
      }

      if (modalFechamento && fechamentoEtapa === "supervisor-final") {
        event.preventDefault();
        validarSupervisorFechamento(true);
        return;
      }
    }
  }

  window.addEventListener("keydown", handleGlobalKeyDown);

  return () => {
    window.removeEventListener("keydown", handleGlobalKeyDown);
  };
}, [
  caixa,
  modalAberturaCaixa,
  modalSangria,
  modalReforco,
  modalFechamento,
  modalMsg,
  fechamentoEtapa,
  mostrarLoginOperador,
  online,
  valorMovimentacao,
  observacaoMovimentacao,
  operadorParaAbertura,
  valoresFechamento,
  fechamentoSupervisorCodigo,
  fechamentoSupervisorPin,
  fechamentoOperadorCodigo,
  fechamentoOperadorPin
]);

  if (!caixa) {
    return (
      <main className="relative h-screen overflow-hidden bg-black text-white">
        {empresa?.video_caixa && (
          <video
            src={empresa.video_caixa}
            autoPlay
            muted
            loop
            playsInline
            className="fixed inset-0 h-full w-full object-cover opacity-40"
          />
        )}

        <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px]" />

        <header className="absolute left-0 top-0 z-10 flex flex-col items-start gap-2 p-5">
          {empresa?.logo_url && (
            <img
              src={empresa.logo_url}
              className="max-h-16 object-contain"
              alt={empresa.nome_fantasia}
            />
          )}

          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.35em]"
              style={{ color: primaryColor }}
            >
              PDV
            </p>
            <h1 className="text-3xl font-black">Caixa fechado</h1>
          </div>
        </header>

               <footer className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-white/10 bg-black/75 px-5 py-2 text-xs text-zinc-300 backdrop-blur-xl">
          <span>Operador: {operadorLogado?.nome || "não definido"}</span>
          <span>{horaAtual}</span>
          <span
            className={
              online ? "font-black text-green-400" : "font-black text-red-400"
            }
          >
            {online ? "ONLINE" : "OFFLINE"}
          </span>
        </footer>

        <div className="relative z-20 flex h-screen items-center justify-center px-6 pb-10 pt-28">
          <div className="w-full max-w-sm rounded-[1.5rem] border border-white/10 bg-zinc-950/95 p-5 text-center shadow-2xl backdrop-blur-xl">            {!mostrarLoginOperador ? (
              <>
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                  <KeyRound />
                </div>

                <h2 className="mt-3 text-2xl font-black">
                  Acesso supervisor
                </h2>

                <p className="mt-2 text-sm text-zinc-400">
                  Bipe o código de barras ou digite o código do supervisor.
                </p>

                <input
                  ref={supervisorInputRef}
                  autoFocus
                  type="password"
                  placeholder="Código ou código de barras"
                  value={loginSupervisorCodigo}
                  onChange={(e) => setLoginSupervisorCodigo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      liberarSupervisorCaixaFechado();
                    }
                  }}
                  className="mt-4 w-full rounded-xl bg-white/10 p-3 text-center text-base outline-none"
                />

                {mostrarPinSupervisor && (
                  <input
                    type="password"
                    placeholder="PIN do supervisor"
                    value={loginSupervisorPin}
                    onChange={(e) => setLoginSupervisorPin(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        liberarSupervisorCaixaFechado();
                      }
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 p-3 text-center text-base outline-none"
                  />
                )}

                <button
                  onClick={liberarSupervisorCaixaFechado}
                  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Liberar abertura
                </button>

                <button
                  onClick={() => setMostrarPinSupervisor(true)}
                  className="mt-4 text-sm text-zinc-400 underline"
                >
                  Inserir dados de supervisor
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                  <UserRound />
                </div>

                <h2 className="mt-3 text-2xl font-black">
  Dados do operador
</h2>

<p className="mt-2 text-sm text-zinc-400">
  Bipe o código de barras do operador.
</p>

<input
  ref={operadorInputRef}
  autoFocus
  type="password"
  placeholder="Código de barras do operador"
  value={loginOperadorCodigo}
  onChange={(e) => setLoginOperadorCodigo(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      liberarOperadorAbrirCaixa();
    }
  }}
  className="mt-4 w-full rounded-xl bg-white/10 p-3 text-center text-base outline-none"
/>

{mostrarDadosOperador && (
  <>
    <input
      placeholder="Código do operador"
      value={loginOperadorCodigo}
      onChange={(e) => setLoginOperadorCodigo(e.target.value)}
      className="mt-3 w-full rounded-xl bg-white/10 p-3 text-center text-base outline-none"
    />

    <input
      type="password"
      placeholder="PIN ou senha do operador"
      value={loginOperadorPin}
      onChange={(e) => setLoginOperadorPin(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          liberarOperadorAbrirCaixa();
        }
      }}
      className="mt-3 w-full rounded-xl bg-white/10 p-3 text-center text-base outline-none"
    />
  </>
)}

<button
  onClick={liberarOperadorAbrirCaixa}
  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
  style={{
    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
  }}
>
  Continuar
</button>

<button
  onClick={() => setMostrarDadosOperador(true)}
  className="mt-3 text-sm text-zinc-400 underline"
>
  Inserir dados do operador
</button>
              </>
            )}
          </div>
        </div>

        {!online && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-xl">
            <div className="max-w-md rounded-[2rem] border border-red-400/40 bg-zinc-950 p-8 text-center text-white shadow-2xl">
              <h2 className="text-3xl font-black text-red-400">
                Sistema offline
              </h2>
              <p className="mt-4 text-zinc-300">
                Sem conexão com a internet.
              </p>
              <p className="mt-4 animate-pulse text-red-300">
                Reconectando automaticamente...
              </p>
            </div>
          </div>
        )}

        {showOnline && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-xl">
            <div className="max-w-md rounded-[2rem] border border-emerald-400/40 bg-zinc-950 p-8 text-center text-white shadow-2xl">
              <h2 className="text-3xl font-black text-emerald-400">
                Sistema online
              </h2>
              <p className="mt-4 text-zinc-300">
                Conexão restabelecida com sucesso.
              </p>
            </div>
          </div>
        )}

        {modalMsg && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
            <div className="max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
              <h2 className="text-3xl font-black">PDV</h2>
              <p className="mt-4 text-zinc-300">{modalMsg}</p>

              <button
                onClick={() => setModalMsg("")}
                className="mt-6 rounded-full px-6 py-3 font-black text-black"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-5 pb-12 text-white">
      <div
        className="fixed inset-0 opacity-70"
        style={{
          background: `radial-gradient(circle at top left, ${primaryColor}33, transparent 34%), radial-gradient(circle at bottom right, ${primaryColor}22, transparent 36%), #050505`
        }}
      />

      <section className="relative z-10 mx-auto grid max-w-7xl gap-5 xl:grid-cols-[1fr_420px]">
        <div>
          <header className="sticky top-0 z-30 mb-5 flex items-center justify-between rounded-[2rem] border border-white/10 bg-black/70 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              {empresa?.logo_url && (
                <img
                  src={empresa.logo_url}
                  className="h-14 object-contain"
                  alt={empresa.nome_fantasia}
                />
              )}

              <div>
                <p
                  className="text-xs font-black uppercase tracking-[0.35em]"
                  style={{ color: primaryColor }}
                >
                  PDV
                </p>
                <h1 className="text-2xl font-black">
                  {empresa?.nome_fantasia}
                </h1>
              </div>
            </div>

            <button
              onClick={abrirModalFechamento}
              className="rounded-full bg-red-500 px-5 py-3 font-black text-white"
            >
              Fechar caixa
            </button>
          </header>

          <div className="mb-5 flex flex-wrap gap-3">
            <button
              onClick={() => setCategoria("todos")}
              className={`rounded-full px-5 py-3 font-bold ${
                categoria === "todos" ? "text-black" : "bg-white/10"
              }`}
              style={{
                background:
                  categoria === "todos"
                    ? `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                    : undefined
              }}
            >
              Todos
            </button>

            {categorias.map((cat) => (
              <button
                key={cat.Id}
                onClick={() => setCategoria(cat.Id)}
                className={`rounded-full px-5 py-3 font-bold ${
                  categoria === cat.Id ? "text-black" : "bg-white/10"
                }`}
                style={{
                  background:
                    categoria === cat.Id
                      ? `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                      : undefined
                }}
              >
                {cat.nome}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {produtosFiltrados.map((produto) => (
              <button
                key={produto.Id}
                onClick={() => addProduto(produto)}
                className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.04] text-left shadow-xl transition hover:-translate-y-1 hover:bg-white/[0.08]"
              >
                {produto.imagem_url && (
                  <img
                    src={produto.imagem_url}
                    alt={produto.nome}
                    className="h-36 w-full object-cover"
                  />
                )}

                <div className="p-4">
                  <h3 className="text-lg font-black">{produto.nome}</h3>
                  <p className="mt-2 font-black" style={{ color: primaryColor }}>
                    {formatMoney(Number(produto.preco || 0))}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="sticky top-5 h-[calc(100vh-75px)] overflow-auto rounded-[2rem] border border-white/10 bg-black/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-black">
              <ShoppingCart />
              Venda
            </h2>

            <button onClick={limparCarrinho} className="text-red-300">
              <Trash2 />
            </button>
          </div>

          <div className="grid gap-3">
            <input
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              placeholder="Nome do cliente opcional"
              className="rounded-2xl bg-white/10 p-4 outline-none"
            />

            <input
              value={clienteTelefone}
              onChange={(e) => setClienteTelefone(e.target.value)}
              placeholder="Telefone opcional"
              className="rounded-2xl bg-white/10 p-4 outline-none"
            />
          </div>

          <div className="mt-5 max-h-[42vh] space-y-3 overflow-auto pr-1">
            {cart.map((item) => (
              <div
                key={item.Id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex justify-between gap-3">
                  <strong>{item.nome}</strong>
                  <span>{formatMoney(Number(item.preco) * item.quantidade)}</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => changeQtd(item.Id, -1)}
                    className="rounded-full bg-white/10 p-2"
                  >
                    <Minus size={16} />
                  </button>

                  <span className="min-w-8 text-center font-black">
                    {item.quantidade}
                  </span>

                  <button
                    onClick={() => changeQtd(item.Id, 1)}
                    className="rounded-full bg-white/10 p-2"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <textarea
                  value={item.observacao || ""}
                  onChange={(e) =>
                    atualizarItemCarrinho(item.Id, "observacao", e.target.value)
                  }
                  placeholder="Observação do item"
                  className="mt-3 min-h-16 w-full resize-none rounded-xl bg-white/10 p-3 text-sm outline-none"
                />

                <input
                  value={item.insumos_texto || ""}
                  onChange={(e) =>
                    atualizarItemCarrinho(item.Id, "insumos_texto", e.target.value)
                  }
                  placeholder="Insumos/adicionais informados pelo operador"
                  className="mt-2 w-full rounded-xl bg-white/10 p-3 text-sm outline-none"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              onClick={() => setFormaPagamento("Dinheiro")}
              className={`rounded-2xl p-3 font-bold ${
                formaPagamento === "Dinheiro" ? "text-black" : "bg-white/10"
              }`}
              style={{
                background:
                  formaPagamento === "Dinheiro"
                    ? `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                    : undefined
              }}
            >
              <Banknote className="mx-auto mb-1" />
              Dinheiro
            </button>

            <button
              onClick={() => setFormaPagamento("Pix")}
              className={`rounded-2xl p-3 font-bold ${
                formaPagamento === "Pix" ? "text-black" : "bg-white/10"
              }`}
              style={{
                background:
                  formaPagamento === "Pix"
                    ? `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                    : undefined
              }}
            >
              <QrCode className="mx-auto mb-1" />
              Pix
            </button>

            <button
              onClick={() => setFormaPagamento("Cartão")}
              className={`rounded-2xl p-3 font-bold ${
                formaPagamento === "Cartão" ? "text-black" : "bg-white/10"
              }`}
              style={{
                background:
                  formaPagamento === "Cartão"
                    ? `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                    : undefined
              }}
            >
              <CreditCard className="mx-auto mb-1" />
              Cartão
            </button>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between text-2xl font-black">
              <span>Total</span>
              <span style={{ color: primaryColor }}>{formatMoney(total)}</span>
            </div>

            <button
              onClick={finalizarVenda}
              className="mt-5 w-full rounded-full px-6 py-4 font-black text-black"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
              }}
            >
              Finalizar venda
            </button>
          </div>
        </aside>
      </section>

            <footer className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-white/10 bg-black/80 px-5 py-2 text-xs text-zinc-300 backdrop-blur-xl">
        <span>Operador: {operadorLogado?.nome || caixa.operador_nome}</span>

        <span className="hidden md:inline">
          F2 Abrir · F4 Gaveta · F6 Fechar · F7 Sangria · F8 Reforço
        </span>

        <span>{horaAtual}</span>

        <span
          className={
            online ? "font-black text-green-400" : "font-black text-red-400"
          }
        >
          {online ? "ONLINE" : "OFFLINE"}
        </span>
      </footer>

{modalAberturaCaixa && operadorParaAbertura && (
  <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/85 px-6 backdrop-blur-xl">
    <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
      <h2 className="text-3xl font-black">Abrir caixa</h2>

      <p className="mt-3 text-zinc-400">
        Operador identificado:
      </p>

      <p className="mt-2 text-2xl font-black" style={{ color: primaryColor }}>
        {operadorParaAbertura.nome}
      </p>

      <label className="mt-6 block text-left text-sm text-zinc-400">
        Valor em dinheiro para iniciar o caixa
      </label>

      <input
        autoFocus
        type="number"
        value={valorAbertura}
        onChange={(e) => setValorAbertura(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            confirmarAberturaCaixa();
          }

          if (e.key === "Escape") {
            setModalAberturaCaixa(false);
          }
        }}
        className="mt-2 w-full rounded-2xl bg-white/10 p-4 text-center text-xl font-black outline-none"
      />

      <button
        onClick={confirmarAberturaCaixa}
        className="mt-6 w-full rounded-full px-6 py-4 font-black text-black"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
        }}
      >
        Iniciar com saldo {formatMoney(valorAbertura)}
      </button>

      <button
        onClick={() => setModalAberturaCaixa(false)}
        className="mt-4 text-sm text-zinc-400 underline"
      >
        Cancelar
      </button>
    </div>
  </div>
)}
{(modalSangria || modalReforco) && (
  <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/85 px-6 backdrop-blur-xl">
    <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
      <h2 className="text-3xl font-black">
        {modalSangria ? "Realizar sangria" : "Realizar reforço"}
      </h2>

      <p className="mt-3 text-zinc-400">
        Operador: {operadorLogado?.nome || caixa?.operador_nome}
      </p>

      <label className="mt-6 block text-left text-sm text-zinc-400">
        Valor
      </label>

      <input
        autoFocus
        type="number"
        value={valorMovimentacao}
        onChange={(e) => setValorMovimentacao(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            confirmarMovimentacaoCaixa(modalSangria ? "SANGRIA" : "REFORCO");
          }

          if (e.key === "Escape") {
            setModalSangria(false);
            setModalReforco(false);
          }
        }}
        className="mt-2 w-full rounded-2xl bg-white/10 p-4 text-center text-xl font-black outline-none"
      />

      <textarea
        value={observacaoMovimentacao}
        onChange={(e) => setObservacaoMovimentacao(e.target.value)}
        placeholder="Observação"
        className="mt-4 min-h-24 w-full resize-none rounded-2xl bg-white/10 p-4 outline-none"
      />

      <button
        onClick={() =>
          confirmarMovimentacaoCaixa(modalSangria ? "SANGRIA" : "REFORCO")
        }
        className="mt-6 w-full rounded-full px-6 py-4 font-black text-black"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
        }}
      >
        Confirmar {modalSangria ? "sangria" : "reforço"}
      </button>

      <button
        onClick={() => {
          setModalSangria(false);
          setModalReforco(false);
        }}
        className="mt-4 text-sm text-zinc-400 underline"
      >
        Cancelar
      </button>
    </div>
  </div>
)}
      {modalFechamento && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/85 px-6 backdrop-blur-xl">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[2rem] border border-white/10 bg-zinc-950 p-8 shadow-2xl">
            {fechamentoEtapa === "supervisor-inicial" && (
              <div className="text-center">
                <h2 className="text-3xl font-black">Permissão supervisor</h2>
                <p className="mt-2 text-zinc-400">
                  Informe código de barras ou código e PIN para iniciar o fechamento.
                </p>

                <input
                  autoFocus
                  type="password"
                  value={fechamentoSupervisorCodigo}
                  onChange={(e) => setFechamentoSupervisorCodigo(e.target.value)}
                  placeholder="Código ou código de barras"
                  className="mt-6 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <input
                  type="password"
                  value={fechamentoSupervisorPin}
                  onChange={(e) => setFechamentoSupervisorPin(e.target.value)}
                  placeholder="PIN do supervisor"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      validarSupervisorFechamento(false);
                    }
                  }}
                  className="mt-4 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <button
                  onClick={() => validarSupervisorFechamento(false)}
                  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Continuar
                </button>

                <button
                  onClick={() => setModalFechamento(false)}
                  className="mt-4 text-sm text-zinc-400 underline"
                >
                  Cancelar
                </button>
              </div>
            )}

            {fechamentoEtapa === "valores" && (
              <div>
                <h2 className="text-3xl font-black">Conferência do caixa</h2>
                <p className="mt-2 text-zinc-400">
                  Informe os valores reais encontrados no caixa.
                </p>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <label className="text-sm text-zinc-400">Dinheiro</label>
                    <input
                      type="number"
                      value={valoresFechamento.dinheiro}
                      onChange={(e) =>
                        setValoresFechamento((current) => ({
                          ...current,
                          dinheiro: Number(e.target.value)
                        }))
                      }
                      className="mt-2 w-full rounded-xl bg-white/10 p-4 outline-none"
                    />
                    <div className="mt-3 flex justify-between text-sm">
                      <span>Sistema: {formatMoney(sistemaDinheiro)}</span>
                      <span>
                        Diferença:{" "}
                        {renderDiferenca(
                          valoresFechamento.dinheiro,
                          sistemaDinheiro
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <label className="text-sm text-zinc-400">PIX</label>
                    <input
                      type="number"
                      value={valoresFechamento.pix}
                      onChange={(e) =>
                        setValoresFechamento((current) => ({
                          ...current,
                          pix: Number(e.target.value)
                        }))
                      }
                      className="mt-2 w-full rounded-xl bg-white/10 p-4 outline-none"
                    />
                    <div className="mt-3 flex justify-between text-sm">
                      <span>Sistema: {formatMoney(sistemaPix)}</span>
                      <span>
                        Diferença:{" "}
                        {renderDiferenca(valoresFechamento.pix, sistemaPix)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <label className="text-sm text-zinc-400">Cartão</label>
                    <input
                      type="number"
                      value={valoresFechamento.cartao}
                      onChange={(e) =>
                        setValoresFechamento((current) => ({
                          ...current,
                          cartao: Number(e.target.value)
                        }))
                      }
                      className="mt-2 w-full rounded-xl bg-white/10 p-4 outline-none"
                    />
                    <div className="mt-3 flex justify-between text-sm">
                      <span>Sistema: {formatMoney(sistemaCartao)}</span>
                      <span>
                        Diferença:{" "}
                        {renderDiferenca(
                          valoresFechamento.cartao,
                          sistemaCartao
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex justify-between text-xl font-black">
                      <span>Total sistema</span>
                      <span>{formatMoney(sistemaGeral)}</span>
                    </div>

                    <div className="mt-2 flex justify-between text-xl font-black">
                      <span>Total informado</span>
                      <span>{formatMoney(informadoGeral)}</span>
                    </div>

                    <div className="mt-2 flex justify-between text-xl font-black">
                      <span>Diferença geral</span>
                      {renderDiferenca(informadoGeral, sistemaGeral)}
                    </div>
                  </div>

                  <textarea
                    value={observacaoFechamento}
                    onChange={(e) => setObservacaoFechamento(e.target.value)}
                    placeholder="Observação do fechamento"
                    className="min-h-28 resize-none rounded-2xl bg-white/10 p-4 outline-none"
                  />
                </div>

                <button
                  onClick={() => setFechamentoEtapa("operador")}
                  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Confirmar valores
                </button>
              </div>
            )}

            {fechamentoEtapa === "operador" && (
              <div className="text-center">
                <h2 className="text-3xl font-black">Confirmação operador</h2>
                <p className="mt-2 text-zinc-400">
                  Informe código de barras ou código e PIN do operador.
                </p>

                <input
                  autoFocus
                  type="password"
                  value={fechamentoOperadorCodigo}
                  onChange={(e) => setFechamentoOperadorCodigo(e.target.value)}
                  placeholder="Código ou código de barras"
                  className="mt-6 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <input
                  type="password"
                  value={fechamentoOperadorPin}
                  onChange={(e) => setFechamentoOperadorPin(e.target.value)}
                  placeholder="PIN do operador"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      validarOperadorFechamento();
                    }
                  }}
                  className="mt-4 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <button
                  onClick={validarOperadorFechamento}
                  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Confirmar operador
                </button>
              </div>
            )}

            {fechamentoEtapa === "supervisor-final" && (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />

                <h2 className="mt-5 text-3xl font-black">
                  Confirmação final
                </h2>

                <p className="mt-2 text-zinc-400">
                  Supervisor deve confirmar novamente para fechar o caixa.
                </p>

                <input
                  autoFocus
                  value={fechamentoSupervisorCodigo}
                  onChange={(e) => setFechamentoSupervisorCodigo(e.target.value)}
                  placeholder="Código ou código de barras"
                  className="mt-6 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <input
                  type="password"
                  value={fechamentoSupervisorPin}
                  onChange={(e) => setFechamentoSupervisorPin(e.target.value)}
                  placeholder="PIN do supervisor"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      validarSupervisorFechamento(true);
                    }
                  }}
                  className="mt-4 w-full rounded-2xl bg-white/10 p-4 text-center outline-none"
                />

                <button
                  onClick={() => validarSupervisorFechamento(true)}
                  className="mt-4 w-full rounded-full px-5 py-3 font-black text-black"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
                  }}
                >
                  Fechar caixa definitivamente
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {modalMsg && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
          <div className="max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">PDV</h2>
            <p className="mt-4 text-zinc-300">{modalMsg}</p>

            <button
              onClick={() => setModalMsg("")}
              className="mt-6 rounded-full px-6 py-3 font-black text-black"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {!online && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-xl">
          <div className="max-w-md rounded-[2rem] border border-red-400/40 bg-zinc-950 p-8 text-center text-white shadow-2xl">
            <h2 className="text-3xl font-black text-red-400">
              Sistema offline
            </h2>
            <p className="mt-4 text-zinc-300">Sem conexão com a internet.</p>
            <p className="mt-4 animate-pulse text-red-300">
              Reconectando automaticamente...
            </p>
          </div>
        </div>
      )}

      {showOnline && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-xl">
          <div className="max-w-md rounded-[2rem] border border-emerald-400/40 bg-zinc-950 p-8 text-center text-white shadow-2xl">
            <h2 className="text-3xl font-black text-emerald-400">
              Sistema online
            </h2>
            <p className="mt-4 text-zinc-300">
              Conexão restabelecida com sucesso.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}