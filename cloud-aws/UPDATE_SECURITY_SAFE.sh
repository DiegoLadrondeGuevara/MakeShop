#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
STACK_NAME="${MAIN_STACK_NAME:-openstore-stack}"
TEMPLATE_FILE="${TEMPLATE_FILE:-cloud-formation.yml}"
CHANGE_SET_NAME="${CHANGE_SET_NAME:-security-private-$(date +%Y%m%d%H%M%S)}"
PARAMETERS_FILE="$(mktemp)"
CHANGE_SET_FILE="$(mktemp)"

cleanup() {
  rm -f "$PARAMETERS_FILE" "$CHANGE_SET_FILE"
}
trap cleanup EXIT

echo "Region: $REGION"
echo "Stack:  $STACK_NAME"
echo "Template: $TEMPLATE_FILE"
echo "Change set: $CHANGE_SET_NAME"

if ! aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" >/dev/null; then
  echo "ERROR: no existe el stack $STACK_NAME en $REGION. Usa SETUP.sh para un primer despliegue." >&2
  exit 1
fi

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Parameters[].{ParameterKey:ParameterKey,UsePreviousValue:`true`}' \
  --output json > "$PARAMETERS_FILE"

echo "Creando Change Set para revisar el impacto antes de tocar recursos..."
if ! aws cloudformation create-change-set \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --change-set-type UPDATE \
  --template-body "file://${TEMPLATE_FILE}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters "file://${PARAMETERS_FILE}" >/dev/null; then
  echo "ERROR: no se pudo crear el Change Set." >&2
  exit 1
fi

set +e
aws cloudformation wait change-set-create-complete \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME"
WAIT_STATUS=$?
set -e

aws cloudformation describe-change-set \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" > "$CHANGE_SET_FILE"

if [ "$WAIT_STATUS" -ne 0 ]; then
  STATUS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("Status",""))' "$CHANGE_SET_FILE")"
  REASON="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("StatusReason",""))' "$CHANGE_SET_FILE")"
  if printf '%s' "$REASON" | grep -qi "didn't contain changes"; then
    echo "No hay cambios pendientes en $STACK_NAME."
    exit 0
  fi
  echo "ERROR: el Change Set quedó en estado $STATUS: $REASON" >&2
  exit 1
fi

echo ""
echo "Resumen de cambios:"
aws cloudformation describe-change-set \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' \
  --output table

python3 - "$CHANGE_SET_FILE" <<'PY'
import json
import sys

protected_ids = {
    "DbServer",
    "DbServerElasticAddress",
    "ImagesBucket",
    "ProfilePictureBucket",
}
protected_types = {
    "AWS::S3::Bucket",
}
data = json.load(open(sys.argv[1], encoding="utf-8"))
unsafe = []

for item in data.get("Changes", []):
    rc = item.get("ResourceChange", {})
    logical_id = rc.get("LogicalResourceId", "")
    resource_type = rc.get("ResourceType", "")
    action = rc.get("Action", "")
    replacement = rc.get("Replacement", "False")
    protected = logical_id in protected_ids or resource_type in protected_types
    destructive = action in {"Remove", "Import"} or replacement in {"True", "Conditional"}
    if protected and destructive:
        unsafe.append((action, logical_id, resource_type, replacement))

if unsafe:
    print("")
    print("BLOQUEADO: el Change Set quiere reemplazar o remover recursos con datos:")
    for action, logical_id, resource_type, replacement in unsafe:
        print(f"- {action} {logical_id} ({resource_type}), Replacement={replacement}")
    print("")
    print("No se ejecutó nada. Revisa el template o migra esos recursos manualmente.")
    sys.exit(2)
PY

echo ""
echo "Guardas OK: no se detectó reemplazo/remoción de DB, EIP de DB ni buckets protegidos."
echo "Nota: ALB, VPC Link, target groups o app servers pueden cambiar para cerrar la exposición pública."

if [ "${AUTO_APPROVE:-0}" != "1" ]; then
  printf 'Ejecutar este Change Set ahora? Escribe "yes" para continuar: '
  read -r ANSWER
  if [ "$ANSWER" != "yes" ]; then
    echo "Cancelado. El Change Set queda creado para revisión: $CHANGE_SET_NAME"
    exit 0
  fi
fi

aws cloudformation execute-change-set \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --change-set-name "$CHANGE_SET_NAME"

echo "Esperando a que termine la actualización..."
aws cloudformation wait stack-update-complete \
  --region "$REGION" \
  --stack-name "$STACK_NAME"

echo ""
echo "Actualización terminada. Outputs actuales:"
aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
  --output table
