// Ponto de entrada: roteamento por hash (#/agenda, #/nova...) e relógio do topo.
import { prepararDialogo, telaDeErro } from "./ui.js";
import { html, lerRota } from "./util.js";
import * as inicio from "./telas/inicio.js";
import * as agenda from "./telas/agenda.js";
import * as formulario from "./telas/formulario.js";
import * as reservas from "./telas/reservas.js";
import * as frota from "./telas/frota.js";

const TELAS = {
  "": { modulo: inicio, menu: "inicio", titulo: "Início" },
  agenda: { modulo: agenda, menu: "agenda", titulo: "Agenda" },
  nova: { modulo: formulario, menu: "nova", titulo: "Nova reserva" },
  editar: { modulo: formulario, menu: "reservas", titulo: "Editar reserva" },
  reservas: { modulo: reservas, menu: "reservas", titulo: "Reservas" },
  frota: { modulo: frota, menu: "frota", titulo: "Frota" },
  motoristas: { modulo: frota, menu: "frota", titulo: "Motoristas" },
};

const main = document.getElementById("app");
const fab = document.getElementById("fab");
let limpar = null;

async function navegar() {
  const rota = lerRota();
  const tela = TELAS[rota.nome] || TELAS[""];

  limpar?.();
  limpar = null;
  document.title = `${tela.titulo} · COSEG Mobilidade`;
  document.querySelectorAll(".menu a").forEach((link) => {
    if (link.dataset.rota === tela.menu) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  fab.hidden = tela.modulo === formulario;

  main.innerHTML = html`<div class="carregando" role="status"><span class="spinner" aria-hidden="true"></span> Carregando…</div>`.texto;
  window.scrollTo({ top: 0 });
  try {
    limpar = (await tela.modulo.render(main, rota)) || null;
  } catch (erro) {
    console.error(erro);
    main.innerHTML = telaDeErro(erro).texto;
  }
  main.focus({ preventScroll: true });
}

function relogio() {
  const el = document.getElementById("relogio");
  const tic = () => {
    const agora = new Date();
    el.textContent = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  tic();
  setInterval(tic, 15000);
}

prepararDialogo();
relogio();
window.addEventListener("hashchange", navegar);
navegar();
