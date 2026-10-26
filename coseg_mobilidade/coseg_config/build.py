"""Comando de build da Vercel (configurado no pyproject.toml).

Com Postgres conectado (DATABASE_URL), aplica as migrations e carrega a frota
a cada deploy. O carregar_seed não duplica nada se rodar de novo.
"""
import os
import subprocess
import sys


def manage(*args):
    subprocess.run([sys.executable, "manage.py", *args], check=True)


def main():
    if os.environ.get("DATABASE_URL"):
        manage("migrate", "--noinput")
        manage("carregar_seed")
    else:
        print("DATABASE_URL não definida: modo demonstração (SQLite temporário em /tmp).")


if __name__ == "__main__":
    main()
