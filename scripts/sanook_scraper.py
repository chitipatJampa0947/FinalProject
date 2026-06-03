"""Scrape human-written Thai news from Sanook via its XML sitemaps.

Why sitemaps (not the category page): Sanook's category listings paginate with
a JS "โหลดเพิ่ม" (load-more) AJAX button that plain requests can't follow. The
sitemap index exposes every article URL directly in gzipped XML, so we skip the
JS entirely — robust, fast, no Selenium/chromedriver.

Source: https://www.sanook.com/news/sitemap.xml -> news_original_*.xml.gz
        ("original" = Sanook's own journalism, not syndicated partner content).

Article bodies ARE in the raw HTML, so per-article scraping is plain requests+bs4.

Output: sanook_dataset.csv  (columns: id,url,title,text,label) with label=0 (Human).
Resumable: re-running continues from the existing CSV (dedupes by URL, continues id).

Usage:
    python sanook_scraper.py                 # full run to TARGET_COUNT
    python sanook_scraper.py --limit 20      # pilot: scrape only 20 articles
    python sanook_scraper.py --target 5000   # override target
"""

import argparse
import csv
import gzip
import os
import re
import sys
import time
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# Configuration
SITEMAP_INDEX = "https://www.sanook.com/news/sitemap.xml"
# Only pull "original" Sanook journalism. Partner/syndicated content is noisier
# (press releases, reposts) and risks non-human or duplicated text.
SUBSITEMAP_INCLUDE = re.compile(r"news_original_", re.I)

OUTPUT_FILE = "sanook_dataset.csv"
TARGET_COUNT = 5_000
MIN_TEXT_LEN = 200
MAX_TEXT_LEN = 3_000
MIN_PARA_LEN = 40          # per-paragraph floor: drops nav/caption fragments
REQUEST_DELAY = 0.6        # seconds between article requests (polite)
REQUEST_TIMEOUT = 15

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# A Sanook news article URL is https://www.sanook.com/news/<digits>/
ARTICLE_RE = re.compile(r"^https?://(?:www\.)?sanook\.com/news/\d+/?$", re.I)


def fetch_bytes(url: str) -> bytes | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return resp.content
    except Exception:
        return None


def fetch_text(url: str) -> str | None:
    raw = fetch_bytes(url)
    if raw is None:
        return None
    # Some sitemap files are .gz; gunzip if needed (magic bytes 1f 8b).
    if raw[:2] == b"\x1f\x8b":
        try:
            raw = gzip.decompress(raw)
        except Exception:
            return None
    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return None


def extract_locs(xml_text: str) -> list[str]:
    """Pull every <loc>...</loc> value. Namespace-agnostic via regex."""
    return [m.strip() for m in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml_text, re.S)]


