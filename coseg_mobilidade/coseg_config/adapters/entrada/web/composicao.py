from adapters.saida.persistencia.repositorios import (
    ColaboradorDjangoRepository,
    ReservaDjangoRepository,
    VeiculoDjangoRepository,
)
from core.services.cadastro_service import CadastroService
from core.services.reserva_service import ReservaService


def montar_service():
    return ReservaService(ReservaDjangoRepository(), VeiculoDjangoRepository())


def montar_cadastro():
    return CadastroService(ColaboradorDjangoRepository())
