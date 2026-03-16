"""
Load cheese data into AstraDB with OpenAI embeddings.

Usage:
    python ingest.py --file /path/to/your/cheeses.json

Expected input format — a JSON array of objects, each with at least a text field.
Any of these structures are accepted:

  [{"name": "Brie", "description": "A soft French cheese..."}]
  [{"text": "Brie is a soft French cheese..."}]
  [{"name": "Brie", "origin": "France", "flavour": "mild and creamy"}]

All string fields in each object are joined into a single text chunk for embedding.
"""

import argparse
import csv
import json
import os
import sys
import time

from dotenv import load_dotenv
from openai import OpenAI
from astrapy import DataAPIClient
from astrapy.info import CollectionDefinition, CollectionVectorOptions
from astrapy.constants import VectorMetric

load_dotenv()

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
ASTRA_DB_APPLICATION_TOKEN = os.environ["ASTRA_DB_APPLICATION_TOKEN"]
ASTRA_DB_API_ENDPOINT = os.environ["ASTRA_DB_API_ENDPOINT"]
ASTRA_DB_KEYSPACE = os.environ.get("ASTRA_DB_KEYSPACE", "cheese_db")
ASTRA_DB_COLLECTION = os.environ.get("ASTRA_DB_COLLECTION", "cheeses")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSION = 1536  # text-embedding-3-small default


def load_file(path: str) -> list[dict]:
    if path.endswith(".csv"):
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    raise ValueError("JSON file must contain an array of objects at the top level")


def to_text(record: dict) -> str:
    """Build a readable text chunk from a cheese record."""
    if "text" in record:
        return record["text"]

    def val(k):
        v = record.get(k, "")
        return v if isinstance(v, str) and v.strip() and v.strip().upper() != "NA" else ""

    name = val("cheese") or val("name")
    parts = []

    if name:
        parts.append(name)

    attrs = []
    for k in ("type", "milk", "country", "region", "family", "texture",
              "rind", "color", "flavor", "aroma", "fat_content",
              "calcium_content", "vegetarian", "vegan", "synonyms",
              "alt_spellings", "producers"):
        v = val(k)
        if v:
            attrs.append(f"{k}: {v}")

    if attrs:
        parts.append(" | ".join(attrs))

    return ". ".join(parts) if parts else " ".join(
        f"{k}: {v}" for k, v in record.items()
        if isinstance(v, str) and v.strip() and v.strip().upper() != "NA"
    )


def embed_batch(texts: list[str], client: OpenAI) -> list[list[float]]:
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def main():
    parser = argparse.ArgumentParser(description="Ingest cheese data into AstraDB")
    parser.add_argument("--file", required=True, help="Path to your cheese data file (JSON or CSV)")
    parser.add_argument("--batch-size", type=int, default=20, help="Embedding batch size (default: 20)")
    args = parser.parse_args()

    print(f"Loading data from {args.file}...")
    records = load_file(args.file)
    print(f"Loaded {len(records)} records")

    openai_client = OpenAI(api_key=OPENAI_API_KEY)

    astra_client = DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
    db = astra_client.get_database_by_api_endpoint(ASTRA_DB_API_ENDPOINT, keyspace=ASTRA_DB_KEYSPACE)

    # Create collection if it doesn't exist
    existing = [c.name for c in db.list_collections()]
    if ASTRA_DB_COLLECTION not in existing:
        print(f"Creating collection '{ASTRA_DB_COLLECTION}' (dimension={EMBEDDING_DIMENSION})...")
        db.create_collection(
            ASTRA_DB_COLLECTION,
            definition=CollectionDefinition(
                vector=CollectionVectorOptions(
                    dimension=EMBEDDING_DIMENSION,
                    metric=VectorMetric.COSINE,
                )
            ),
        )
    collection = db.get_collection(ASTRA_DB_COLLECTION)

    texts = [to_text(r) for r in records]
    total = len(texts)
    inserted = 0

    for i in range(0, total, args.batch_size):
        batch_texts = texts[i: i + args.batch_size]
        batch_records = records[i: i + args.batch_size]

        print(f"Embedding batch {i // args.batch_size + 1} ({i + 1}–{min(i + args.batch_size, total)} of {total})...")
        vectors = embed_batch(batch_texts, openai_client)

        docs = []
        for text, vector, record in zip(batch_texts, vectors, batch_records):
            doc = {"text": text, "$vector": vector}
            # Preserve original fields for reference
            doc.update({k: v for k, v in record.items() if k != "text"})
            docs.append(doc)

        collection.insert_many(docs)
        inserted += len(docs)
        print(f"  Inserted {inserted}/{total}")

        # Small pause to stay within OpenAI rate limits
        if i + args.batch_size < total:
            time.sleep(0.5)

    print(f"\nDone. {inserted} documents ingested into '{ASTRA_DB_COLLECTION}'.")


if __name__ == "__main__":
    main()
