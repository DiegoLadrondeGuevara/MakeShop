"""Create a realistic one-year catalog and client history for one demo owner.

This script only changes created_at/updated_at for the selected owner's clients
and products. It does not create purchases, delete rows, or touch other owners.
"""

import os
from datetime import datetime, timedelta

import pymongo
import pymysql
import psycopg2
from dotenv import load_dotenv


load_dotenv()

OWNER_EMAIL = os.getenv("HISTORY_OWNER_EMAIL", "owner1@prod.seed")
CLIENT_AGE_DAYS = (352, 318, 281, 244, 211, 176, 143, 98, 46, 9)
PRODUCT_AGE_DAYS = (360, 344, 329, 301, 286, 263, 241, 218, 197, 181, 165, 149,
                    132, 118, 104, 91, 79, 68, 57, 48, 39, 31, 25, 20, 16, 13, 10, 7, 4, 2)


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
            cursor.execute("SELECT id FROM users WHERE email = %s AND role = 'OWNER'", (OWNER_EMAIL,))
            owner = cursor.fetchone()
            if not owner:
                raise RuntimeError(f"No existe el owner {OWNER_EMAIL}")
            owner_id = str(owner[0])

        with mysql.cursor() as cursor:
            cursor.execute("SELECT id, name FROM Shop WHERE owner_id = %s ORDER BY id", (owner_id,))
            shops = cursor.fetchall()
        shop_ids = [str(shop_id) for shop_id, _ in shops]
        if not shop_ids:
            raise RuntimeError(f"El owner {OWNER_EMAIL} no tiene tiendas")

        with pg.cursor() as cursor:
            cursor.execute(
                """SELECT id FROM users
                   WHERE role = 'CLIENT' AND shop_id = ANY(%s::uuid[])
                   ORDER BY shop_id, email""",
                (shop_ids,),
            )
            clients = [str(row[0]) for row in cursor.fetchall()]
            for index, client_id in enumerate(clients):
                created_at = now - timedelta(days=CLIENT_AGE_DAYS[index % len(CLIENT_AGE_DAYS)])
                cursor.execute(
                    "UPDATE users SET created_at = %s, updated_at = %s WHERE id = %s",
                    (created_at, created_at, client_id),
                )
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
        print(f"Clientes actualizados: {len(clients)}")
        print(f"Productos actualizados: {len(products)}")
        print("Historico generado de forma determinista para los ultimos 12 meses.")
    finally:
        pg.close()
        mysql.close()
        mongo.close()


if __name__ == "__main__":
    main()
