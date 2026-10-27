// Utilitários puros: HTML seguro, datas, horários e as regras espelhadas do servidor.

// ---------------------------------------------------------------- HTML ---
// Tudo que vem da API (nomes, destinos...) passa por escape antes de virar HTML.
export class Seguro {
  constructor(texto) { this.texto = texto; }
  toString() { return this.texto; }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

function emTexto(valor) {
  if (valor instanceof Seguro) return valor.texto;
  if (Array.isArray(valor)) return valor.map(emTexto).join("");
  if (valor === false || valor === null || valor === undefined) return "";
  return esc(valor);
}

/** Template tag: html`<p>${nome}</p>` escapa as interpolações automaticamente. */
export function html(partes, ...valores) {
  let saida = partes[0];
  valores.forEach((valor, i) => { saida += emTexto(valor) + partes[i + 1]; });
  return new Seguro(saida);
}

export const seguro = (texto) => new Seguro(texto);

// --------------------------------------------------------------- datas ---
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

const doisDigitos = (n) => String(n).padStart(2, "0");
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export const paraISO = (d) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
export const hojeISO = () => paraISO(new Date());

export function deISO(iso) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function somarDias(iso, dias) {
  const data = deISO(iso);
  data.setDate(data.getDate() + dias);
  return paraISO(data);
}

export const dataCurta = (iso) => iso.split("-").reverse().join("/");

export function dataExtenso(iso) {
  const d = deISO(iso);
  return `${capitalizar(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function rotuloDia(iso) {
  const hoje = hojeISO();
  if (iso === hoje) return "Hoje";
  if (iso === somarDias(hoje, 1)) return "Amanhã";
  if (iso === somarDias(hoje, -1)) return "Ontem";
  return dataExtenso(iso);
}

export function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

// ------------------------------------------------------------ horários ---
export function minutos(hhmm) {
  if (!hhmm) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const paraHHMM = (total) => `${doisDigitos(Math.floor(total / 60))}:${doisDigitos(total % 60)}`;

export function agoraMinutos() {
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes();
}

export function duracao(saida, retorno) {
  const total = minutos(retorno) - minutos(saida);
  if (!(total > 0)) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// --------------------------------------------- regras (espelho do core) ---
// O servidor é quem decide. Estas funções só antecipam o resultado na tela.
export const CAPACIDADE = { VL: 4, VC: 18 };
export const NOME_CATEGORIA = { VL: "Leve", VC: "Coletivo" };
export const STATUS = { CONFIRMADA: "Confirmada", CANCELADA: "Cancelada", CONCLUIDA: "Concluída" };

export function categoriaMinima(passageiros) {
  if (passageiros <= CAPACIDADE.VL) return "VL";
  if (passageiros <= CAPACIDADE.VC) return "VC";
  return null;
}

/** Mesma regra do Reserva.conflita_com: intervalos semiabertos, canceladas não ocupam. */
export function conflita(a, b) {
  if (a.status === "CANCELADA" || b.status === "CANCELADA") return false;
  return a.veiculo === b.veiculo
    && a.data === b.data
    && minutos(a.saida) < minutos(b.retorno)
    && minutos(b.saida) < minutos(a.retorno);
}

/** Mesmo motorista em dois horários que se cruzam (canceladas não contam). */
export function conflitaMotorista(a, b) {
  if (!a.motorista || !b.motorista || a.motorista !== b.motorista) return false;
  if (a.status === "CANCELADA" || b.status === "CANCELADA") return false;
  return a.data === b.data
    && minutos(a.saida) < minutos(b.retorno)
    && minutos(b.saida) < minutos(a.retorno);
}

/** Situação de um motorista para uma reserva (mesma ordem de regras do servidor). */
export function situacaoMotorista(m, { categoria, data, saida, retorno, doDia, ignorarId }) {
  if (!m.ativo) return { livre: false, motivo: "Inativo" };
  if (categoria && !m.dirige.includes(categoria)) return { livre: false, motivo: `não dirige ${categoria}` };
  if (data && m.cnh_validade < data) return { livre: false, motivo: "CNH vencida" };
  if (data && saida && retorno && minutos(retorno) > minutos(saida)) {
    const choque = (doDia || []).find((r) => r.id !== ignorarId
      && conflitaMotorista({ motorista: m.matricula, data, saida, retorno, status: "CONFIRMADA" }, r));
    if (choque) return { livre: false, motivo: `Escalado ${choque.saida}–${choque.retorno}`, choque };
  }
  return { livre: true, motivo: "Livre" };
}

export const primeiroNome = (nome) => (nome || "").split(" ")[0];

const NIVEL_CNH = { B: 0, C: 1, D: 2, E: 3 };

/** Antecipa quem o servidor vai escalar (mesmo critério do ordem_de_escala do core):
 *  1. quem já estava na reserva (edição); 2. a CNH mais básica que serve, poupando
 *  D/E para o coletivo; 3. quem rodou menos minutos no dia; 4. ordem alfabética. */
export function escalarMotorista(motoristas, { categoria, data, saida, retorno, doDia, ignorarId, preferido }) {
  const candidatos = motoristas
    .map((m) => ({ m, ...situacaoMotorista(m, { categoria, data, saida, retorno, doDia, ignorarId }) }))
    .filter((s) => s.livre)
    .map((s) => ({
      m: s.m,
      carga: (doDia || [])
        .filter((r) => r.motorista === s.m.matricula && r.id !== ignorarId && r.status !== "CANCELADA")
        .reduce((total, r) => total + minutos(r.retorno) - minutos(r.saida), 0),
    }));
  candidatos.sort((a, b) =>
    (a.m.matricula === preferido ? 0 : 1) - (b.m.matricula === preferido ? 0 : 1)
    || NIVEL_CNH[a.m.cnh_categoria] - NIVEL_CNH[b.m.cnh_categoria]
    || a.carga - b.carga
    || a.m.nome.localeCompare(b.m.nome, "pt-BR"));
  return candidatos[0] || null;
}

// ---------------------------------------------------------------- rota ---
export function lerRota() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [caminho, consulta = ""] = hash.split("?");
  const [nome = "", id] = caminho.split("/");
  return { nome, id, params: new URLSearchParams(consulta) };
}

/** Atualiza a URL sem recarregar a tela (não dispara hashchange). */
export function trocarParams(nome, params) {
  const texto = new URLSearchParams(params).toString();
  history.replaceState(null, "", `#/${nome}${texto ? `?${texto}` : ""}`);
}
