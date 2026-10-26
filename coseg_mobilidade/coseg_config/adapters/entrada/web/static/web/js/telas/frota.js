// Frota: um card por veículo, com a ocupação de hoje numa mini linha do tempo.
import { api } from "../api.js";
import { icone } from "../ui.js";
import { NOME_CATEGORIA, hojeISO, html, minutos } from "../util.js";

const INICIO = 6 * 60;
const FIM = 22 * 60;

export async function render(main) {
  const [veiculos, deHoje] = await Promise.all([api.veiculos(), api.reservas(hojeISO())]);
  const ativas = deHoje.filter((r) => r.status !== "CANCELADA");
  const leves = veiculos.filter((v) => v.categoria === "VL").length;
  const inativos = veiculos.filter((v) => !v.ativo).length;

  const faixa = (min) => Math.min(Math.max(min, INICIO), FIM);
  const pct = (min) => ((faixa(min) - INICIO) / (FIM - INICIO)) * 100;

  main.innerHTML = html`
    <section class="tela">
      <div class="cabecalho">
        <div>
          <p class="sobrelinha">Frota do COSEG</p>
          <h1 class="titulo">${veiculos.length} veículos</h1>
          <p class="subtitulo">${leves} leves (até 4 pessoas) · ${veiculos.length - leves} coletivos (até 18)${inativos ? ` · ${inativos} fora de operação` : ""}</p>
        </div>
        <a class="botao botao-contorno" href="/admin/persistencia/veiculomodel/">${icone.externo} Gerenciar no admin</a>
      </div>

      <div class="veiculos">
        ${veiculos.map((v) => {
          const reservas = ativas.filter((r) => r.veiculo === v.codigo);
          const coletivo = v.categoria === "VC";
          return html`
            <article class="card veiculo ${coletivo && v.ativo ? "card-verde" : ""} ${v.ativo ? "" : "inativo"}">
              <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
                <span class="pilula pilula-pequena ${coletivo ? "pilula-menta" : "pilula-escura"}">${NOME_CATEGORIA[v.categoria]} · ${v.categoria}</span>
                <span class="pilula pilula-pequena ${v.ativo ? "pilula-contorno" : "pilula-cinza"}">${v.ativo ? "Ativo" : "Inativo"}</span>
              </div>
              <p class="veiculo-codigo">${v.codigo}</p>
              <dl class="veiculo-dados">
                <div><dt>Capacidade</dt><dd>${v.capacidade} lugares</dd></div>
                <div><dt>Hoje</dt><dd>${reservas.length === 1 ? "1 reserva" : `${reservas.length} reservas`}</dd></div>
                <div><dt>Placa</dt><dd class="mono">${v.placa || "—"}</dd></div>
                <div><dt>Modelo</dt><dd>${v.modelo || "—"}</dd></div>
              </dl>
              <div>
                <div class="mini-dia" role="img" aria-label="Ocupação de hoje: ${reservas.map((r) => `${r.saida} a ${r.retorno}`).join(", ") || "livre o dia todo"}">
                  ${reservas.map((r) => html`<span style="left:${pct(minutos(r.saida))}%;width:${pct(minutos(r.retorno)) - pct(minutos(r.saida))}%"></span>`)}
                </div>
                <div class="mini-dia-horas" aria-hidden="true"><span>06h</span><span>14h</span><span>22h</span></div>
              </div>
              ${v.ativo
                ? html`<a class="botao ${coletivo ? "botao-menta" : "botao-escuro"}" href="#/nova?veiculo=${v.codigo}">Reservar ${v.codigo} ${icone.seta}</a>`
                : html`<p class="kpi-nota">Fora de operação. Reative no admin quando voltar.</p>`}
            </article>`;
        })}
      </div>
    </section>`.texto;
  return null;
}
