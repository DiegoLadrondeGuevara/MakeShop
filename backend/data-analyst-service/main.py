from __future__ import annotations

import os
import re
import time
from datetime import date, timedelta
from typing import Any

import boto3
import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


ATHENA_DATABASE = os.getenv("ATHENA_DATABASE", "openstore_catalog")
ATHENA_RESULTS_BUCKET = os.getenv(
    "ATHENA_RESULTS_BUCKET",
    "s3://openstore-ingest-CHANGE_ME/athena-results/",
)
ATHENA_WORKGROUP = os.getenv("ATHENA_WORKGROUP", "openstore-workgroup")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://user-service:8080").rstrip("/")
ATHENA_TIMEOUT_SECONDS = int(os.getenv("ATHENA_TIMEOUT_SECONDS", "90"))

_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$")

app = FastAPI(
    title="MakeShop Data Analyst Service",
    description=(
        "Microservicio analitico sin base de datos propia. Resuelve el owner autenticado "
        "y consulta el catalogo Glue/Athena sobre los datos almacenados en S3."
    ),
    version="1.0.0",
    openapi_tags=[
        {"name": "Salud", "description": "Estado del microservicio y de su configuracion."},
        {"name": "Analytics", "description": "Metricas aisladas por owner con filtros dinamicos."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sql_string(value: str) -> str:
    if not _SAFE_ID.fullmatch(value):
        raise HTTPException(status_code=400, detail="Identificador no valido")
    return "'" + value.replace("'", "''") + "'"


def _period(from_date: date | None, to_date: date | None) -> tuple[date, date, date, date]:
    end = to_date or date.today()
    start = from_date or (end - timedelta(days=29))
    if start > end:
        raise HTTPException(status_code=400, detail="from debe ser menor o igual que to")
    days = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return start, end, previous_start, previous_end


def _date_literal(value: date) -> str:
    return f"DATE '{value.isoformat()}'"


def _created_date(alias: str = "u") -> str:
    """Parse Glue CSV timestamps whether Athena inferred string or timestamp."""
    field = f"{alias}.created_at"
    return (
        f"COALESCE(TRY_CAST({field} AS DATE), "
        f"TRY_CAST(substr(CAST({field} AS VARCHAR), 1, 10) AS DATE))"
    )


def _athena_client():
    return boto3.client("athena", region_name=AWS_REGION)


def _run_athena_query(sql: str) -> list[dict[str, str]]:
    client = _athena_client()
    response = client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": ATHENA_DATABASE},
        ResultConfiguration={"OutputLocation": ATHENA_RESULTS_BUCKET},
        WorkGroup=ATHENA_WORKGROUP,
    )
    execution_id = response["QueryExecutionId"]

    for _ in range(ATHENA_TIMEOUT_SECONDS):
        status = client.get_query_execution(QueryExecutionId=execution_id)
        state = status["QueryExecution"]["Status"]["State"]
        if state == "SUCCEEDED":
            break
        if state in {"FAILED", "CANCELLED"}:
            reason = status["QueryExecution"]["Status"].get("StateChangeReason", "")
            raise HTTPException(status_code=502, detail=f"Athena no pudo ejecutar la consulta: {reason}")
        time.sleep(1)
    else:
        raise HTTPException(status_code=504, detail="Athena tardo demasiado en responder")

    headers: list[str] | None = None
    rows: list[dict[str, str]] = []
    next_token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"QueryExecutionId": execution_id}
        if next_token:
            kwargs["NextToken"] = next_token
        result = client.get_query_results(**kwargs)
        raw_rows = result.get("ResultSet", {}).get("Rows", [])
        if headers is None and raw_rows:
            headers = [cell.get("VarCharValue", "") for cell in raw_rows[0].get("Data", [])]
            raw_rows = raw_rows[1:]
        if headers:
            for raw_row in raw_rows:
                values = [cell.get("VarCharValue", "") for cell in raw_row.get("Data", [])]
                values.extend([""] * (len(headers) - len(values)))
                rows.append(dict(zip(headers, values)))
        next_token = result.get("NextToken")
        if not next_token:
            return rows


def _owner_context(user: dict[str, Any]) -> str:
    # La identidad efectiva siempre viene del token; nunca del query string.
    return _sql_string(str(user["id"]))


def _shop_filter(shop_id: str | None, alias: str = "s") -> str:
    return f" AND {alias}.id = {_sql_string(shop_id)}" if shop_id else ""


def _summary_query(owner_id: str, start: date, end: date, previous_start: date, previous_end: date, shop_id: str | None) -> str:
    created_date = _created_date()
    return f"""
WITH owner_shops AS (
    SELECT id, name FROM shops_csv s WHERE s.owner_id = {owner_id}{_shop_filter(shop_id)}
),
product_metrics AS (
    SELECT COUNT(DISTINCT p.id) AS total_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.availability, '')) = 'AVAILABLE' THEN p.id END) AS available_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.availability, '')) <> 'AVAILABLE' THEN p.id END) AS out_of_stock_products,
           COALESCE(AVG(TRY_CAST(p.price AS DOUBLE)), 0) AS average_price
    FROM products p JOIN owner_shops s ON p.shop_id = s.id
),
user_metrics AS (
    SELECT COUNT(DISTINCT u.id) AS total_users,
           COUNT(DISTINCT CASE WHEN {created_date} BETWEEN {_date_literal(start)} AND {_date_literal(end)} THEN u.id END) AS registered_in_period,
           COUNT(DISTINCT CASE WHEN {created_date} BETWEEN {_date_literal(previous_start)} AND {_date_literal(previous_end)} THEN u.id END) AS registered_in_previous_period
    FROM users u JOIN owner_shops s ON u.shop_id = s.id
    WHERE UPPER(COALESCE(u.role, '')) <> 'OWNER'
),
membership_metrics AS (
    SELECT COUNT(DISTINCT m.id) AS total_memberships
    FROM memberships_csv m JOIN owner_shops s ON m.shop_id = s.id
)
SELECT
    (SELECT COUNT(*) FROM owner_shops) AS total_shops,
    p.total_products, p.available_products, p.out_of_stock_products, p.average_price,
    u.total_users, u.registered_in_period, u.registered_in_previous_period,
    m.total_memberships
FROM product_metrics p CROSS JOIN user_metrics u CROSS JOIN membership_metrics m
"""


def _shops_query(owner_id: str, start: date, end: date, previous_start: date, previous_end: date, shop_id: str | None) -> str:
    created_date = _created_date()
    return f"""
WITH owner_shops AS (
    SELECT s.id, s.name, s.phone_number
    FROM shops_csv s
    WHERE s.owner_id = {owner_id}{_shop_filter(shop_id)}
),
product_metrics AS (
    SELECT p.shop_id,
           COUNT(DISTINCT p.id) AS total_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.availability, '')) = 'AVAILABLE' THEN p.id END) AS available_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(p.availability, '')) <> 'AVAILABLE' THEN p.id END) AS out_of_stock_products,
           COALESCE(AVG(TRY_CAST(p.price AS DOUBLE)), 0) AS average_price
    FROM products p GROUP BY p.shop_id
),
user_metrics AS (
    SELECT u.shop_id,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(u.role, '')) <> 'OWNER' THEN u.id END) AS total_users,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(u.role, '')) <> 'OWNER' AND {created_date} BETWEEN {_date_literal(start)} AND {_date_literal(end)} THEN u.id END) AS registered_in_period,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(u.role, '')) <> 'OWNER' AND {created_date} BETWEEN {_date_literal(previous_start)} AND {_date_literal(previous_end)} THEN u.id END) AS registered_in_previous_period
    FROM users u GROUP BY u.shop_id
),
membership_metrics AS (
    SELECT m.shop_id, COUNT(DISTINCT m.id) AS total_memberships
    FROM memberships_csv m GROUP BY m.shop_id
)
SELECT s.id AS shop_id, s.name AS shop_name, s.phone_number,
       COALESCE(p.total_products, 0) AS total_products,
       COALESCE(p.available_products, 0) AS available_products,
       COALESCE(p.out_of_stock_products, 0) AS out_of_stock_products,
       COALESCE(p.average_price, 0) AS average_price,
       COALESCE(u.total_users, 0) AS total_users,
       COALESCE(u.registered_in_period, 0) AS registered_in_period,
       COALESCE(u.registered_in_previous_period, 0) AS registered_in_previous_period,
       COALESCE(m.total_memberships, 0) AS total_memberships
FROM owner_shops s
LEFT JOIN product_metrics p ON p.shop_id = s.id
LEFT JOIN user_metrics u ON u.shop_id = s.id
LEFT JOIN membership_metrics m ON m.shop_id = s.id
ORDER BY total_products DESC, shop_name
"""


def _trend_query(owner_id: str, start: date, end: date, shop_id: str | None) -> str:
    created_date = _created_date()
    period_days = (end - start).days + 1
    bucket = (
        f"date_trunc('month', {created_date})" if period_days > 180
        else f"date_trunc('week', {created_date})" if period_days > 45
        else created_date
    )
    return f"""
WITH owner_shops AS (
    SELECT id FROM shops_csv s WHERE s.owner_id = {owner_id}{_shop_filter(shop_id)}
), trend_buckets AS (
    SELECT {bucket} AS period,
           COUNT(DISTINCT u.id) AS registered_users
    FROM users u JOIN owner_shops s ON u.shop_id = s.id
    WHERE UPPER(COALESCE(u.role, '')) <> 'OWNER'
      AND {created_date} BETWEEN {_date_literal(start)} AND {_date_literal(end)}
    GROUP BY {bucket}
)
SELECT CAST(period AS VARCHAR) AS period, registered_users
FROM trend_buckets
ORDER BY period
"""


def _products_query(owner_id: str, shop_id: str | None, limit: int) -> str:
    safe_limit = max(1, min(limit, 200))
    return f"""
WITH owner_shops AS (
    SELECT id, name FROM shops_csv s WHERE s.owner_id = {owner_id}{_shop_filter(shop_id)}
)
SELECT s.id AS shop_id, s.name AS shop_name, p.id AS product_id,
       p.name AS product_name, TRY_CAST(p.price AS DOUBLE) AS price,
       p.availability, p.image_url
FROM products p JOIN owner_shops s ON p.shop_id = s.id
ORDER BY price DESC, product_name
LIMIT {safe_limit}
"""


def _health_query(owner_id: str, shop_id: str | None) -> str:
    return f"""
WITH owner_shops AS (
    SELECT id FROM shops_csv s WHERE s.owner_id = {owner_id}{_shop_filter(shop_id)}
),
owner_products AS (
    SELECT p.* FROM products p JOIN owner_shops s ON p.shop_id = s.id
),
owner_users AS (
    SELECT u.* FROM users u JOIN owner_shops s ON u.shop_id = s.id
)
SELECT
    (SELECT COUNT(*) FROM owner_shops) AS total_shops,
    (SELECT COUNT(*) FROM owner_products) AS total_products,
    (SELECT COUNT(*) FROM owner_users WHERE UPPER(COALESCE(role, '')) <> 'OWNER') AS total_users,
    (SELECT COUNT(*) FROM owner_products WHERE price IS NULL OR TRIM(CAST(price AS VARCHAR)) = '') AS products_without_price,
    (SELECT COUNT(*) FROM owner_products WHERE availability IS NULL OR TRIM(CAST(availability AS VARCHAR)) = '') AS products_without_availability,
    (SELECT COUNT(*) FROM owner_products WHERE shop_id IS NULL OR TRIM(CAST(shop_id AS VARCHAR)) = '') AS products_without_shop
"""


def _payload(rows: list[dict[str, str]], filters: dict[str, Any]) -> dict[str, Any]:
    return {"filters": filters, "data": rows}


@app.get("/", tags=["Salud"])
def root() -> dict[str, str]:
    return {"service": "data-analyst-service", "status": "ok"}


@app.get("/health", tags=["Salud"])
def health() -> dict[str, str]:
    return {"service": "data-analyst-service", "status": "ok", "database": "none", "source": "athena"}


@app.get("/analytics/owner/summary", tags=["Analytics"])
def owner_summary(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    shop_id: str | None = Query(default=None, alias="shopId"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _current_user_sync(authorization)
    start, end, previous_start, previous_end = _period(from_date, to_date)
    rows = _run_athena_query(_summary_query(_owner_context(user), start, end, previous_start, previous_end, shop_id))
    return _payload(rows, _filter_payload(start, end, previous_start, previous_end, shop_id))


@app.get("/analytics/owner/shops", tags=["Analytics"])
def owner_shops(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    shop_id: str | None = Query(default=None, alias="shopId"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _current_user_sync(authorization)
    start, end, previous_start, previous_end = _period(from_date, to_date)
    rows = _run_athena_query(_shops_query(_owner_context(user), start, end, previous_start, previous_end, shop_id))
    return _payload(rows, _filter_payload(start, end, previous_start, previous_end, shop_id))


@app.get("/analytics/owner/trend", tags=["Analytics"])
def owner_trend(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    shop_id: str | None = Query(default=None, alias="shopId"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _current_user_sync(authorization)
    start, end, previous_start, previous_end = _period(from_date, to_date)
    rows = _run_athena_query(_trend_query(_owner_context(user), start, end, shop_id))
    return _payload(rows, _filter_payload(start, end, previous_start, previous_end, shop_id))


@app.get("/analytics/owner/products", tags=["Analytics"])
def owner_products(
    shop_id: str | None = Query(default=None, alias="shopId"),
    limit: int = Query(default=50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _current_user_sync(authorization)
    rows = _run_athena_query(_products_query(_owner_context(user), shop_id, limit))
    return _payload(rows, {"shopId": shop_id, "limit": limit})


@app.get("/analytics/owner/catalog-health", tags=["Analytics"])
def owner_catalog_health(
    shop_id: str | None = Query(default=None, alias="shopId"),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    user = _current_user_sync(authorization)
    rows = _run_athena_query(_health_query(_owner_context(user), shop_id))
    return _payload(rows, {"shopId": shop_id})


def _filter_payload(start: date, end: date, previous_start: date, previous_end: date, shop_id: str | None) -> dict[str, Any]:
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "previousFrom": previous_start.isoformat(),
        "previousTo": previous_end.isoformat(),
        "shopId": shop_id,
    }


def _current_user_sync(authorization: str | None) -> dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")
    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(f"{USER_SERVICE_URL}/me", headers={"Authorization": authorization})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="No se pudo validar el usuario autenticado") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail="Token invalido o expirado")
    payload = response.json()
    if not isinstance(payload, dict) or payload.get("id") is None:
        raise HTTPException(status_code=401, detail="Respuesta de autenticacion invalida")
    return payload
