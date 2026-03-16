#!/usr/bin/env python3
"""
infinite cheese harvester – google custom search json api
saves every image it finds into ./cheese
"""

import itertools
import os
import random
import string
import time
from pathlib import Path
from typing import Generator, List
import requests

API_KEY = os.environ["GCS_KEY"]
CX_ID   = os.environ["GCS_CX"]

# search terms to keep things from getting stuck
CHEESE_TERMS: List[str] = [
    "cheese", "queso", "fromage", "käse", "formaggio",
    "сыр", "сырный", "cheddar cheese", "gouda", "parmesan",
]

SAVE_DIR = Path("../docs/src/cheese")
SAVE_DIR.mkdir(exist_ok=True)

def google_image_search(query: str, start: int = 1, num: int = 10):
    """hit the custom search api once and yield (url, mime) pairs"""
    params = {
        "key": API_KEY,
        "cx":  CX_ID,
        "q":   query,
        "searchType": "image",
        "start": start,
        "num":   num,            # max 10
        "safe":  "off",
    }
    r = requests.get("https://www.googleapis.com/customsearch/v1", params=params, timeout=15)
    r.raise_for_status()
    data = r.json()
    for item in data.get("items", []):
        yield item["link"], item.get("mime")

def random_filename(ext: str) -> str:
    """generate collision-free file names like abcd1234.jpg"""
    body = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{body}.{ext}"

def download(url: str, mime: str | None):
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        ext = (mime or "image/jpeg").split("/")[-1]
        fname = SAVE_DIR / random_filename(ext)
        with open(fname, "wb") as f:
            f.write(r.content)
        print("saved", fname)
    except Exception as e:
        print("skip", url, "→", e)

def infinite_query_cycle(terms: List[str]) -> Generator[str, None, None]:
    """cycle through search terms forever but shuffle each lap"""
    while True:
        random.shuffle(terms)
        yield from terms

def main():
    start_index = 1  # api indexes start at 1
    term_cycle = infinite_query_cycle(CHEESE_TERMS)

    while True:
        term = next(term_cycle)
        print(f"🔍 {term!r} @ start={start_index}")

        for url, mime in google_image_search(term, start=start_index):
            download(url, mime)

        # advance pagination; api supports up to 100 results (start 1–91)
        start_index += 10
        if start_index > 91:
            start_index = 1

        # random back-off to stay under quota (adjust as needed)
        sleep_for = random.uniform(1, 3)
        time.sleep(sleep_for)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nbye – you saved", len(list(SAVE_DIR.glob('*'))), "files")
