from typing import Any
import os

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from mapping import (
	AuthLoginRequest,
	AuthRegisterRequest,
	ShopCreateRequest,
	ShopUpdateRequest,
	ThemeUpdateRequest,
	UpdateMeRequest,
	UpdateSubscriptionRequest,
	VerifyPasswordRequest,
	build_register_payload,
	build_shop_create_payload,
	build_shop_update_payload,
	resolved_shop_id,
)
from services_paths import (
	shop_create_url,
	shop_get_by_id_url,
	shop_get_by_name_url,
	product_delete_url,
	product_purge_by_shop_url,
	shop_internal_delete_url,
	shop_update_url,
	shop_theme_url,
	user_me_url,
	user_me_update_subscription_url,
	user_verify_url,
	user_get_by_id_url,
	user_update_subscription_url,
	user_auth_login_url,
	user_auth_register_url,
	owner_shops_url,
	shop_list_url,
	shop_list_by_owner_url,
	user_list_by_shop_ids_url,
	user_list_by_shop_url,
	product_list_by_shop_url,
	product_create_url,
	product_update_url,
	data_analyst_url,
)

_OPENAPI_TAGS_METADATA = [
	{"name": "Salud", "description": "Comprobaciones de vida del servicio."},
	{"name": "Analytics", "description": "Consultas analíticas sobre el Data Lake en AWS Athena."},
	{
		"name": "Auth",
		"description": (
			"Autenticación centralizada: según `shopId` en el cuerpo se enruta a "
			"OWNER (`/api/auth/...`) o a usuario de tienda (`/api/auth/{shopId}/...`). "
			"Incluye gestión de perfiles y suscripciones."
		),
	},
	{"name": "Tiendas", "description": "Creación, lectura y actualización de tiendas vía shop-service."},
	{
		"name": "Productos",
		"description": "Eliminación orquestada; delega en product-service.",
	},
	{"name": "Utilidades", "description": "Resolución owner/tienda y meta documentación."},
]

app = FastAPI(
	title="OpenStore Store Service",
	description=(
		"**Orquestador del frontend**: un único punto de entrada HTTP que enruta hacia "
		"user-service, shop-service y product-service; coordina "
		"operaciones que delegan en otros servicios de forma secuencial.\n\n"
		"- **Registro/login**: sin `shopId` se asume rol **OWNER**; con `shopId`, usuario de esa tienda.\n"
		"- **Swagger del gateway**: ruta `/docs`. Enlaces a la documentación de cada microservicio: `/docs/mappings`."
	),
	version="1.0.0",
	openapi_tags=_OPENAPI_TAGS_METADATA,
	docs_url="/docs",
	redoc_url="/redoc",
	openapi_url="/openapi.json",
)

app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

# Templates folder (relative to store-service/)
templates = Jinja2Templates(directory="templates")


def _build_auth_headers(authorization: str | None = None) -> dict[str, str]:
	headers: dict[str, str] = {"Content-Type": "application/json"}
	if authorization:
		headers["Authorization"] = authorization
	return headers


async def _forward(
	method: str,
	url: str,
	payload: dict[str, Any] | None = None,
	authorization: str | None = None,
) -> Any:
	try:
		async with httpx.AsyncClient() as client:
			response = await client.request(
				method=method,
				url=url,
				headers=_build_auth_headers(authorization),
				json=payload,
			)
	except httpx.RequestError as exc:
		raise HTTPException(status_code=502, detail=f"Error de conexion con servicio externo: {exc}") from exc

	if response.status_code >= 400:
		try:
			detail = response.json()
		except ValueError:
			detail = {"error": response.text}
		raise HTTPException(status_code=response.status_code, detail=detail)

	if not response.text:
		return None

	try:
		return response.json()
	except ValueError:
		return {"message": response.text}


async def _resolve_current_user(authorization: str | None) -> dict[str, Any]:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	user = await _forward("GET", user_me_url(), authorization=authorization)
	if not isinstance(user, dict) or user.get("id") is None:
		raise HTTPException(status_code=400, detail="No se pudo obtener el usuario autenticado")

	return user


@app.get("/", tags=["Salud"])
def root() -> dict[str, str]:
	return {"service": "store-service", "role": "orchestrator", "status": "ok"}


@app.get("/health", tags=["Salud"])
def health() -> dict[str, str]:
	return {"status": "ok"}


