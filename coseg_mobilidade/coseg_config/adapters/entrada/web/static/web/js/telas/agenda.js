// Agenda: linha do tempo do dia, uma faixa por veículo.
// Clicar num espaço vazio abre uma reserva já preenchida com veículo e horário.
import { api } from "../api.js";
import { abrirDetalhe, aviso, icone, recarregar } from "../ui.js";
import {
  STATUS, agoraMinutos, dataExtenso, hojeISO, html, minutos,
  paraHHMM, rotuloDia, somarDias, trocarParams,
} from "../util.js";

const PASSO = 30;     // encaixe do clique na grade, em minutos
const DURACAO = 60;   // duração sugerida para uma reserva nova

export async function render(main, rota) {
  const veiculos = await api.veiculos();
  const estado = {
    data: rota.params.get("data") || hojeISO(),
    canceladas: rota.params.get("canceladas") === "1",
    reservas: [],
  };

  main.innerHTML = html`
    <section class="tela">
      <div class="cabecalho">
        <div>
          <p class="sobrelinha">Agenda da frota</p>
          <h1 class="titulo" id="agenda-titulo"></h1>
          <p class="subtitulo" id="agenda-resumo"></p>
        </div>
        <div class="barra-ferramentas">
          <button class="botao botao-contorno botao-icone" data-ir="-1" aria-label="Dia anterior">${icone.esquerda}</button>
          <button class="botao botao-escuro botao-pequeno" data-ir="hoje">Hoje</button>
          <button class="botao botao-contorno botao-icone" data-ir="1" aria-label="Próximo dia">${icone.direita}</button>
          <label class="sr" for="agenda-data">Escolher data</label>
          <input class="campo-data mono" type="date" id="agenda-data">
        </div>
      </div>

      <div class="card" style="padding:0">
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:22px 24px 6px">
          <div class="legenda" aria-label="Legenda">
            <span><i style="background:var(--tinta)"></i>Leve (VL)</span>
            <span><i style="background:var(--verde)"></i>Coletivo (VC)</span>
            <span><i style="background:#A9AEA8"></i>Concluída</span>
            <span><i style="box-shadow:inset 0 0 0 2px var(--tinta-3)"></i>Cancelada</span>
          </div>
          <label class="alternar"><input type="checkbox" id="agenda-canceladas"> Mostrar canceladas</label>
        </div>
        <div class="agenda" id="agenda-grade"></div>
      </div>
      <p class="dica">${icone.info} Clique num espaço vazio da linha do tempo para reservar aquele veículo naquele horário. Clique numa reserva para ver detalhes, editar ou cancelar.</p>
    </section>`.texto;

  const grade = main.querySelector("#agenda-grade");
  const campoData = main.querySelector("#agenda-data");
  const campoCanceladas = main.querySelector("#agenda-canceladas");

  async function carregar() {
    campoData.value = estado.data;
    campoCanceladas.checked = estado.canceladas;
    trocarParams("agenda", { data: estado.data, ...(estado.canceladas ? { canceladas: "1" } : {}) });
    main.querySelector("#agenda-titulo").textContent = rotuloDia(estado.data) === dataExtenso(estado.data)
      ? dataExtenso(estado.data) : `${rotuloDia(estado.data)}, ${dataExtenso(estado.data).split(", ")[1]}`;
    grade.setAttribute("aria-busy", "true");
    try {
      estado.reservas = await api.reservas(estado.data);
    } catch (erro) {
      aviso(erro.message, "erro");
      estado.reservas = [];
    }
    grade.removeAttribute("aria-busy");
    desenhar();
    rolarParaOFoco();
  }

  // No celular a grade rola para o lado: centraliza no "agora" ou na primeira saída.
  function rolarParaOFoco() {
    if (grade.scrollWidth <= grade.clientWidth) return;
    const inicio = Number(grade.dataset.inicio);
    const total = Number(grade.dataset.total);
    const ativas = estado.reservas.filter((r) => r.status !== "CANCELADA");
    let alvo = 8 * 60;
    if (estado.data === hojeISO()) alvo = agoraMinutos();
    else if (ativas.length) alvo = Math.min(...ativas.map((r) => minutos(r.saida)));
    const interna = grade.firstElementChild;
    const x = 24 + 168 + (interna.clientWidth - 48 - 168) * ((alvo - inicio) / total);
    grade.scrollLeft = Math.max(0, x - grade.clientWidth / 2);
  }

  function desenhar() {
    const visiveis = estado.reservas.filter((r) => estado.canceladas || r.status !== "CANCELADA");
    const ativas = estado.reservas.filter((r) => r.status !== "CANCELADA");
    const emUso = new Set(ativas.map((r) => r.veiculo)).size;
    main.querySelector("#agenda-resumo").textContent =
      `${ativas.length === 1 ? "1 reserva" : `${ativas.length} reservas`} · ${emUso} de ${veiculos.length} veículos com saída no dia`;

    // Janela padrão 06h–22h, alargada se houver reserva fora dela.
    let inicio = 6 * 60;
    let fim = 22 * 60;
    for (const r of visiveis) {
      inicio = Math.min(inicio, Math.floor(minutos(r.saida) / 60) * 60);
      fim = Math.max(fim, Math.ceil(minutos(r.retorno) / 60) * 60);
    }
    const total = fim - inicio;
    const horas = total / 60;
    const pos = (min) => `${((min - inicio) / total) * 100}%`;
    const larg = (a, b) => `${((b - a) / total) * 100}%`;

    const agora = agoraMinutos();
    const mostrarAgora = estado.data === hojeISO() && agora >= inicio && agora <= fim;

    grade.innerHTML = html`
      <div class="agenda-interna" style="--passo-hora: calc(100% / ${horas})">
        <div class="agenda-linha agenda-cabeca" aria-hidden="true">
          <div></div>
          <div class="agenda-trilho" style="border-top:0;background:none;cursor:default">
            ${Array.from({ length: horas + 1 }, (_, i) => html`
              <span class="agenda-hora" style="left:${(i / horas) * 100}%">${paraHHMM(inicio + i * 60).slice(0, 2)}h</span>`)}
          </div>
        </div>
        ${veiculos.map((v) => {
          const doVeiculo = visiveis.filter((r) => r.veiculo === v.codigo);
          return html`
            <div class="agenda-linha">
              <div class="agenda-veiculo">
                <strong>${v.codigo}
                  <span class="pilula pilula-pequena ${v.categoria === "VC" ? "pilula-verde" : "pilula-cinza"}">${v.categoria}</span>
                </strong>
                <small>${v.ativo ? `${v.capacidade} lugares${v.placa ? ` · ${v.placa}` : ""}` : "Inativo"}</small>
              </div>
              <div class="agenda-trilho ${v.ativo ? "" : "inativo"}" data-veiculo="${v.codigo}" data-ativo="${v.ativo ? "1" : "0"}"
                   role="group" aria-label="${v.codigo}: ${doVeiculo.length} reserva(s)">
                ${doVeiculo.map((r) => {
                  // Bloco curto mostra menos texto; o detalhe completo fica no title e no clique.
                  const dur = minutos(r.retorno) - minutos(r.saida);
                  const rotulo = dur >= 120 ? `${r.saida}–${r.retorno}` : r.saida;
                  return html`
                  <button class="bloco ${v.categoria === "VC" ? "vc" : ""} ${r.status.toLowerCase()}"
                          style="left:${pos(minutos(r.saida))};width:${larg(minutos(r.saida), minutos(r.retorno))}"
                          data-reserva="${r.id}" title="${r.saida}–${r.retorno} · ${r.atividade} · ${r.solicitante}"
                          aria-label="${r.saida} a ${r.retorno}, ${r.atividade}, ${r.solicitante}, ${STATUS[r.status]}">
                    ${dur >= 60 ? html`<b>${rotulo}</b>` : ""}
                    ${dur >= 60 ? html`<span>${r.atividade} · ${r.solicitante}</span>` : ""}
                  </button>`;
                })}
              </div>
            </div>`;
        })}
        ${mostrarAgora ? html`
          <span class="agenda-agora" aria-hidden="true"
                style="left:calc(24px + 168px + (100% - 48px - 168px) * ${(agora - inicio) / total})"></span>` : ""}
      </div>`.texto;

    grade.dataset.inicio = inicio;
    grade.dataset.total = total;
  }

  // Converte a posição do mouse num horário encaixado na grade de 30 min.
  function horarioNoPonto(trilho, clientX) {
    const caixa = trilho.getBoundingClientRect();
    const proporcao = Math.min(Math.max((clientX - caixa.left) / caixa.width, 0), 1);
    const inicio = Number(grade.dataset.inicio);
    const total = Number(grade.dataset.total);
    let saida = inicio + Math.floor((proporcao * total) / PASSO) * PASSO;
    saida = Math.min(saida, inicio + total - PASSO);
    const retorno = Math.min(saida + DURACAO, inicio + total);
    return { saida, retorno, inicio, total };
  }

  // Bloco fantasma que acompanha o mouse mostrando o horário que será reservado.
  let fantasma = null;
  function mostrarFantasma(e) {
    const trilho = e.target.closest(".agenda-trilho[data-veiculo]");
    if (!trilho || trilho.dataset.ativo === "0" || e.target.closest(".bloco")) {
      fantasma?.remove();
      fantasma = null;
      return;
    }
    const { saida, retorno, inicio, total } = horarioNoPonto(trilho, e.clientX);
    if (!fantasma || fantasma.parentElement !== trilho) {
      fantasma?.remove();
      fantasma = document.createElement("span");
      fantasma.className = "agenda-fantasma";
      fantasma.setAttribute("aria-hidden", "true");
      trilho.append(fantasma);
    }
    fantasma.style.left = `${((saida - inicio) / total) * 100}%`;
    fantasma.style.width = `${((retorno - saida) / total) * 100}%`;
    fantasma.textContent = `+ ${paraHHMM(saida)}`;
  }

  function aoClicar(e) {
    const bloco = e.target.closest("[data-reserva]");
    if (bloco) {
      const reserva = estado.reservas.find((r) => String(r.id) === bloco.dataset.reserva);
      abrirDetalhe(reserva, recarregar);
      return;
    }
    const trilho = e.target.closest(".agenda-trilho[data-veiculo]");
    if (trilho) {
      if (trilho.dataset.ativo === "0") {
        aviso(`${trilho.dataset.veiculo} está inativo e não pode ser reservado.`, "erro");
        return;
      }
      const { saida, retorno } = horarioNoPonto(trilho, e.clientX);
      const params = new URLSearchParams({
        veiculo: trilho.dataset.veiculo, data: estado.data, saida: paraHHMM(saida), retorno: paraHHMM(retorno),
      });
      location.hash = `#/nova?${params}`;
      return;
    }
    const ir = e.target.closest("[data-ir]")?.dataset.ir;
    if (ir) {
      estado.data = ir === "hoje" ? hojeISO() : somarDias(estado.data, Number(ir));
      carregar();
    }
  }

  campoData.addEventListener("change", () => {
    if (campoData.value) { estado.data = campoData.value; carregar(); }
  });
  campoCanceladas.addEventListener("change", () => {
    estado.canceladas = campoCanceladas.checked;
    trocarParams("agenda", { data: estado.data, ...(estado.canceladas ? { canceladas: "1" } : {}) });
    desenhar();
  });
  main.addEventListener("click", aoClicar);
  grade.addEventListener("mousemove", mostrarFantasma);
  grade.addEventListener("mouseleave", () => { fantasma?.remove(); fantasma = null; });

  // Linha do "agora" anda sozinha.
  const relogio = setInterval(() => { if (estado.data === hojeISO()) desenhar(); }, 60000);

  await carregar();
  return () => {
    clearInterval(relogio);
    main.removeEventListener("click", aoClicar);
  };
}
