from datetime import date

from core.domain.entidades import CategoriaVeiculo
from core.domain.excecoes import (
    CamposObrigatorios,
    CapacidadeExcedida,
    CnhVencida,
    ConflitoDeHorario,
    ConflitoDeMotorista,
    MotoristaInativo,
    MotoristaNaoHabilitado,
    PeriodoInvalido,
    ReservaInvalida,
)

CAMPOS_TEXTO = ("solicitante", "setor", "atividade", "origem", "destino")
CAMPOS_PERIODO = ("data", "saida", "retorno")


def limite_da_frota():
    return max(categoria.capacidade for categoria in CategoriaVeiculo)


def categoria_minima(passageiros):
    for categoria in sorted(CategoriaVeiculo, key=lambda c: c.capacidade):
        if passageiros <= categoria.capacidade:
            return categoria
    raise CapacidadeExcedida(
        f"Solicitações acima de {limite_da_frota()} passageiros não podem "
        "ser atendidas pela frota.",
        campo="passageiros",
    )


class ValidadorCampos:
    def validar(self, reserva):
        ausentes = [
            campo
            for campo in CAMPOS_TEXTO
            if not (getattr(reserva, campo) or "").strip()
        ]
        ausentes += [c for c in CAMPOS_PERIODO if getattr(reserva, c) is None]
        if reserva.passageiros is None:
            ausentes.append("passageiros")
        if reserva.veiculo is None and reserva.categoria is None:
            ausentes.append("veiculo ou categoria")
        if ausentes:
            raise CamposObrigatorios(ausentes)
        if reserva.passageiros < 1:
            raise ReservaInvalida(
                "Informe ao menos 1 passageiro.", campo="passageiros"
            )


class ValidadorCapacidade:
    def validar(self, reserva):
        categoria_minima(reserva.passageiros)
        categoria = reserva.veiculo.categoria if reserva.veiculo else reserva.categoria
        if reserva.passageiros > categoria.capacidade:
            alvo = reserva.veiculo.codigo if reserva.veiculo else categoria.value
            sugerida = categoria_minima(reserva.passageiros).value
            raise CapacidadeExcedida(
                f"{alvo} comporta até {categoria.capacidade} passageiros e "
                f"foram informados {reserva.passageiros}. "
                f"Utilize a categoria {sugerida}.",
                campo="passageiros",
            )


class ValidadorPeriodo:
    def __init__(self, hoje=date.today):
        self._hoje = hoje

    def validar(self, reserva):
        if reserva.data < self._hoje():
            raise PeriodoInvalido(
                "A data da reserva não pode estar no passado.", campo="data"
            )
        if reserva.retorno <= reserva.saida:
            raise PeriodoInvalido(
                "O horário de retorno deve ser posterior ao de saída.",
                campo="retorno",
            )


class ValidadorConflito:
    def localizar(self, reserva, existentes):
        for outra in existentes:
            if reserva.id is not None and outra.id == reserva.id:
                continue
            if reserva.conflita_com(outra):
                return outra
        return None

    def validar(self, reserva, existentes):
        conflito = self.localizar(reserva, existentes)
        if conflito is not None:
            raise ConflitoDeHorario(conflito)


def ordem_de_escala(motorista, carga_minutos, preferido=None):
    """Critério para escalar automaticamente, do mais ao menos indicado:
    1. o motorista que já estava na reserva (numa edição), se ainda puder;
    2. a CNH mais básica que serve — poupa quem tem D/E para o coletivo;
    3. quem rodou menos minutos no dia — divide o trabalho;
    4. ordem alfabética, para o resultado ser sempre o mesmo."""
    return (
        not (preferido and motorista.matricula == preferido.matricula),
        motorista.categoria_cnh.nivel,
        carga_minutos,
        motorista.nome,
    )


class ValidadorMotorista:
    """Motorista é opcional; quando informado, precisa estar ativo, habilitado para a
    categoria do veículo, com CNH válida na data e livre no horário."""

    def validar(self, reserva, agenda_do_motorista):
        motorista = reserva.motorista
        if motorista is None:
            return
        if not motorista.ativo:
            raise MotoristaInativo(motorista)
        if not motorista.pode_dirigir(reserva.veiculo.categoria):
            raise MotoristaNaoHabilitado(motorista, reserva.veiculo.categoria)
        if not motorista.cnh_valida_em(reserva.data):
            raise CnhVencida(motorista, reserva.data)
        for outra in agenda_do_motorista:
            if reserva.id is not None and outra.id == reserva.id:
                continue
            if reserva.conflita_motorista_com(outra):
                raise ConflitoDeMotorista(outra)
