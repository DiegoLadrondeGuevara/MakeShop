-- MakeShop - consultas analiticas para Glue/Athena
-- Base: openstore_catalog
-- Tablas: users, shops_csv, memberships_csv, products
-- La identidad del owner se filtra por shops_csv.owner_id en el microservicio.

-- 1. Productos con tienda y owner
SELECT p.id AS product_id, p.name AS product_name,
       TRY_CAST(p.price AS DOUBLE) AS price, p.availability,
       s.id AS shop_id, s.name AS shop_name, s.owner_id
FROM openstore_catalog.products p
JOIN openstore_catalog.shops_csv s ON p.shop_id = s.id
ORDER BY price DESC
LIMIT 100;

-- 2. Usuarios asignados a tiendas
SELECT u.id AS user_id, u.name AS user_name, u.email, u.role,
       TRY_CAST(u.created_at AS TIMESTAMP) AS registered_at,
       s.id AS shop_id, s.name AS shop_name, s.owner_id
FROM openstore_catalog.users u
LEFT JOIN openstore_catalog.shops_csv s ON u.shop_id = s.id
WHERE UPPER(COALESCE(u.role, '')) <> 'OWNER'
ORDER BY registered_at DESC
LIMIT 100;

-- 3. Membresias por tienda con usuario y owner
SELECT s.id AS shop_id, s.name AS shop_name, s.owner_id,
       m.id AS membership_id, m.user_id, u.name AS user_name,
       m.role AS membership_role
FROM openstore_catalog.memberships_csv m
JOIN openstore_catalog.shops_csv s ON m.shop_id = s.id
LEFT JOIN openstore_catalog.users u ON m.user_id = u.id
ORDER BY s.name, membership_role
LIMIT 100;

-- 4. Resumen por tienda sin multiplicar conteos por los JOINs
WITH product_metrics AS (
    SELECT shop_id, COUNT(DISTINCT id) AS total_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(availability, '')) = 'AVAILABLE' THEN id END) AS available_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(availability, '')) <> 'AVAILABLE' THEN id END) AS out_of_stock_products,
           COALESCE(AVG(TRY_CAST(price AS DOUBLE)), 0) AS average_price
    FROM openstore_catalog.products GROUP BY shop_id
), user_metrics AS (
    SELECT shop_id, COUNT(DISTINCT CASE WHEN UPPER(COALESCE(role, '')) <> 'OWNER' THEN id END) AS total_users
    FROM openstore_catalog.users GROUP BY shop_id
), membership_metrics AS (
    SELECT shop_id, COUNT(DISTINCT id) AS total_memberships
    FROM openstore_catalog.memberships_csv GROUP BY shop_id
)
SELECT s.owner_id, s.id AS shop_id, s.name AS shop_name,
       COALESCE(p.total_products, 0) AS total_products,
       COALESCE(p.available_products, 0) AS available_products,
       COALESCE(p.out_of_stock_products, 0) AS out_of_stock_products,
       COALESCE(p.average_price, 0) AS average_price,
       COALESCE(u.total_users, 0) AS total_users,
       COALESCE(m.total_memberships, 0) AS total_memberships
FROM openstore_catalog.shops_csv s
LEFT JOIN product_metrics p ON p.shop_id = s.id
LEFT JOIN user_metrics u ON u.shop_id = s.id
LEFT JOIN membership_metrics m ON m.shop_id = s.id
ORDER BY total_products DESC;

-- 5. Vista reutilizable para el dashboard
CREATE OR REPLACE VIEW openstore_catalog.v_tienda_resumen AS
WITH product_metrics AS (
    SELECT shop_id, COUNT(DISTINCT id) AS total_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(availability, '')) = 'AVAILABLE' THEN id END) AS available_products,
           COUNT(DISTINCT CASE WHEN UPPER(COALESCE(availability, '')) <> 'AVAILABLE' THEN id END) AS out_of_stock_products,
           COALESCE(AVG(TRY_CAST(price AS DOUBLE)), 0) AS average_price
    FROM openstore_catalog.products GROUP BY shop_id
), user_metrics AS (
    SELECT shop_id, COUNT(DISTINCT CASE WHEN UPPER(COALESCE(role, '')) <> 'OWNER' THEN id END) AS total_users
    FROM openstore_catalog.users GROUP BY shop_id
), membership_metrics AS (
    SELECT shop_id, COUNT(DISTINCT id) AS total_memberships
    FROM openstore_catalog.memberships_csv GROUP BY shop_id
)
SELECT s.owner_id, s.id AS shop_id, s.name AS shop_name,
       COALESCE(p.total_products, 0) AS total_products,
       COALESCE(p.available_products, 0) AS available_products,
       COALESCE(p.out_of_stock_products, 0) AS out_of_stock_products,
       COALESCE(p.average_price, 0) AS average_price,
       COALESCE(u.total_users, 0) AS total_users,
       COALESCE(m.total_memberships, 0) AS total_memberships
FROM openstore_catalog.shops_csv s
LEFT JOIN product_metrics p ON p.shop_id = s.id
LEFT JOIN user_metrics u ON u.shop_id = s.id
LEFT JOIN membership_metrics m ON m.shop_id = s.id;

-- 6. Vista de altas de usuarios para comparar periodos
CREATE OR REPLACE VIEW openstore_catalog.v_usuarios_tienda AS
SELECT u.id AS user_id, u.name AS user_name, u.email, u.role,
       TRY_CAST(u.created_at AS TIMESTAMP) AS registered_at,
       s.owner_id, s.id AS shop_id, s.name AS shop_name,
       m.role AS membership_role
FROM openstore_catalog.users u
LEFT JOIN openstore_catalog.shops_csv s ON u.shop_id = s.id
LEFT JOIN openstore_catalog.memberships_csv m ON m.user_id = u.id AND m.shop_id = s.id;
