import csv
import os
import re
import time
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# Configuration
CATEGORY_URLS = [
    "https://thestandard.co/category/news/tech/",
    "https://thestandard.co/category/news/world/",
]
OUTPUT_FILE = "thestandard_dataset.csv"
TARGET_COUNT = 10_000
MIN_TEXT_LEN = 200
MAX_TEXT_LEN = 3_000
REQUEST_DELAY = 1.0      # seconds between article requests
REQUEST_TIMEOUT = 15
MAX_PAGES_PER_CATEGORY = 1000  # safety bound

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# Listing pages contain category/tag/author/page links we must ignore.
EXCLUDED_PATH_PREFIXES = (
    "/category/", "/tag/", "/author/", "/page/", "/wp-",
    "/about", "/contact", "/privacy", "/terms", "/feed",
)


def normalize_url(url: str) -> str:
    """Lowercase host, strip query/fragment, ensure trailing slash on path."""
    try:
        parsed = urlparse(url)
    except Exception:
        return url
    netloc = parsed.netloc.lower() or "thestandard.co"
    path = parsed.path or "/"
    if not path.endswith("/"):
        path += "/"
    scheme = parsed.scheme or "https"
    return f"{scheme}://{netloc}{path}"


def is_article_url(url: str) -> bool:
    """Heuristic: an article URL is a thestandard.co root-level slug."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.netloc and "thestandard.co" not in parsed.netloc:
        return False
    path = parsed.path or "/"
    if path in ("/", ""):
        return False
    for bad in EXCLUDED_PATH_PREFIXES:
        if path.startswith(bad):
            return False
    segments = [s for s in path.split("/") if s]
    return len(segments) == 1


def load_existing_state() -> tuple[set[str], int]:
    """Return (urls_already_saved, max_id_seen) from existing CSV if any."""
    urls: set[str] = set()
    max_id = 0
    if not os.path.exists(OUTPUT_FILE):
        return urls, max_id
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                u = row.get("url")
                if u:
                    urls.add(normalize_url(u))
                try:
                    rid = int(row.get("id", 0))
                    if rid > max_id:
                        max_id = rid
                except (TypeError, ValueError):
                    pass
    except Exception as e:
        print(f"Warning: could not read existing CSV ({e}). Starting fresh tracking.")
    return urls, max_id


def fetch(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return resp.text
    except Exception:
        return None


def parse_listing(html: str) -> list[str]:
    """Collect article URLs from a category listing page."""
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    seen_local: set[str] = set()

    # Primary: <article> cards usually wrap each post; grab the first <a href>.
    for art in soup.find_all("article"):
        a = art.find("a", href=True)
        if not a:
            continue
        href = a["href"]
        if href.startswith("/"):
            href = "https://thestandard.co" + href
        if is_article_url(href):
            norm = normalize_url(href)
            if norm not in seen_local:
                seen_local.add(norm)
                found.append(norm)

    # Fallback: heading-anchored links.
    if not found:
        for h in soup.find_all(["h1", "h2", "h3"]):
            a = h.find("a", href=True)
            if not a:
                continue
            href = a["href"]
            if href.startswith("/"):
                href = "https://thestandard.co" + href
            if is_article_url(href):
                norm = normalize_url(href)
                if norm not in seen_local:
                    seen_local.add(norm)
                    found.append(norm)

    return found


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_article(html: str) -> tuple[str, str] | None:
    """Return (title, body_text) for a single article page."""
    soup = BeautifulSoup(html, "html.parser")

    # Drop noise.
    for tag in soup(["script", "style", "noscript", "iframe", "form",
                     "nav", "footer", "header", "aside", "figcaption"]):
        tag.decompose()

    h1 = soup.find("h1")
    title = clean_text(h1.get_text(" ", strip=True)) if h1 else ""

    body_text = ""
    candidates = [
        ("div", {"class": re.compile(r"(entry-content|post-content|article-content|content-body)", re.I)}),
        ("article", {}),
        ("main", {}),
    ]
    for name, attrs in candidates:
        node = soup.find(name, attrs=attrs) if attrs else soup.find(name)
        if not node:
            continue
        paragraphs = [p.get_text(" ", strip=True) for p in node.find_all("p")]
        joined = " ".join(p for p in paragraphs if p)
        if len(joined) >= MIN_TEXT_LEN:
            body_text = joined
            break

    body_text = clean_text(body_text)
    if not body_text:
        return None
    return title, body_text


def main() -> None:
    visited_urls, max_id = load_existing_state()
    initial_saved = len(visited_urls)
    next_id = max_id + 1

    print(f"Existing rows: {initial_saved}. Next id: {next_id}. Target: {TARGET_COUNT}.")
    if initial_saved >= TARGET_COUNT:
        print("Target already reached. Nothing to do.")
        return

    file_exists = os.path.exists(OUTPUT_FILE)
    fout = open(OUTPUT_FILE, "a", encoding="utf-8-sig", newline="")
    writer = csv.DictWriter(fout, fieldnames=["id", "url", "title", "text", "label"])
    if not file_exists:
        writer.writeheader()
        fout.flush()

    saved_count = initial_saved
    pbar = tqdm(total=TARGET_COUNT, initial=initial_saved, desc="Scraping", unit="art")

    exhausted = [False] * len(CATEGORY_URLS)
    page = 1

    try:
        while saved_count < TARGET_COUNT and not all(exhausted):
            if page > MAX_PAGES_PER_CATEGORY:
                print("Reached max page bound. Stopping.")
                break

            for idx, cat_url in enumerate(CATEGORY_URLS):
                if exhausted[idx] or saved_count >= TARGET_COUNT:
                    continue

                listing_url = cat_url if page == 1 else f"{cat_url}page/{page}/"
                listing_html = fetch(listing_url)
                if not listing_html:
                    exhausted[idx] = True
                    continue

                article_urls = parse_listing(listing_html)
                if not article_urls:
                    exhausted[idx] = True
                    continue

                for art_url in article_urls:
                    if saved_count >= TARGET_COUNT:
                        break
                    if art_url in visited_urls:
                        continue

                    # Mark visited BEFORE fetch — guarantees no double-scrape
                    # even if fetch/parse fails this run.
                    visited_urls.add(art_url)

                    time.sleep(REQUEST_DELAY)
                    art_html = fetch(art_url)
                    if not art_html:
                        continue

                    parsed = parse_article(art_html)
                    if not parsed:
                        continue

                    title, text = parsed
                    if len(text) < MIN_TEXT_LEN:
                        continue
                    if len(text) > MAX_TEXT_LEN:
                        text = text[:MAX_TEXT_LEN]

                    writer.writerow({
                        "id": next_id,
                        "url": art_url,
                        "title": title,
                        "text": text,
                        "label": 0,
                    })
                    fout.flush()
                    next_id += 1
                    saved_count += 1
                    pbar.update(1)

            page += 1

    except KeyboardInterrupt:
        print("\nInterrupted by user. Progress saved.")
    finally:
        pbar.close()
        fout.close()
        added = saved_count - initial_saved
        print(f"Done. Added {added} articles this run. Total saved: {saved_count}.")


if __name__ == "__main__":
    main()
