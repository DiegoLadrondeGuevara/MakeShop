import json
import os
import sys
import boto3
import pymongo


def get_collection():
    client = pymongo.MongoClient(os.environ["MONGO_URI"])
    db_name = os.environ.get("MONGO_DB", "productdb")
    return client[db_name]["products"]


def extract_products(collection) -> list:
    records = []
    for doc in collection.find({}):
        records.append({
            "id": str(doc.get("_id", "")),
            "name": doc.get("name", ""),
            "price": doc.get("price", 0),
            "description": doc.get("description", ""),
            "image_url": str(doc.get("image_url") or doc.get("imageUrl") or ""),
            "availability": doc.get("availability", ""),
            "shop_id": str(doc.get("shop_id") or doc.get("shopId") or ""),
            "created_at": doc.get("created_at") or doc.get("createdAt") or "",
        })
    return records


def write_json(records: list, filepath: str) -> None:
    # JSON Lines format (one object per line) — required by Athena
    with open(filepath, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def upload_to_s3(filepath: str, bucket: str, key: str) -> None:
    s3 = boto3.client("s3")
    s3.upload_file(filepath, bucket, key)


def main():
    print("=== ingest-products: iniciando ===")

    print("Conectando a MongoDB...")
    try:
        collection = get_collection()
    except Exception as e:
        print(f"ERROR: No se pudo conectar a MongoDB: {e}")
        sys.exit(1)

    print("Extrayendo productos...")
    try:
        records = extract_products(collection)
    except Exception as e:
        print(f"ERROR: Fallo al extraer productos: {e}")
        sys.exit(1)

    print(f"  {len(records)} registros extraídos")

    filepath = "/tmp/products.json"
    print(f"Escribiendo {filepath}...")
    try:
        write_json(records, filepath)
    except Exception as e:
        print(f"ERROR: Fallo al escribir JSON: {e}")
        sys.exit(1)

    bucket = os.environ["S3_BUCKET"]
    key = "products/products.json"
    print(f"Subiendo a s3://{bucket}/{key}...")
    try:
        upload_to_s3(filepath, bucket, key)
    except Exception as e:
        print(f"ERROR: Fallo al subir a S3: {e}")
        sys.exit(1)

    print(f"✓ products.json subido con {len(records)} registros")


if __name__ == "__main__":
    main()
