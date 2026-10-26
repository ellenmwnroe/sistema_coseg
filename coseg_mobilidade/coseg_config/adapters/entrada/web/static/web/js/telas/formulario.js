// Nova reserva / editar reserva.
// O painel escuro à direita mostra, enquanto a pessoa digita, quais veículos
// estão livres no horário, qual categoria o grupo exige e o que o servidor deve
// responder. Quem decide de verdade continua sendo o servidor: os erros que ele
// devolve aparecem no campo certo (usando o "campo" do JSON de erro).
import { api } from "../api.js";
import { aviso, icone } from "../ui.js";
import {
  CAPACIDADE, NOME_CATEGORIA, categoriaMinima, conflita, dataExtenso, duracao,
  hojeISO, html, minutos,
} from "../util.js";

const CAMPOS = ["solicitante", "setor", "atividade", "origem", "destino", "data", "saida", "retorno", "passageiros", "observacoes"];
// Nome do campo no JSON de erro da API -> campo da tela.
const CAMPO_DA_TELA = { categoria: "veiculo", "veiculo ou categoria": "veiculo", status: "geral" };

export async function render(main, rota) {
  const editando = rota.nome === "editar";
  const [veiculos, cadastro, original] = await Promise.all([
    api.veiculos(),
    api.colaboradores().catch(() => ({ colaboradores: [], setores: [] })),
    editando ? api.reserva(rota.id) : null,
  ]);

  if (editando && original.status !== "CONFIRMADA") {
    main.innerHTML = html`
      <section class="tela"><div class="card vazio-grande">
        <strong>Esta reserva está ${original.status === "CANCELADA" ? "cancelada" : "concluída"}</strong>
        <p>Só reservas confirmadas podem ser alteradas.</p>
        <p style="margin-top:18px"><a class="botao botao-escuro" href="#/reservas">Voltar para reservas</a></p>
      </div></section>`.texto;
    return null;
  }

  const p = rota.params;
  const inicial = original || {
    solicitante: "", setor: "", atividade: "", origem: "Porto do Itaqui", destino: "",
    data: p.get("data") || hojeISO(), saida: p.get("saida") || "08:00", retorno: p.get("retorno") || "10:00",
    passageiros: 1, observacoes: "", veiculo: p.get("veiculo") || "",
  };
  const cache = new Map(); // data -> reservas daquele dia

  main.innerHTML = html`
    <section class="tela">
      <div class="cabecalho">
        <div>
          <p class="sobrelinha">${editando ? `Reserva #${original.id}` : "Nova reserva"}</p>
          <h1 class="titulo">${editando ? "Editar reserva" : "Pedir um veículo"}</h1>
          <p class="subtitulo">${editando
            ? "Altere o que precisar. O servidor confere tudo de novo antes de salvar."
            : "Preencha os dados e veja ao lado, na hora, quais veículos estão livres."}</p>
        </div>
      </div>

      <form class="form-layout" id="form" novalidate>
        <div class="secao" style="gap:20px">
          <div class="alerta alerta-erro" id="erro-geral" role="alert" hidden></div>

          <div class="card secao">
            <div class="secao-cabeca"><span class="secao-num">01</span><h2 class="secao-titulo">Quem está pedindo</h2></div>
            <div class="campos">
              ${campo("solicitante", "Nome do solicitante", inicial.solicitante, { list: "lista-colaboradores", autocomplete: "name" })}
              ${campo("setor", "Setor", inicial.setor, { list: "lista-setores" })}
            </div>
            <datalist id="lista-colaboradores">${cadastro.colaboradores.map((c) => html`<option value="${c.nome}">${c.setor}</option>`)}</datalist>
            <datalist id="lista-setores">${cadastro.setores.map((s) => html`<option value="${s}"></option>`)}</datalist>
          </div>

          <div class="card secao">
            <div class="secao-cabeca"><span class="secao-num">02</span><h2 class="secao-titulo">Para quê e para onde</h2></div>
            <div class="campos">
              ${campo("atividade", "Atividade", inicial.atividade, { cheio: true, placeholder: "Ex.: inspeção técnica no berço 101" })}
              ${campo("origem", "Origem", inicial.origem)}
              ${campo("destino", "Destino", inicial.destino)}
            </div>
          </div>

          <div class="card secao">
            <div class="secao-cabeca"><span class="secao-num">03</span><h2 class="secao-titulo">Quando</h2></div>
            <div class="campos campos-3">
              ${campo("data", "Data", inicial.data, { type: "date" })}
              ${campo("saida", "Saída", inicial.saida, { type: "time", step: 300 })}
              ${campo("retorno", "Retorno previsto", inicial.retorno, { type: "time", step: 300 })}
            </div>
          </div>

          <div class="card secao">
            <div class="secao-cabeca"><span class="secao-num">04</span><h2 class="secao-titulo">Quantas pessoas</h2></div>
            <div class="campo" id="campo-passageiros">
              <div class="contador">
                <button type="button" data-passageiros="-1" aria-label="Menos um passageiro">−</button>
                <output id="passageiros-saida" aria-live="polite">${inicial.passageiros}</output>
                <button type="button" data-passageiros="1" aria-label="Mais um passageiro">+</button>
                <input type="hidden" name="passageiros" id="passageiros" value="${inicial.passageiros}">
                <span class="contador-nota" id="passageiros-nota"></span>
              </div>
              <p class="msg-erro" id="erro-passageiros"></p>
            </div>
          </div>

          <div class="card secao">
            <div class="secao-cabeca"><span class="secao-num">05</span><h2 class="secao-titulo">Veículo</h2></div>
            <fieldset class="campo" id="campo-veiculo" style="border:0;padding:0;margin:0">
              <legend class="sr">Escolha o veículo</legend>
              <div class="escolhas" id="escolhas"></div>
              <p class="msg-erro" id="erro-veiculo"></p>
            </fieldset>
            ${campo("observacoes", "Observações (opcional)", inicial.observacoes, { textarea: true, placeholder: "Ex.: levar EPI, motorista precisa de crachá" })}
          </div>
        </div>

        <aside class="card card-escuro resumo" aria-label="Resumo da reserva">
          <div class="resumo-bloco">
            <span class="resumo-rotulo">Quando</span>
            <span class="resumo-valor" id="r-data"></span>
            <span class="resumo-valor mono" id="r-horario"></span>
            <span class="resumo-nota" id="r-duracao"></span>
          </div>
          <div class="resumo-bloco">
            <span class="resumo-rotulo">Grupo</span>
            <span class="resumo-valor" id="r-grupo"></span>
            <span class="resumo-nota" id="r-grupo-nota"></span>
          </div>
          <div class="resumo-bloco">
            <span class="resumo-rotulo">Disponibilidade no horário</span>
            <span class="resumo-nota" id="r-livres"></span>
            <div class="chips" id="r-chips"></div>
          </div>
          <div class="resumo-bloco">
            <span class="resumo-rotulo">Veículo</span>
            <span class="resumo-valor" id="r-veiculo"></span>
          </div>
          <div id="r-alertas" class="secao" style="gap:10px"></div>
          <button class="botao botao-menta botao-grande" type="submit" id="enviar">
            ${icone.check} ${editando ? "Salvar alterações" : "Confirmar reserva"}
          </button>
          ${editando ? html`<a class="botao botao-contorno" href="#/reservas">Descartar alterações</a>` : ""}
        </aside>
      </form>
    </section>`.texto;

  const form = main.querySelector("#form");
  const $ = (id) => form.querySelector(`#${id}`);
  const valor = (nome) => (form.elements[nome]?.value ?? "").trim();
  let escolhido = inicial.veiculo || "";

  // ---------------------------------------------------------- leitura ---
  const passageiros = () => Number($("passageiros").value) || 0;

  async function reservasDoDia(data) {
    if (!data) return [];
    if (!cache.has(data)) {
      cache.set(data, api.reservas(data).catch(() => []));
    }
    return cache.get(data);
  }

  // Situação de cada veículo para o horário que está na tela.
  async function situacoes() {
    const data = valor("data");
    const saida = valor("saida");
    const retorno = valor("retorno");
    const periodoOk = data && saida && retorno && minutos(retorno) > minutos(saida);
    const doDia = await reservasDoDia(data);
    const pessoas = passageiros();
    return veiculos.map((v) => {
      if (!v.ativo) return { v, livre: false, motivo: "Inativo" };
      if (pessoas > v.capacidade) return { v, livre: false, motivo: `Só ${v.capacidade} lugares` };
      if (!periodoOk) return { v, livre: true, motivo: "Defina o horário" };
      const choque = doDia.find((r) => r.id !== original?.id
        && conflita({ veiculo: v.codigo, data, saida, retorno, status: "CONFIRMADA" }, r));
      if (choque) return { v, livre: false, ocupado: true, motivo: `Ocupado ${choque.saida}–${choque.retorno}`, choque };
      return { v, livre: true, motivo: "Livre" };
    });
  }

  // --------------------------------------------------------- desenho ---
  async function atualizar() {
    const data = valor("data");
    const saida = valor("saida");
    const retorno = valor("retorno");
    const pessoas = passageiros();
    const categoria = categoriaMinima(pessoas);
    const lista = await situacoes();

    // Passageiros
    $("passageiros-saida").textContent = pessoas;
    $("passageiros-nota").textContent = categoria
      ? `cabe em veículo ${NOME_CATEGORIA[categoria].toLowerCase()} (${categoria}, até ${CAPACIDADE[categoria]})`
      : "acima de 18 — a frota não atende";

    // Escolhas de veículo (automático + cada veículo)
    const automaticoPossivel = Boolean(categoria);
    const escolhidoAtual = lista.find((s) => s.v.codigo === escolhido);
    let avisoTroca = "";
    if (escolhido && escolhidoAtual && !escolhidoAtual.livre) {
      avisoTroca = `${escolhido} não serve para esse pedido (${escolhidoAtual.motivo.toLowerCase()}). Voltei para a escolha automática.`;
      escolhido = "";
    }
    const primeiroLivre = lista.find((s) => s.livre && s.v.categoria === categoria);
    $("escolhas").innerHTML = html`
      <div class="escolha escolha-auto">
        <input type="radio" name="veiculo" id="v-auto" value="" ${escolhido ? "" : "checked"} ${automaticoPossivel ? "" : "disabled"}>
        <label for="v-auto"><strong>Automático</strong><small>${categoria ? `primeiro ${categoria} livre` : "indisponível"}</small></label>
      </div>
      ${lista.map((s) => html`
        <div class="escolha">
          <input type="radio" name="veiculo" id="v-${s.v.codigo}" value="${s.v.codigo}"
                 ${escolhido === s.v.codigo ? "checked" : ""} ${s.livre ? "" : "disabled"}>
          <label for="v-${s.v.codigo}"><strong>${s.v.codigo}</strong><small>${s.v.categoria} · ${s.motivo}</small></label>
        </div>`)}`.texto;

    // Resumo
    $("r-data").textContent = data ? dataExtenso(data) : "Escolha a data";
    $("r-horario").textContent = saida && retorno ? `${saida} → ${retorno}` : "";
    $("r-duracao").textContent = saida && retorno && duracao(saida, retorno) ? `${duracao(saida, retorno)} de uso` : "";
    $("r-grupo").textContent = `${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`;
    $("r-grupo-nota").textContent = categoria
      ? `Categoria mínima: ${categoria} (${NOME_CATEGORIA[categoria].toLowerCase()}, até ${CAPACIDADE[categoria]} lugares)`
      : "Nenhum veículo da frota leva mais de 18 pessoas";

    const relevantes = lista.filter((s) => s.v.ativo && (!categoria || s.v.categoria === categoria));
    const livres = relevantes.filter((s) => s.livre);
    $("r-livres").textContent = categoria
      ? `${livres.length} de ${relevantes.length} veículos ${categoria} livres`
      : "";
    $("r-chips").innerHTML = html`${relevantes.map((s) => html`
      <span class="chip ${s.livre ? "livre" : "ocupado"}" title="${s.motivo}">${s.v.codigo}</span>`)}`.texto;

    $("r-veiculo").textContent = escolhido
      ? escolhido
      : primeiroLivre ? `Automático → ${primeiroLivre.v.codigo}` : "Nenhum disponível";

    // Alertas antecipados (o servidor confirma ao enviar)
    const alertas = [];
    if (avisoTroca) alertas.push(["aviso", avisoTroca]);
    if (data && data < hojeISO()) alertas.push(["erro", "A data está no passado."]);
    if (saida && retorno && minutos(retorno) <= minutos(saida)) alertas.push(["erro", "O retorno precisa ser depois da saída."]);
    if (!categoria) alertas.push(["erro", "Grupos acima de 18 pessoas não podem ser atendidos pela frota."]);
    else if (!escolhido && !primeiroLivre) alertas.push(["erro", `Nenhum veículo ${categoria} livre nesse horário. Tente outro horário.`]);
    $("r-alertas").innerHTML = html`${alertas.map(([tipo, texto]) => html`
      <div class="alerta alerta-${tipo}">${icone.alerta}<span>${texto}</span></div>`)}`.texto;
  }

  // ----------------------------------------------------------- erros ---
  function limparErros() {
    form.querySelectorAll(".campo.erro").forEach((el) => el.classList.remove("erro"));
    form.querySelectorAll(".msg-erro").forEach((el) => { el.innerHTML = ""; });
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    $("erro-geral").hidden = true;
  }

  function marcarErro(nome, mensagem) {
    const alvo = CAMPO_DA_TELA[nome] || nome;
    const caixa = $(`campo-${alvo}`);
    const msg = $(`erro-${alvo}`);
    if (!caixa || !msg) {
      $("erro-geral").innerHTML = html`${icone.alerta}<span>${mensagem}</span>`.texto;
      $("erro-geral").hidden = false;
      return $("erro-geral");
    }
    caixa.classList.add("erro");
    msg.innerHTML = html`${icone.alerta}<span>${mensagem}</span>`.texto;
    form.elements[alvo]?.setAttribute?.("aria-invalid", "true");
    return caixa;
  }

  // ---------------------------------------------------------- envio ---
  async function enviar(e) {
    e.preventDefault();
    limparErros();
    const dados = Object.fromEntries(CAMPOS.map((c) => [c, valor(c)]));
    dados.passageiros = passageiros();
    if (escolhido) dados.veiculo = escolhido;
    else dados.categoria = categoriaMinima(dados.passageiros) || "VC";

    const botao = $("enviar");
    botao.disabled = true;
    const textoBotao = botao.innerHTML;
    botao.innerHTML = html`<span class="spinner" aria-hidden="true"></span> Conferindo com o servidor…`.texto;
    try {
      const resposta = editando ? await api.atualizar(original.id, dados) : await api.criar(dados);
      const r = resposta.reserva;
      aviso(`${resposta.mensagem} ${r.veiculo} · ${r.saida}–${r.retorno}.`);
      location.hash = `#/agenda?data=${r.data}`;
    } catch (erro) {
      const corpo = erro.corpo || {};
      let primeiro;
      if (corpo.campos?.length) {
        corpo.campos.forEach((c) => {
          const marcado = marcarErro(c, "Campo obrigatório.");
          primeiro ??= marcado;
        });
      } else {
        primeiro = marcarErro(corpo.campo || "geral", erro.message);
      }
      if (erro.status === 409) {
        // A agenda mudou (alguém reservou antes): recarrega a disponibilidade.
        cache.delete(dados.data);
        await atualizar();
      }
      primeiro?.scrollIntoView({ behavior: "smooth", block: "center" });
      aviso(erro.message, "erro");
    } finally {
      botao.disabled = false;
      botao.innerHTML = textoBotao;
    }
  }

  // ---------------------------------------------------------- eventos ---
  form.addEventListener("input", (e) => {
    if (e.target.name === "veiculo") return;
    e.target.closest(".campo")?.classList.remove("erro");
    if (e.target.name === "solicitante") {
      // Nome conhecido: completa o setor sozinho.
      const conhecido = cadastro.colaboradores.find((c) => c.nome.toLowerCase() === e.target.value.trim().toLowerCase());
      if (conhecido && !valor("setor")) form.elements.setor.value = conhecido.setor;
    }
    if (["data", "saida", "retorno"].includes(e.target.name)) atualizar();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "veiculo") {
      escolhido = e.target.value;
      $("campo-veiculo").classList.remove("erro");
      $("erro-veiculo").innerHTML = "";
      atualizar();
    }
  });
  form.addEventListener("click", (e) => {
    const passo = e.target.closest("[data-passageiros]")?.dataset.passageiros;
    if (!passo) return;
    const novo = Math.min(30, Math.max(1, passageiros() + Number(passo)));
    $("passageiros").value = novo;
    $("campo-passageiros").classList.remove("erro");
    atualizar();
  });
  form.addEventListener("submit", enviar);

  await atualizar();
  if (!editando) form.elements.solicitante.focus({ preventScroll: true });
  return null;
}

function campo(nome, rotulo, valor, opcoes = {}) {
  const { type = "text", cheio = false, textarea = false, ...extra } = opcoes;
  const atributos = Object.entries(extra).map(([k, v]) => html` ${k}="${v}"`);
  return html`
    <div class="campo ${cheio || textarea ? "campo-cheio" : ""}" id="campo-${nome}">
      <label for="${nome}">${rotulo}</label>
      ${textarea
        ? html`<textarea id="${nome}" name="${nome}"${atributos} aria-describedby="erro-${nome}">${valor}</textarea>`
        : html`<input id="${nome}" name="${nome}" type="${type}" value="${valor}"${atributos} aria-describedby="erro-${nome}">`}
      <p class="msg-erro" id="erro-${nome}"></p>
    </div>`;
}
