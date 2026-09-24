"""Create a useful one-year analytics scenario for one demo owner.

The owner dashboard reads users/products exported to Athena. This script creates
or updates deterministic demo clients for the selected owner so monthly, weekly
and daily groupings show a real pattern instead of a flat "1, 1, 1" chart.
It does not delete rows or touch other owners.
"""

import os
import uuid
from datetime import datetime, timedelta

import pymongo
import pymysql
import psycopg2
from dotenv import load_dotenv


load_dotenv()

OWNER_EMAIL = os.getenv("HISTORY_OWNER_EMAIL", "owner1@prod.seed")
CLIENTS_BY_MONTH = tuple(int(value) for value in os.getenv(
    "HISTORY_CLIENTS_BY_MONTH",
    "4,7,11,6,13,18,9,16,22,14,27,33",
).split(","))
PRODUCT_AGE_DAYS = (360, 344, 329, 301, 286, 263, 241, 218, 197, 181, 165, 149,
                    132, 118, 104, 91, 79, 68, 57, 48, 39, 31, 25, 20, 16, 13, 10, 7, 4, 2)
DEFAULT_PASSWORD_HASH = "$2b$10$c39/3VfA1yNnaH6LAtE3ieph1HcNKZ7vtjIyW71ZN8lLCnvaD92hi"


def month_start(value: datetime) -> datetime:
    return value.replace(day=1, hour=10, minute=0, second=0, microsecond=0)


def add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return value.replace(year=year, month=month)


def client_created_at(month: datetime, index: int, total: int) -> datetime:
    # Spread clients across the month with deterministic spikes around payday
    # and campaign days. This keeps daily/weekly charts visibly different.
    campaign_days = (2, 3, 5, 9, 10, 14, 15, 18, 22, 23, 26, 27)
    if index < len(campaign_days):
        day = campaign_days[index]
    else:
        day = 1 + ((index * 7 + total) % 27)
    return month.replace(day=min(day, 28), hour=9 + (index % 9), minute=(index * 11) % 60)


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
    mongo = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    collection = mongo[os.getenv("MONGO_DB", "productdb")]["products"]
    now = datetime.utcnow()

    try:
        with pg.cursor() as cursor:
            cursor.execute("SELECT id, password FROM users WHERE email = %s AND role = 'OWNER'", (OWNER_EMAIL,))
            owner = cursor.fetchone()
            if not owner:
                raise RuntimeError(f"No existe el owner {OWNER_EMAIL}")
            owner_id = str(owner[0])
            password_hash = owner[1] or DEFAULT_PASSWORD_HASH

        with mysql.cursor() as cursor:
            cursor.execute("SELECT id, name FROM Shop WHERE owner_id = %s ORDER BY id", (owner_id,))
            shops = cursor.fetchall()
        shop_ids = [str(shop_id) for shop_id, _ in shops]
        if not shop_ids:
            raise RuntimeError(f"El owner {OWNER_EMAIL} no tiene tiendas")

        start_month = month_start(add_months(now, -(len(CLIENTS_BY_MONTH) - 1)))
        generated_clients = 0
        with pg.cursor() as cursor:
            for month_offset, month_total in enumerate(CLIENTS_BY_MONTH):
                month = add_months(start_month, month_offset)
                for index in range(month_total):
                    shop_id = shop_ids[(month_offset + index) % len(shop_ids)]
                    client_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"makeshop-history:{owner_id}:{month:%Y-%m}:{index}"))
                    created_at = client_created_at(month, index, month_total)
                    email = f"owner1.demo.{month:%Y%m}.{index + 1:02d}@prod.seed"
                    name = f"Cliente demo {month:%Y%m}-{index + 1:02d}"
                    phone = f"98{month_offset:02d}{index:05d}"[:9]
                    cursor.execute(
                        """
                        INSERT INTO users
                            (id, name, email, phone_number, role, subscription, shop_id,
                             password, enabled, email_verified, token_version, created_at, updated_at)
                        VALUES (%s,%s,%s,%s,'CLIENT',NULL,%s,%s,true,true,0,%s,%s)
                        ON CONFLICT (email) DO UPDATE SET
                            name = EXCLUDED.name,
                            phone_number = EXCLUDED.phone_number,
                            shop_id = EXCLUDED.shop_id,
                            created_at = EXCLUDED.created_at,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (client_id, name, email, phone, shop_id, password_hash, created_at, created_at),
                    )
                    generated_clients += 1
        pg.commit()

        products = list(collection.find({"shop_id": {"$in": shop_ids}}, {"_id": 1}).sort("_id", 1))
        operations = []
        for index, product in enumerate(products):
            created_at = now - timedelta(days=PRODUCT_AGE_DAYS[index % len(PRODUCT_AGE_DAYS)])
            operations.append(pymongo.UpdateOne(
                {"_id": product["_id"]},
                {"$set": {"created_at": created_at, "updated_at": created_at}},
            ))
        if operations:
            collection.bulk_write(operations, ordered=False)

        print(f"Owner: {OWNER_EMAIL}")
        print(f"Tiendas afectadas: {len(shop_ids)}")
        print(f"Clientes historicos creados/actualizados: {generated_clients}")
        print(f"Productos actualizados: {len(products)}")
        print("Historico generado de forma determinista para los ultimos 12 meses.")
    finally:
        pg.close()
        mysql.close()
        mongo.close()


if __name__ == "__main__":
    main()
