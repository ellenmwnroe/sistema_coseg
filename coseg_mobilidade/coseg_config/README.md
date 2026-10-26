# COSEG Mobilidade — reserva de veículos do Porto do Itaqui (PBL 1 + PBL 2)

Sistema de reserva de veículos do Porto do Itaqui. Python + Django, organizado em
Arquitetura Hexagonal (Ports and Adapters).

## Estrutura

```
core/                       # regras de negócio em Python puro (sem Django)
  domain/                   # entidades, validadores e exceções
  ports/                    # contratos dos repositórios (Protocol)
  services/                 # ReservaService
adapters/
  saida/persistencia/       # models, migrations, repositórios ORM, seed
  entrada/web/              # views, rotas, serialização JSON, painel HTML
config/                     # settings e urls do projeto Django
tests/
  dominio/                  # testes das regras, sem banco
  integracao/               # persistência, CRUD e rotas HTTP
```

## Como rodar

```
pip install -r requirements.txt
python manage.py migrate
python manage.py carregar_seed
python manage.py createsuperuser
python manage.py runserver
```

Painel: http://127.0.0.1:8000/painel/
Admin: http://127.0.0.1:8000/admin/ (entre com o usuário criado no `createsuperuser`).
O formulário de reservas do Admin passa pelas mesmas regras da API
(capacidade, data, horários e conflito).

## Interface web (PBL 2)

Abra **http://127.0.0.1:8000/** com o servidor rodando. É uma página única em
HTML + CSS + JavaScript puro (sem framework), servida pelo Django e consumindo a API.

| Tela | O que faz |
|---|---|
| Início | Resumo do dia: reservas de hoje, veículos livres agora, quem está na rua e próximas saídas |
| Agenda | Linha do tempo do dia, uma faixa por veículo. Clicar num espaço vazio abre a reserva já preenchida com veículo e horário |
| Nova reserva | Formulário com painel ao vivo: veículos livres no horário, categoria mínima pelo número de pessoas, escolha automática. Erros do servidor aparecem no campo certo |
| Reservas | Lista por dia com busca e filtros de período e status; editar e cancelar |
| Frota | Card de cada veículo com placa, modelo, situação e ocupação do dia |

```
adapters/entrada/web/
  templates/web/app.html     # esqueleto da página
  static/web/app.css         # identidade visual (a mesma da apresentação)
  static/web/js/
    main.js                  # rotas (#/agenda, #/nova...) e relógio
    api.js                   # chamadas à API e tratamento de erro
    util.js                  # HTML seguro, datas e regras espelhadas do servidor
    ui.js                    # avisos, diálogos, detalhe da reserva
    telas/                   # inicio, agenda, formulario, reservas, frota
```

A tela antecipa as regras (capacidade, conflito, data) para orientar quem preenche,
mas quem decide é sempre o servidor. O painel antigo continua em `/painel/`.

## Deploy na Vercel

O projeto já vem pronto para a Vercel (`config/wsgi.py`, `pyproject.toml`, `build.py`).

1. Em **Settings › General › Root Directory**, use `coseg_mobilidade/coseg_config`.
2. **Banco (recomendado):** em **Storage**, crie um banco **Neon (Postgres)** e conecte ao
   projeto. A Vercel cria a variável `DATABASE_URL` sozinha e, a cada deploy, o `build.py`
   aplica as migrations e carrega a frota.
3. Em **Settings › Environment Variables**, crie `DJANGO_SECRET_KEY` com um texto longo e
   aleatório.
4. Faça um novo deploy.

Para criar o usuário do admin no banco da Vercel, rode no seu computador, com a
`DATABASE_URL` do Neon no terminal:

```
python manage.py createsuperuser
```

**Sem Postgres** o site também sobe, em *modo demonstração*: o SQLite fica em `/tmp` do
servidor e é recriado (com a frota) sempre que a Vercel liga um servidor novo, ou seja,
as reservas somem de tempos em tempos e o admin não tem usuário. Serve para mostrar, não
para usar de verdade.

## Modelo de dados

| Tabela | Campos principais | Relacionamentos e restrições |
|---|---|---|
| `SetorModel` | nome (único) | 1 setor → N colaboradores |
| `ColaboradorModel` | nome, e-mail, telefone | N → 1 setor; nome único dentro do setor |
| `VeiculoModel` | código (único), categoria VL/VC, placa (única), modelo, ativo | 1 veículo → N reservas |
| `ReservaModel` | atividade, origem, destino, data, saída, retorno, passageiros, categoria pretendida, observações, status | N → 1 colaborador; N → 1 veículo (PROTECT); retorno > saída; passageiros ≥ 1; status válido; índice (veículo, data) |

Todas as tabelas guardam `criado_em`/`atualizado_em` (na reserva, `criada_em`/`atualizada_em`).

- **Status da reserva:** `CONFIRMADA` → `CANCELADA` ou `CONCLUIDA`. Cancelar não apaga:
  a reserva fica no histórico (com `cancelada_em`) e deixa de ocupar o veículo.
- **Veículo inativo** (ex.: em manutenção) não pode ser reservado nem é escolhido na
  alocação automática por categoria.
- A API continua recebendo `solicitante` e `setor` como texto: o servidor reaproveita o
  colaborador e o setor já cadastrados (sem diferenciar maiúsculas) ou cria novos.
- As migrations `0003` a `0005` convertem os dados antigos (texto) para as tabelas novas
  e podem ser desfeitas.

## Testes

```
python manage.py test tests
```

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/veiculos/` | Lista a frota |
| GET | `/api/colaboradores/?setor=` | Lista colaboradores e setores cadastrados (sugestões do formulário) |
| GET | `/api/reservas/?data=AAAA-MM-DD` | Lista reservas (filtro opcional) |
| POST | `/api/reservas/` | Cria reserva (201, 400 ou 409) |
| GET, PUT, DELETE | `/api/reservas/<id>/` | Consulta, altera ou cancela (DELETE marca como cancelada, sem apagar) |

Respostas de erro: `{"sucesso": false, "codigo": "...", "erro": "...", "campo": "..."}`.
Códigos: `CAMPOS_OBRIGATORIOS`, `CAPACIDADE_EXCEDIDA`, `PERIODO_INVALIDO`,
`VEICULO_INATIVO` (400); `CONFLITO_DE_HORARIO`, `SEM_VEICULO_DISPONIVEL`,
`RESERVA_NAO_EDITAVEL` (409); `RESERVA_NAO_ENCONTRADA` (404).
