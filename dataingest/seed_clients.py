"""Add deterministic demo clients to the existing MakeShop dataset.

This script is incremental: it does not delete or recreate owners, shops or
products, and it is safe to run more than once.
"""

import os
import uuid
from datetime import datetime, timedelta

import bcrypt
import psycopg2
import pymysql
from dotenv import load_dotenv


load_dotenv()

CLIENTS_PER_SHOP = int(os.getenv("CLIENTS_PER_SHOP", "5"))
CLIENT_PASSWORD = os.getenv("CLIENT_PASSWORD", "OpenStore1")
CLIENT_PASSWORD_HASH = bcrypt.hashpw(
    CLIENT_PASSWORD.encode("utf-8"), bcrypt.gensalt(10)
).decode()


def main() -> None:
    pg = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "userdb"),
        user=os.getenv("POSTGRES_USER", "admin"),
        password=os.getenv("POSTGRES_PASSWORD", "admin123"),
    )
    mysql = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3307")),
        db=os.getenv("MYSQL_DB", "shopdb"),
        user=os.getenv("MYSQL_USER", "admin"),
        password=os.getenv("MYSQL_PASSWORD", "admin123"),
    )

    try:
        with mysql.cursor() as cursor:
            cursor.execute("SELECT id, name FROM Shop ORDER BY id")
            shops = cursor.fetchall()

        if not shops:
            raise RuntimeError("No existen tiendas en MySQL; ejecuta primero seed_prod.py")

        user_rows = []
        membership_rows = []
        now = datetime.utcnow()
        client_number = 0
        day_offsets = (3, 10, 20, 35, 50)

        for shop_id, shop_name in shops:
            for index in range(CLIENTS_PER_SHOP):
                client_number += 1
                client_id = str(uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"makeshop-demo-client:{shop_id}:{index}",
                ))
                email = f"client-{shop_id}-{index}@prod.seed"
                # Keep every shop represented in both the current and previous
                # 30-day periods used by the owner dashboard.
                created_at = now - timedelta(days=day_offsets[index % len(day_offsets)])
                name = f"Cliente {index + 1} - {str(shop_name)[:70]}"
                phone = f"9{client_number % 100000000:08d}"
                user_rows.append(
                    (
                        client_id, name, email, phone, "CLIENT", None, str(shop_id),
                        CLIENT_PASSWORD_HASH, True, True, 0, created_at, created_at,
                    )
                )
                membership_rows.append((client_id, str(shop_id), client_id, str(shop_id)))

        with pg.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO users
                    (id, name, email, phone_number, role, subscription, shop_id,
                     password, enabled, email_verified, token_version, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    phone_number = EXCLUDED.phone_number,
                    role = EXCLUDED.role,
                    shop_id = EXCLUDED.shop_id,
                    password = EXCLUDED.password,
                    enabled = EXCLUDED.enabled,
                    email_verified = EXCLUDED.email_verified,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at
                """,
                user_rows,
            )
        pg.commit()

        with mysql.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO Membership (user_id, role, shop_id)
                SELECT %s, 'CLIENT', %s FROM DUAL
                WHERE NOT EXISTS (
                    SELECT 1 FROM Membership
                    WHERE user_id = %s AND shop_id = %s AND role = 'CLIENT'
                )
                """,
                membership_rows,
            )
        mysql.commit()

        print(f"Clientes procesados: {len(user_rows)}")
        print(f"Tiendas encontradas: {len(shops)}")
        print(f"Primer cliente de prueba: {user_rows[0][2]}")
        print(f"Contraseña de prueba: {CLIENT_PASSWORD}")
    finally:
        pg.close()
        mysql.close()


if __name__ == "__main__":
    main()
