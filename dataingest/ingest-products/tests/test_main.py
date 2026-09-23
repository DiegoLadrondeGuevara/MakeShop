import json
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# --- extract_products ---

def test_extract_products_returns_list_of_dicts():
    from main import extract_products

    mock_doc = {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Producto A",
        "price": 99.99,
        "description": "Desc",
        "imageUrl": "https://picsum.photos/seed/1/400/400",
        "availability": "AVAILABLE",
        "shopId": "shop-uuid-1",
    }
    mock_collection = MagicMock()
    mock_collection.find.return_value = [mock_doc]

    result = extract_products(mock_collection)

    assert len(result) == 1
    assert result[0]["name"] == "Producto A"
    assert result[0]["price"] == 99.99
    assert isinstance(result[0]["id"], str)


def test_extract_products_converts_id_to_str():
    from main import extract_products

    mock_doc = {
        "_id": "507f1f77bcf86cd799439011",
        "name": "P",
        "price": 1.0,
        "description": "",
        "imageUrl": "https://picsum.photos/seed/1/400/400",
        "availability": "AVAILABLE",
        "shopId": "s1",
    }
    mock_collection = MagicMock()
    mock_collection.find.return_value = [mock_doc]

    result = extract_products(mock_collection)

    assert result[0]["id"] == "507f1f77bcf86cd799439011"


def test_extract_products_calls_find_all():
    from main import extract_products

    mock_collection = MagicMock()
    mock_collection.find.return_value = []

    extract_products(mock_collection)

    mock_collection.find.assert_called_once_with({})


# --- write_json ---

def test_write_json_creates_valid_json(tmp_path):
    from main import write_json

    records = [{"id": "1", "name": "Producto A", "price": 9.99}]
    filepath = str(tmp_path / "products.json")
    write_json(records, filepath)

    with open(filepath, encoding="utf-8") as f:
        loaded = [json.loads(line) for line in f if line.strip()]

    assert len(loaded) == 1
    assert loaded[0]["name"] == "Producto A"


def test_write_json_writes_empty_array(tmp_path):
    from main import write_json

    filepath = str(tmp_path / "empty.json")
    write_json([], filepath)

    with open(filepath, encoding="utf-8") as f:
        loaded = [json.loads(line) for line in f if line.strip()]

    assert loaded == []


# --- upload_to_s3 ---

def test_upload_to_s3_calls_boto3(tmp_path):
    from main import upload_to_s3

    filepath = str(tmp_path / "products.json")
    with open(filepath, "w") as f:
        f.write("[]")

    with patch("main.boto3") as mock_boto3:
        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3
        upload_to_s3(filepath, "my-bucket", "products/products.json")

    mock_s3.upload_file.assert_called_once_with(
        filepath, "my-bucket", "products/products.json"
    )
