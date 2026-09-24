#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
MAIN_STACK="${MAIN_STACK_NAME:-openstore-stack}"
ATHENA_STACK="${ATHENA_STACK_NAME:-openstore-athena}"
INGEST_STACK="${INGEST_STACK_NAME:-openstore-ingest}"

echo "Usando region AWS: $REGION"

VPC_ID="${VPC_ID:-$(aws cloudformation describe-stacks \
  --stack-name "$MAIN_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Parameters[?ParameterKey=='VpcId'].ParameterValue" \
  --output text)}"

if [ -z "$VPC_ID" ] || [ "$VPC_ID" = "None" ]; then
  echo "ERROR: no se pudo resolver VpcId desde $MAIN_STACK" >&2
  exit 1
fi

PUBLIC_SUBNET="${INGEST_SUBNET_ID:-${SUBNET1:-$(aws cloudformation describe-stacks \
  --stack-name "$MAIN_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Parameters[?ParameterKey=='PublicSubnet1'].ParameterValue" \
  --output text)}}"

if [ -z "$PUBLIC_SUBNET" ] || [ "$PUBLIC_SUBNET" = "None" ]; then
  echo "ERROR: no se pudo resolver PublicSubnet1 desde $MAIN_STACK" >&2
  exit 1
fi

KEY_NAME="${OPENSTORE_KEY_NAME:-${KEY_NAME:-vockey}}"

DB_HOST="$(aws cloudformation describe-stacks \
  --stack-name "$MAIN_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DbServerPrivateIP'].OutputValue" \
  --output text)"

if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "None" ]; then
  echo "ERROR: no se pudo obtener DbServerPrivateIP desde $MAIN_STACK" >&2
  exit 1
fi

INGEST_DB_SG="$(aws cloudformation describe-stacks \
  --stack-name "$MAIN_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='IngestServerSecurityGroupId'].OutputValue" \
  --output text)"

if [ -z "$INGEST_DB_SG" ] || [ "$INGEST_DB_SG" = "None" ]; then
  echo "ERROR: no se pudo obtener IngestServerSecurityGroupId desde $MAIN_STACK" >&2
  exit 1
fi

echo "DB_HOST=$DB_HOST"
echo "IngestServerSecurityGroupId=$INGEST_DB_SG"
echo "VPC_ID=$VPC_ID"
echo "PublicSubnet=$PUBLIC_SUBNET"
echo "KeyName=$KEY_NAME"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$ATHENA_STACK" \
  --template-file athena-glue.yml \
  --capabilities CAPABILITY_NAMED_IAM

INGEST_BUCKET="$(aws cloudformation describe-stacks \
  --stack-name "$ATHENA_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='IngestBucketName'].OutputValue" \
  --output text)"

aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$INGEST_STACK" \
  --template-file ingest-ec2.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AMI=ami-08d434e92c0cfa0c0 \
    KeyName="$KEY_NAME" \
    InstanceType="${INGEST_INSTANCE_TYPE:-t3.small}" \
    VpcId="$VPC_ID" \
    PublicSubnet="$PUBLIC_SUBNET" \
    DbHost="$DB_HOST" \
    IngestServerSecurityGroupId="$INGEST_DB_SG" \
    IngestBucket="$INGEST_BUCKET" \
    RepositoryUrl="${FRONTEND_REPO_URL:-https://github.com/Lazheart/MakeShop.git}" \
    RepositoryBranch="${FRONTEND_BRANCH_NAME:-main}"

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$ATHENA_STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
  --output table

aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$INGEST_STACK" \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
  --output table
