from adapters.saida.persistencia.repositorios import (
    ColaboradorDjangoRepository,
    MotoristaDjangoRepository,
    ReservaDjangoRepository,
    VeiculoDjangoRepository,
)
from core.services.cadastro_service import CadastroService
from core.services.reserva_service import ReservaService


def montar_service():
    return ReservaService(
        ReservaDjangoRepository(),
        VeiculoDjangoRepository(),
        motoristas=MotoristaDjangoRepository(),
    )


def montar_cadastro():
    return CadastroService(ColaboradorDjangoRepository())