def collect_article_urls(target: int) -> list[str]:
    """Walk the sitemap index -> original sub-sitemaps -> article URLs."""
    print(f"Fetching sitemap index: {SITEMAP_INDEX}")
    idx_xml = fetch_text(SITEMAP_INDEX)
    if not idx_xml:
        sys.exit("ERROR: could not fetch the Sanook news sitemap index.")

    sub_sitemaps = [u for u in extract_locs(idx_xml) if SUBSITEMAP_INCLUDE.search(u)]
    if not sub_sitemaps:
        sys.exit("ERROR: no 'news_original' sub-sitemaps found in the index.")
    print(f"Found {len(sub_sitemaps)} 'original' sub-sitemaps.")

    seen: set[str] = set()
    urls: list[str] = []
    for sm in sub_sitemaps:
        if len(urls) >= target:
            break
        xml = fetch_text(sm)
        if not xml:
            print(f"  WARN: skip unreadable sub-sitemap {sm}")
            continue
        before = len(urls)
        for loc in extract_locs(xml):
            if ARTICLE_RE.match(loc):
                norm = loc if loc.endswith("/") else loc + "/"
                if norm not in seen:
                    seen.add(norm)
                    urls.append(norm)
        print(f"  {os.path.basename(urlparse(sm).path)}: +{len(urls) - before} urls "
              f"(total {len(urls)})")
    return urls


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_article(html: str) -> tuple[str, str] | None:
    """Return (title, body_text) or None. Body = densest <p> cluster."""
    soup = BeautifulSoup(html, "html.parser")

    # Strip non-article noise so stray <p> don't pollute the body.
    for tag in soup(["script", "style", "noscript", "iframe", "form",
                     "nav", "footer", "header", "aside", "figure", "figcaption"]):
        tag.decompose()

    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else ""

    # Prefer a known content container; fall back to whole-page <p> harvest.
    containers = [
        soup.find("div", attrs={"class": re.compile(
            r"(content-detail|article|entry-content|cms|news-content|body-content)", re.I)}),
        soup.find("div", attrs={"id": re.compile(
            r"(article|content|detail)", re.I)}),
        soup.find("article"),
        soup.find("main"),
        soup,  # last resort: entire (denoised) document
    ]

    best = ""
    for node in containers:
        if node is None:
            continue
        paras = [clean_text(p.get_text(" ", strip=True)) for p in node.find_all("p")]
        paras = [p for p in paras if len(p) >= MIN_PARA_LEN]
        joined = clean_text(" ".join(paras))
        if len(joined) > len(best):
            best = joined
        if len(best) >= MIN_TEXT_LEN:
            break

    if len(best) < MIN_TEXT_LEN:
        return None
    return title, best[:MAX_TEXT_LEN]


def load_existing_state() -> tuple[set[str], int]:
    urls: set[str] = set()
    max_id = 0
    if not os.path.exists(OUTPUT_FILE):
        return urls, max_id
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row.get("url"):
                    urls.add(row["url"])
                try:
                    max_id = max(max_id, int(row.get("id", 0)))
                except (TypeError, ValueError):
                    pass
    except Exception as e:
        print(f"Warning: could not read existing CSV ({e}). Fresh tracking.")
    return urls, max_id


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Scrape Sanook human news via sitemaps.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Pilot mode: scrape at most N new articles this run.")
    ap.add_argument("--target", type=int, default=TARGET_COUNT,
                    help=f"Total rows to reach in the CSV (default {TARGET_COUNT}).")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    target = args.target

    visited, max_id = load_existing_state()
    initial = len(visited)
    next_id = max_id + 1
    print(f"Existing rows: {initial}. Next id: {next_id}. Target: {target}.")
    if initial >= target:
        print("Target already reached. Nothing to do.")
        return

    # Collect candidate URLs (a bit more than needed to absorb failures/dupes).
    candidates = collect_article_urls(target * 2)
    candidates = [u for u in candidates if u not in visited]
    print(f"Collected {len(candidates)} new candidate article URLs.")
    if not candidates:
        print("No new URLs to scrape.")
        return

    file_exists = os.path.exists(OUTPUT_FILE)
    fout = open(OUTPUT_FILE, "a", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(fout, fieldnames=["id", "url", "title", "text", "label"])
    if not file_exists:
        writer.writeheader()
        fout.flush()

    saved = initial
    added_this_run = 0
    run_cap = args.limit if args.limit is not None else target
    pbar = tqdm(total=min(target, initial + run_cap), initial=initial,
                desc="Scraping Sanook", unit="art")

    try:
        for url in candidates:
            if saved >= target or added_this_run >= run_cap:
                break
            visited.add(url)  # mark before fetch: no double-scrape on failure
            time.sleep(REQUEST_DELAY)
            html = fetch_text(url)
            if not html:
                continue
            parsed = parse_article(html)
            if not parsed:
                continue
            title, text = parsed
            if not title:
                continue
            writer.writerow({"id": next_id, "url": url, "title": title,
                             "text": text, "label": 0})
            fout.flush()
            next_id += 1
            saved += 1
            added_this_run += 1
            pbar.update(1)
    except KeyboardInterrupt:
        print("\nInterrupted by user. Progress saved.")
    finally:
        pbar.close()
        fout.close()
        print(f"Done. Added {added_this_run} articles this run. Total saved: {saved}.")


if __name__ == "__main__":
    main()
