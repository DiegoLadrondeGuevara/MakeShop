import os
from urllib.parse import urlencode

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://user-service:8080")
USER_AUTH_BASE_PATH = "/auth"
SHOP_SERVICE_URL = os.getenv("SHOP_SERVICE_URL", "http://shop-service:3000")
PRODUCT_SERVICE_URL = os.getenv("PRODUCT_SERVICE_URL", "http://product-service:8000")
DATA_ANALYST_SERVICE_URL = os.getenv("DATA_ANALYST_SERVICE_URL", "http://data-analyst-service:8005")


def user_auth_login_url(shop_id: str | None = None) -> str:
	if shop_id is None:
		return f"{USER_SERVICE_URL}{USER_AUTH_BASE_PATH}/login"
	return f"{USER_SERVICE_URL}{USER_AUTH_BASE_PATH}/{shop_id}/login"


def user_auth_register_url(shop_id: str | None = None) -> str:
	if shop_id is None:
		return f"{USER_SERVICE_URL}{USER_AUTH_BASE_PATH}/register"
	return f"{USER_SERVICE_URL}{USER_AUTH_BASE_PATH}/{shop_id}/register"


def shop_create_url() -> str:
	return f"{SHOP_SERVICE_URL}/openshop/shop"


def shop_get_by_name_url(shop_name: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/name/{shop_name}"


def shop_update_url(shop_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/{shop_id}"


def shop_delete_url(shop_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/id/{shop_id}"


def shop_get_by_id_url(shop_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/{shop_id}"


def user_me_url() -> str:
	return f"{USER_SERVICE_URL}/me"


def user_verify_url() -> str:
	return f"{USER_SERVICE_URL}/verify"


def user_get_by_id_url(user_id: str) -> str:
	return f"{USER_SERVICE_URL}/users/{user_id}"


def user_update_subscription_url(user_id: str) -> str:
	return f"{USER_SERVICE_URL}/users/{user_id}/subscription"


def user_me_update_subscription_url() -> str:
	return f"{USER_SERVICE_URL}/user/me/subscription"


def product_delete_url(shop_id: str, product_id: str) -> str:
	return f"{PRODUCT_SERVICE_URL}/shops/{shop_id}/products/{product_id}"


def product_purge_by_shop_url(shop_id: str) -> str:
	return f"{PRODUCT_SERVICE_URL}/internal/shops/{shop_id}/products"


def shop_internal_delete_url(shop_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/internal/shops/{shop_id}"


def shop_list_by_owner_url(owner_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/owner/{owner_id}"


def owner_shops_url(owner_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/owner/{owner_id}"


def user_list_by_shop_ids_url(shop_ids: list[str], page: int = 0, size: int = 20) -> str:
	query_items = [("shopIds", shop_id) for shop_id in shop_ids]
	query_items.extend([("page", str(page)), ("size", str(size))])
	return f"{USER_SERVICE_URL}/users/shops?{urlencode(query_items)}"


def user_list_by_shop_url(shop_id: str, page: int = 0, size: int = 20) -> str:
	return f"{USER_SERVICE_URL}/users/shop/{shop_id}?page={page}&size={size}"


def shop_list_url(page: int = 1, limit: int = 10) -> str:
	return f"{SHOP_SERVICE_URL}/shops?page={page}&limit={limit}"


def product_list_by_shop_url(shop_id: str) -> str:
	return f"{PRODUCT_SERVICE_URL}/shops/{shop_id}/products"


def product_create_url(shop_id: str) -> str:
	return f"{PRODUCT_SERVICE_URL}/shops/{shop_id}/products"


def product_update_url(shop_id: str, product_id: str) -> str:
	return f"{PRODUCT_SERVICE_URL}/shops/{shop_id}/products/{product_id}"


def shop_theme_url(shop_id: str) -> str:
	return f"{SHOP_SERVICE_URL}/shop/{shop_id}/theme"


def data_analyst_url(path: str = "") -> str:
	return f"{DATA_ANALYST_SERVICE_URL}{path}"