@app.get(
	"/me",
	tags=["Auth"],
	summary="Perfil del usuario actual",
	description="Obtiene el ID del usuario (`GET /me`) y luego consulta sus detalles completos (`GET /users/{id}`).",
)
async def me(authorization: str | None = Header(default=None)) -> Any:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	me_response = await _forward("GET", user_me_url(), authorization=authorization)
	if not isinstance(me_response, dict) or me_response.get("id") is None:
		return me_response

	user_id = me_response["id"]
	user_details = await _forward("GET", user_get_by_id_url(user_id), authorization=authorization)

	if not isinstance(user_details, dict):
		return user_details

	result = {
		"id": user_details.get("id"),
		"name": user_details.get("name"),
		"email": user_details.get("email"),
		"phoneNumber": user_details.get("phoneNumber"),
		"role": user_details.get("role", me_response.get("role")),
	}

	subscription = user_details.get("subscription") or me_response.get("subscriptions")
	if subscription:
		result["subscription"] = subscription

	shop_id = user_details.get("shopId")
	if shop_id:
		result["shopId"] = shop_id

	return result


@app.post(
	"/verify",
	tags=["Auth"],
	summary="Verificar contraseña",
	description="Proxy a user-service para validar la contraseña actual y generar un código temporal.",
)
async def verify_password(payload: VerifyPasswordRequest, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("POST", user_verify_url(), payload=payload.model_dump(), authorization=authorization)


@app.patch(
	"/me",
	tags=["Auth"],
	summary="Actualizar perfil",
	description="Proxy a user-service para actualizar el perfil usando el código temporal generado por /verify.",
)
async def update_me(payload: UpdateMeRequest, authorization: str | None = Header(default=None)) -> Any:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	body = payload.model_dump(exclude_none=True)
	return await _forward("PATCH", user_me_url(), payload=body, authorization=authorization)


@app.patch(
	"/user/me/subscription",
	tags=["Auth"],
	summary="Actualizar su propia suscripción",
	description="Usuario actualiza su propio plan de suscripción.",
)
async def update_my_subscription(payload: UpdateSubscriptionRequest, authorization: str | None = Header(default=None)) -> Any:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	body = payload.model_dump()
	return await _forward("PATCH", user_me_update_subscription_url(), payload=body, authorization=authorization)


@app.patch(
	"/user/{user_id}/subscription",
	tags=["Auth"],
	summary="Actualizar suscripción de un usuario",
	description="Admin u Owner actualiza el plan de suscripción de un usuario específico. Requiere token de autorización.",
)
async def update_user_subscription(
	user_id: str,
	payload: UpdateSubscriptionRequest,
	authorization: str | None = Header(default=None),
) -> Any:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	body = payload.model_dump()
	return await _forward("PATCH", user_update_subscription_url(user_id), payload=body, authorization=authorization)


@app.post(
	"/auth/login",
	tags=["Auth"],
	summary="Inicio de sesión",
	description=(
		"Sin `shopId`: login OWNER. Con `shopId`: login como usuario de esa tienda. "
		"El cuerpo se reenvía al user-service."
	),
)
async def auth_login(payload: AuthLoginRequest) -> Any:
	target_url = user_auth_login_url(resolved_shop_id(payload.shopId))
	body = {
		"identifier": payload.identifier,
		"password": payload.password,
	}
	return await _forward("POST", target_url, payload=body)


@app.post(
	"/auth/register",
	tags=["Auth"],
	summary="Registro",
	description=(
		"Sin `shopId` se enruta a registro **OWNER**. Con `shopId`, a registro de usuario de tienda. "
		"Los campos del cuerpo se adaptan al DTO esperado por user-service."
	),
)
async def auth_register(payload: AuthRegisterRequest) -> Any:
	target_url = user_auth_register_url(resolved_shop_id(payload.shopId))
	body = build_register_payload(payload)
	return await _forward("POST", target_url, payload=body)


@app.post(
	"/openshop/shop",
	status_code=201,
	tags=["Tiendas"],
	summary="Crear tienda",
	description="Proxy a shop-service; validación de rol/plan en el origen.",
)
async def create_shop(payload: ShopCreateRequest, authorization: str | None = Header(default=None)) -> Any:
	# Shop-service aplica las reglas de rol, plan y unicidad del nombre.
	resp = await _forward(
		"POST",
		shop_create_url(),
		payload=build_shop_create_payload(payload),
		authorization=authorization,
	)
	# Normalizar respuesta: devolver sólo el shopId cuando la tienda se creó correctamente.
	if isinstance(resp, dict):
		shop_id = resp.get("shopId") or resp.get("id") or resp.get("shop_id")
		if shop_id:
			return {"shopId": str(shop_id)}
	# Si no hay id en la respuesta, devolver la respuesta completa para facilitar debug.
	return resp


@app.get("/shop/name/{shop_name}", tags=["Tiendas"])
async def get_shop_by_name(shop_name: str) -> Any:
	return await _forward("GET", shop_get_by_name_url(shop_name))


@app.patch("/shop/id/{shop_id}", tags=["Tiendas"])
async def update_shop(
	shop_id: str,
	payload: ShopUpdateRequest,
	authorization: str | None = Header(default=None),
) -> Any:
	return await _forward(
		"PATCH",
		shop_update_url(shop_id),
		payload=build_shop_update_payload(payload),
		authorization=authorization,
	)


@app.delete(
	"/shop/id/{shop_id}",
	tags=["Tiendas"],
	summary="Solicitar borrado de tienda",
	description="Verifica ownership y borra productos y tienda mediante llamadas HTTP síncronas.",
)
async def delete_shop(shop_id: str, authorization: str | None = Header(default=None)) -> Any:
	user = await _resolve_current_user(authorization)
	shop = await _forward("GET", shop_get_by_id_url(shop_id))

	if not isinstance(shop, dict) or shop.get("ownerId") is None:
		raise HTTPException(status_code=404, detail="Tienda no encontrada")

	shop_owner_id_raw = shop.get("ownerId")
	user_id_raw = user.get("id")
	try:
		shop_owner_id = str(shop_owner_id_raw)
		user_id = str(user_id_raw)
	except ValueError as exc:
		raise HTTPException(status_code=400, detail="No se pudo validar ownership de la tienda") from exc

	if shop_owner_id != user_id:
		raise HTTPException(status_code=403, detail="No puedes eliminar una tienda que no te pertenece")

	headers = {"Content-Type": "application/json"}
	async with httpx.AsyncClient() as client:
		purge_response = await client.delete(product_purge_by_shop_url(shop_id), headers=headers)
		if purge_response.status_code not in {200, 404}:
			raise HTTPException(
				status_code=purge_response.status_code,
				detail=f"No se pudieron purgar productos de la tienda {shop_id}",
			)

		delete_response = await client.delete(shop_internal_delete_url(shop_id), headers=headers)
		if delete_response.status_code not in {200, 404}:
			raise HTTPException(
				status_code=delete_response.status_code,
				detail=f"No se pudo eliminar la tienda {shop_id}",
			)

	return {"status": "accepted", "shopId": shop_id}


@app.get("/shops", tags=["Tiendas"])
async def get_shops(page: int = 1, limit: int = 10, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", shop_list_url(page, limit), authorization=authorization)


@app.get("/shops/{shop_id}", tags=["Tiendas"])
async def get_shop(shop_id: str, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", shop_get_by_id_url(shop_id), authorization=authorization)


@app.get(
	"/shop/{shop_id}/theme",
	tags=["Tiendas"],
	summary="Obtener tema del storefront",
	description="Proxy a shop-service: obtiene themeKey y config (colores, headerName, hero) de una tienda.",
)
async def get_shop_theme(shop_id: str, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", shop_theme_url(shop_id), authorization=authorization)


@app.put(
	"/shop/{shop_id}/theme",
	tags=["Tiendas"],
	summary="Actualizar tema del storefront",
	description="Proxy a shop-service: actualiza themeKey y config (colores, headerName, hero) de una tienda.",
)
async def update_shop_theme(
	shop_id: str,
	payload: ThemeUpdateRequest,
	authorization: str | None = Header(default=None),
) -> Any:
	return await _forward(
		"PUT",
		shop_theme_url(shop_id),
		payload=payload.model_dump(exclude_none=True),
		authorization=authorization,
	)


@app.get(
	"/shop/{shop_id}",
	tags=["Tiendas"],
	summary="Obtener tienda por ID (ruta pública)",
	description="Proxy a shop-service: obtiene los datos de una tienda por su ID. Usado por el storefront público.",
)
async def get_shop_by_id(shop_id: str, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", shop_get_by_id_url(shop_id), authorization=authorization)


@app.get("/shops/{shop_id}/products", tags=["Productos"])
async def get_products_by_shop(shop_id: str, authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", product_list_by_shop_url(shop_id), authorization=authorization)


@app.post("/shops/{shop_id}/products", status_code=201, tags=["Productos"])
async def create_product_route(shop_id: str, request: Request, authorization: str | None = Header(default=None)) -> Any:
	body = await request.body()
	headers = {}
	if authorization:
		headers["Authorization"] = authorization
	content_type = request.headers.get("content-type")
	if content_type:
		headers["Content-Type"] = content_type

	try:
		async with httpx.AsyncClient() as client:
			response = await client.request(
				method="POST",
				url=product_create_url(shop_id),
				headers=headers,
				content=body,
			)
	except httpx.RequestError as exc:
		raise HTTPException(status_code=502, detail=f"Error de conexion con servicio externo: {exc}") from exc

	if response.status_code >= 400:
		try:
			detail = response.json()
		except ValueError:
			detail = {"error": response.text}
		raise HTTPException(status_code=response.status_code, detail=detail)

	if not response.text:
		return None

	try:
		return response.json()
	except ValueError:
		return {"message": response.text}


@app.patch("/shops/{shop_id}/products/{product_id}", tags=["Productos"])
async def update_product_route(shop_id: str, product_id: str, request: Request, authorization: str | None = Header(default=None)) -> Any:
	body = await request.body()
	headers = {}
	if authorization:
		headers["Authorization"] = authorization
	content_type = request.headers.get("content-type")
	if content_type:
		headers["Content-Type"] = content_type

	try:
		async with httpx.AsyncClient() as client:
			response = await client.request(
				method="PATCH",
				url=product_update_url(shop_id, product_id),
				headers=headers,
				content=body,
			)
	except httpx.RequestError as exc:
		raise HTTPException(status_code=502, detail=f"Error de conexion con servicio externo: {exc}") from exc

	if response.status_code >= 400:
		try:
			detail = response.json()
		except ValueError:
			detail = {"error": response.text}
		raise HTTPException(status_code=response.status_code, detail=detail)

	if not response.text:
		return None

	try:
		return response.json()
	except ValueError:
		return {"message": response.text}


@app.delete(
	"/shops/{shop_id}/products/{product_id}",
	status_code=204,
	tags=["Productos"],
	summary="Eliminar producto",
	description="Solo necesitas `shop_id` y `product_id` en la ruta y el token Bearer.",
)
async def delete_product(shop_id: str, product_id: str, authorization: str | None = Header(default=None)) -> None:
	if not authorization:
		raise HTTPException(status_code=401, detail="Acceso denegado. Token no proporcionado.")

	await _forward("DELETE", product_delete_url(shop_id, product_id), authorization=authorization)


@app.get("/shop/id/{shop_id}/owner", tags=["Utilidades"])
async def get_owner_by_shop_id(shop_id: str) -> dict[str, str]:
	shop_data = await _forward("GET", shop_get_by_id_url(shop_id))

	owner_id = shop_data.get("ownerId") if isinstance(shop_data, dict) else None
	if owner_id is None:
		raise HTTPException(status_code=404, detail="No se pudo resolver ownerId para la tienda")

	return {"shopId": shop_id, "ownerId": str(owner_id)}


@app.get("/owners/{owner_id}/clients", tags=["Utilidades"], summary="Clientes de un owner")
async def get_owner_clients(
	owner_id: str,
	page: int = 0,
	size: int = 20,
	shopId: str | None = None,
	authorization: str | None = Header(default=None),
) -> dict[str, object]:
	current_user = await _resolve_current_user(authorization)
	current_user_id = str(current_user.get("id", ""))
	current_user_role = str(current_user.get("role", "")).upper()
	if current_user_role != "ADMIN" and current_user_id != owner_id:
		raise HTTPException(status_code=403, detail="No puedes consultar clientes de otro owner")

	shops = await _forward("GET", shop_list_by_owner_url(owner_id), authorization=authorization)
	if not isinstance(shops, list):
		raise HTTPException(status_code=502, detail="No se pudieron obtener las tiendas del owner")

	shop_names_by_id: dict[str, str] = {}
	shop_ids: list[str] = []
	for shop in shops:
		if not isinstance(shop, dict):
			continue
		shop_id = shop.get("shopId") or shop.get("id") or shop.get("shop_id")
		if shop_id is None:
			continue
		shop_id_str = str(shop_id)
		shop_ids.append(shop_id_str)
		shop_names_by_id[shop_id_str] = str(shop.get("shopName") or shop.get("name") or "")

	if shopId:
		if shopId not in shop_names_by_id:
			raise HTTPException(status_code=404, detail="La tienda no pertenece a este owner")
		shop_ids = [shopId]

	safe_page = max(page, 0)
	safe_size = min(max(size, 1), 100)
	if not shop_ids:
		return {"data": [], "meta": {"page": safe_page, "size": safe_size, "total": 0, "totalPages": 0}}

	users_page = await _forward(
		"GET",
		user_list_by_shop_ids_url(shop_ids, page=safe_page, size=safe_size),
		authorization=authorization,
	)
	if not isinstance(users_page, dict):
		raise HTTPException(status_code=502, detail="No se pudo obtener el listado de clientes")

	raw_clients = users_page.get("data") or []
	if not isinstance(raw_clients, list):
		raw_clients = []

	clients: list[dict[str, object]] = []
	for user in raw_clients:
		if not isinstance(user, dict):
			continue
		shop_id = user.get("shopId") or user.get("shop_id")
		shop_id_str = str(shop_id) if shop_id is not None else None
		clients.append(
			{
				"id": str(user.get("id") or ""),
				"username": user.get("name") or user.get("username") or "",
				"email": user.get("email") or "",
				"phone": user.get("phoneNumber") or user.get("phone") or "",
				"shopId": shop_id_str,
				"shopName": shop_names_by_id.get(shop_id_str or "", ""),
			}
		)

	meta = users_page.get("meta")
	if not isinstance(meta, dict):
		meta = {
			"page": safe_page,
			"size": safe_size,
			"total": len(clients),
			"totalPages": 1 if clients else 0,
		}

	return {"data": clients, "meta": meta}


@app.get("/owners/{owner_id}/shops", tags=["Utilidades"], summary="Tiendas de un owner")
async def get_owner_shops(
	owner_id: str,
	authorization: str | None = Header(default=None),
) -> list[dict[str, object]]:
	current_user = await _resolve_current_user(authorization)
	current_user_id = str(current_user.get("id", ""))
	current_user_role = str(current_user.get("role", "")).upper()
	if current_user_role != "ADMIN" and current_user_id != owner_id:
		raise HTTPException(status_code=403, detail="No puedes consultar tiendas de otro owner")

	shops = await _forward("GET", owner_shops_url(owner_id), authorization=authorization)
	if not isinstance(shops, list):
		raise HTTPException(status_code=502, detail="No se pudieron obtener las tiendas del owner")

	result: list[dict[str, object]] = []
	for shop in shops:
		if not isinstance(shop, dict):
			continue
		result.append(
			{
				"id": str(shop.get("shopId") or shop.get("id") or shop.get("shop_id") or ""),
				"name": str(shop.get("shopName") or shop.get("name") or ""),
				"ownerId": owner_id,
				"phone": str(shop.get("phoneNumber") or shop.get("phone") or ""),
			}
		)

	return result


@app.get("/analytics/owner/summary", tags=["Analytics"], summary="Resumen analitico del owner")
async def analytics_owner_summary(
	from_date: str | None = Query(default=None, alias="from"),
	to_date: str | None = Query(default=None, alias="to"),
	shop_id: str | None = Query(default=None, alias="shopId"),
	authorization: str | None = Header(default=None),
) -> Any:
	path = _analytics_query_path("/analytics/owner/summary", from_date, to_date, shop_id)
	return await _forward(
		"GET",
		data_analyst_url(path),
		authorization=authorization,
	)


def _analytics_query_path(path: str, from_date: str | None, to_date: str | None, shop_id: str | None) -> str:
	from urllib.parse import urlencode

	params = [("from", from_date), ("to", to_date), ("shopId", shop_id)]
	query = urlencode([(key, value) for key, value in params if value])
	return f"{path}?{query}" if query else path


@app.get("/analytics/owner/shops", tags=["Analytics"], summary="Metricas por tienda del owner")
async def analytics_owner_shops(
	from_date: str | None = Query(default=None, alias="from"),
	to_date: str | None = Query(default=None, alias="to"),
	shop_id: str | None = Query(default=None, alias="shopId"),
	authorization: str | None = Header(default=None),
) -> Any:
	path = _analytics_query_path("/analytics/owner/shops", from_date, to_date, shop_id)
	return await _forward("GET", data_analyst_url(path), authorization=authorization)


@app.get("/analytics/owner/trend", tags=["Analytics"], summary="Tendencia de registros del owner")
async def analytics_owner_trend(
	from_date: str | None = Query(default=None, alias="from"),
	to_date: str | None = Query(default=None, alias="to"),
	shop_id: str | None = Query(default=None, alias="shopId"),
	authorization: str | None = Header(default=None),
) -> Any:
	path = _analytics_query_path("/analytics/owner/trend", from_date, to_date, shop_id)
	return await _forward("GET", data_analyst_url(path), authorization=authorization)


@app.get("/analytics/owner/products", tags=["Analytics"], summary="Productos del owner")
async def analytics_owner_products(
	shop_id: str | None = Query(default=None, alias="shopId"),
	limit: int = Query(default=50, ge=1, le=200),
	authorization: str | None = Header(default=None),
) -> Any:
	path = _analytics_query_path("/analytics/owner/products", None, None, shop_id)
	separator = "&" if "?" in path else "?"
	path = f"{path}{separator}limit={max(1, min(limit, 200))}"
	return await _forward("GET", data_analyst_url(path), authorization=authorization)


@app.get("/analytics/owner/catalog-health", tags=["Analytics"], summary="Calidad del catalogo del owner")
async def analytics_owner_catalog_health(
	shop_id: str | None = Query(default=None, alias="shopId"),
	authorization: str | None = Header(default=None),
) -> Any:
	path = _analytics_query_path("/analytics/owner/catalog-health", None, None, shop_id)
	return await _forward("GET", data_analyst_url(path), authorization=authorization)


# Rutas antiguas conservadas por compatibilidad. Ya no ejecutan SQL directamente
# en el gateway ni exponen datos globales sin validar el owner.
@app.get("/analytics/productos-por-tienda", tags=["Analytics"], include_in_schema=False)
async def legacy_analytics_productos(authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", data_analyst_url("/analytics/owner/shops"), authorization=authorization)


@app.get("/analytics/usuarios-por-tienda", tags=["Analytics"], include_in_schema=False)
async def legacy_analytics_usuarios(authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", data_analyst_url("/analytics/owner/shops"), authorization=authorization)


@app.get("/analytics/membresias-por-tienda", tags=["Analytics"], include_in_schema=False)
async def legacy_analytics_membresias(authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", data_analyst_url("/analytics/owner/shops"), authorization=authorization)


@app.get("/analytics/resumen-tiendas", tags=["Analytics"], include_in_schema=False)
async def legacy_analytics_summary(authorization: str | None = Header(default=None)) -> Any:
	return await _forward("GET", data_analyst_url("/analytics/owner/shops"), authorization=authorization)


@app.get("/docs/mappings", response_class=HTMLResponse, tags=["Utilidades"], include_in_schema=False)
async def docs_mappings(request: Request) -> HTMLResponse:
	"""Página HTML con enlaces a la documentación OpenAPI/Swagger de cada microservicio."""
	from services_paths import DATA_ANALYST_SERVICE_URL, SHOP_SERVICE_URL, PRODUCT_SERVICE_URL, USER_SERVICE_URL

	store_public_url = str(request.base_url).rstrip("/")
	services = [
		{
			"name": "Store Service (este orquestador)",
			"url": f"{store_public_url}/docs",
			"note": "Swagger del gateway; el contrato que debe usar el frontend.",
		},
		{"name": "Shop Service", "url": f"{SHOP_SERVICE_URL}/docs", "note": "Swagger interno de tiendas"},
		{"name": "Product Service", "url": f"{PRODUCT_SERVICE_URL}/docs", "note": "API interna de productos"},
		{
			"name": "User Service",
			"url": f"{USER_SERVICE_URL}/docs",
			"note": "Usuarios y auth (Spring)",
		},
		{
			"name": "Data Analyst Service",
			"url": f"{DATA_ANALYST_SERVICE_URL}/docs",
			"note": "Filtros, comparaciones y metricas Athena por owner",
		},
	]

	return templates.TemplateResponse("docs.html", {"request": request, "services": services})
