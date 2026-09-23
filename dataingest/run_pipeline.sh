#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

VENV_DIR="${VENV_DIR:-.venv}"
SEED_MARKER="${SEED_MARKER:-.seed-prod.completed}"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip
  "$VENV_DIR/bin/pip" install -r requirements.txt
fi

if [ ! -f "$SEED_MARKER" ]; then
  echo "[1/2] Generando dataset de prueba (20,500 registros)..."
  "$VENV_DIR/bin/python" seed_prod.py
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$SEED_MARKER"
else
  echo "[1/2] Dataset ya generado; se omite seed_prod.py"
fi

echo "[2/2] Ejecutando los tres contenedores de ingesta..."
docker compose build
docker compose run --rm ingest-users
docker compose run --rm ingest-shops
docker compose run --rm ingest-products

echo "Pipeline completado. Verifica los objetos con: aws s3 ls s3://\$S3_BUCKET/ --recursive"
