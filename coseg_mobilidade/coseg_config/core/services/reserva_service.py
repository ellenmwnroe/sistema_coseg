from dataclasses import replace
from datetime import date

from core.domain.entidades import StatusReserva
from core.domain.excecoes import (
    ReservaInvalida,
    SemMotoristaDisponivel,
    ReservaNaoEditavel,
    ReservaNaoEncontrada,
    SemVeiculoDisponivel,
    VeiculoInativo,
)
from core.domain.validadores import (
    ValidadorCampos,
    ValidadorCapacidade,
    ValidadorConflito,
    ValidadorMotorista,
    ValidadorPeriodo,
    ordem_de_escala,
)


class ReservaService:
    def __init__(self, reservas, veiculos, hoje=date.today, motoristas=None):
        self._reservas = reservas
        self._veiculos = veiculos
        self._motoristas = motoristas
        self._motorista = ValidadorMotorista()
        self._campos = ValidadorCampos()
        self._capacidade = ValidadorCapacidade()
        self._periodo = ValidadorPeriodo(hoje)
        self._conflito = ValidadorConflito()

    def frota(self):
        return self._veiculos.listar()

    def motoristas(self):
        return self._motoristas.listar() if self._motoristas else []

    def listar(self, data=None):
        return self._reservas.listar(data)

    def obter(self, reserva_id):
        reserva = self._reservas.obter(reserva_id)
        if reserva is None:
            raise ReservaNaoEncontrada(reserva_id)
        return reserva

    def validar(self, reserva, codigo_veiculo=None, codigo_motorista=None):
        """Aplica todas as regras sem gravar (usado pelo Django Admin)."""
        self._preparar(reserva, codigo_veiculo, codigo_motorista)
        return reserva

    def criar(self, reserva, codigo_veiculo=None, codigo_motorista=None):
        self._preparar(reserva, codigo_veiculo, codigo_motorista)
        return self._reservas.salvar(reserva)

    def atualizar(self, reserva_id, reserva, codigo_veiculo=None, codigo_motorista=None):
        atual = self._obter_confirmada(reserva_id)
        reserva.id = reserva_id
        reserva.status = atual.status
        self._preparar(reserva, codigo_veiculo, codigo_motorista, preferido=atual.motorista)
        return self._reservas.salvar(reserva)

    def cancelar(self, reserva_id):
        """Cancela sem apagar: a reserva fica no histórico e libera o horário."""
        return self._mudar_status(reserva_id, StatusReserva.CANCELADA)

    def concluir(self, reserva_id):
        return self._mudar_status(reserva_id, StatusReserva.CONCLUIDA)

    def _mudar_status(self, reserva_id, novo_status):
        reserva = self._obter_confirmada(reserva_id)
        reserva.status = novo_status
        return self._reservas.salvar(reserva)

    def _obter_confirmada(self, reserva_id):
        reserva = self.obter(reserva_id)
        if reserva.status is not StatusReserva.CONFIRMADA:
            raise ReservaNaoEditavel(reserva_id, reserva.status)
        return reserva

    def _preparar(self, reserva, codigo_veiculo, codigo_motorista=None, preferido=None):
        if codigo_veiculo:
            reserva.veiculo = self._buscar_veiculo(codigo_veiculo)
        if codigo_motorista:
            reserva.motorista = self._buscar_motorista(codigo_motorista)
        self._campos.validar(reserva)
        self._capacidade.validar(reserva)
        self._periodo.validar(reserva)
        if reserva.veiculo is None:
            reserva.veiculo = self._alocar(reserva)
        else:
            existentes = self._reservas.listar_do_veiculo_na_data(
                reserva.veiculo.codigo, reserva.data
            )
            self._conflito.validar(reserva, existentes)
        if reserva.motorista is not None:
            # Motorista indicado à mão (admin do COSEG): só confere as regras.
            agenda = self._reservas.listar_do_motorista_na_data(
                reserva.motorista.matricula, reserva.data
            )
            self._motorista.validar(reserva, agenda)
        else:
            reserva.motorista = self._escalar(reserva, preferido)

    def _escalar(self, reserva, preferido=None):
        """Escala automaticamente um motorista habilitado e livre no horário."""
        if self._motoristas is None:
            return None
        todos = self._motoristas.listar()
        if not todos:
            return None  # sistema sem motoristas cadastrados: reserva segue sem escala
        categoria = reserva.veiculo.categoria
        candidatos = []
        for motorista in todos:
            if not motorista.pode_ser_escalado_para(categoria, reserva.data):
                continue
            agenda = [
                r for r in self._reservas.listar_do_motorista_na_data(motorista.matricula, reserva.data)
                if r.id != reserva.id
            ]
            if any(replace(reserva, motorista=motorista).conflita_motorista_com(r) for r in agenda):
                continue
            carga = sum(r.duracao_minutos for r in agenda if r.status.value != "CANCELADA")
            candidatos.append((ordem_de_escala(motorista, carga, preferido), motorista))
        if not candidatos:
            raise SemMotoristaDisponivel(categoria, reserva.data, reserva.saida, reserva.retorno)
        return min(candidatos, key=lambda par: par[0])[1]

    def _buscar_motorista(self, matricula):
        motorista = self._motoristas.obter(matricula) if self._motoristas else None
        if motorista is None:
            raise ReservaInvalida(
                f"O motorista {matricula} não está cadastrado.", campo="motorista"
            )
        return motorista

    def _buscar_veiculo(self, codigo):
        veiculo = self._veiculos.obter(codigo)
        if veiculo is None:
            raise ReservaInvalida(
                f"O veículo {codigo} não está cadastrado na frota.", campo="veiculo"
            )
        if not veiculo.ativo:
            raise VeiculoInativo(codigo)
        return veiculo

    def _alocar(self, reserva):
        for candidato in self._veiculos.listar_por_categoria(reserva.categoria):
            if not candidato.ativo:
                continue
            existentes = self._reservas.listar_do_veiculo_na_data(
                candidato.codigo, reserva.data
            )
            tentativa = replace(reserva, veiculo=candidato)
            if self._conflito.localizar(tentativa, existentes) is None:
                return candidato
        raise SemVeiculoDisponivel(
            reserva.categoria, reserva.data, reserva.saida, reserva.retorno
        )
