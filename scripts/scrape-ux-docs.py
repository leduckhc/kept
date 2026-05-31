#!/usr/bin/env python3
# pip install -r scripts/requirements-scrape.txt
"""Scrape Superhuman and Spark help docs into markdown files for UX research."""

import asyncio
import sys
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
import markdownify

OUTPUT_DIR = Path(__file__).parent.parent / "docs" / "ux-research"
RATE_LIMIT = 1.0  # seconds between requests
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", text).strip("-")[:80]


async def fetch_with_retry(client: httpx.AsyncClient, url: str) -> httpx.Response | None:
    delay = 1.0
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = await client.get(url)
            if resp.status_code == 403:
                log(f"  WARNING: 403 Forbidden (Cloudflare?) — skipping {url}")
                return None
            if resp.status_code in (429, 500, 502, 503, 504):
                if attempt < MAX_RETRIES:
                    log(f"  HTTP {resp.status_code}, retrying in {delay:.0f}s... (attempt {attempt}/{MAX_RETRIES})")
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                log(f"  HTTP {resp.status_code} after {MAX_RETRIES} attempts — skipping {url}")
                return None
            return resp
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            if attempt < MAX_RETRIES:
                log(f"  Network error ({e}), retrying in {delay:.0f}s...")
                await asyncio.sleep(delay)
                delay *= 2
            else:
                log(f"  Network error after {MAX_RETRIES} attempts — skipping {url}: {e}")
                return None
    return None


def save_article(soup: BeautifulSoup, url: str, slug: str, out_dir: Path) -> str:
    """Extract article content and save as markdown. Returns filename."""
    content = (
        soup.find("article")
        or soup.find("div", class_="article-body")
        or soup.find("div", class_="content")
        or soup.find("main")
        or soup.find("div", {"role": "main"})
        or soup.find("body")
    )

    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else slug

    if content:
        for img in content.find_all("img"):
            src = img.get("src", "")
            if src and not src.startswith("http"):
                img["src"] = urljoin(url, src)
        for a in content.find_all("a", href=True):
            href = a["href"]
            if href and not href.startswith("http") and not href.startswith("#"):
                a["href"] = urljoin(url, href)
        md = markdownify.markdownify(str(content), heading_style="ATX", strip=["script", "style", "nav"])
    else:
        md = f"*Could not extract content from {url}*"

    scraped = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    filename = f"{slug}.md"
    final = f"# {title}\n\nSource: {url}\nScraped: {scraped}\n\n---\n\n{md}"
    (out_dir / filename).write_text(final, encoding="utf-8")
    return filename


async def scrape_superhuman(client: httpx.AsyncClient) -> None:
    out_dir = OUTPUT_DIR / "superhuman"
    out_dir.mkdir(parents=True, exist_ok=True)

    start_url = "https://help.superhuman.com/hc/en-us/articles/45237127271699-Guides"
    log(f"[Superhuman] Fetching index: {start_url}")

    resp = await fetch_with_retry(client, start_url)
    if resp is None or resp.status_code != 200:
        log("[Superhuman] Could not fetch index page — skipping.")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    base_domain = "help.superhuman.com"

    article_links: list[tuple[str, str]] = []
    seen_urls: set[str] = set()

    def collect_articles(page_soup: BeautifulSoup, base: str) -> None:
        for a in page_soup.find_all("a", href=True):
            full_url = urljoin(base, a["href"])
            parsed = urlparse(full_url)
            if parsed.netloc == base_domain and "/articles/" in parsed.path and full_url not in seen_urls:
                title = a.get_text(strip=True)
                if title:
                    seen_urls.add(full_url)
                    article_links.append((title, full_url))

    collect_articles(soup, start_url)
    save_article(soup, start_url, "guides-index", out_dir)

    # Also crawl category/section pages
    category_urls: set[str] = set()
    for a in soup.find_all("a", href=True):
        full_url = urljoin(start_url, a["href"])
        parsed = urlparse(full_url)
        if parsed.netloc == base_domain and ("/categories/" in parsed.path or "/sections/" in parsed.path):
            category_urls.add(full_url)

    for cat_url in list(category_urls)[:10]:
        await asyncio.sleep(RATE_LIMIT)
        log(f"  Scanning category: {cat_url}")
        cat_resp = await fetch_with_retry(client, cat_url)
        if cat_resp and cat_resp.status_code == 200:
            collect_articles(BeautifulSoup(cat_resp.text, "html.parser"), cat_url)

    log(f"  Found {len(article_links)} articles")
    toc_lines = ["# Superhuman Help Docs\n\n"]

    for i, (title, url) in enumerate(article_links[:50]):
        await asyncio.sleep(RATE_LIMIT)
        log(f"  [{i+1}/{min(len(article_links), 50)}] {title}")
        art_resp = await fetch_with_retry(client, url)
        if art_resp and art_resp.status_code == 200:
            art_soup = BeautifulSoup(art_resp.text, "html.parser")
            slug = slugify(title) or f"article-{i}"
            filename = save_article(art_soup, url, slug, out_dir)
            toc_lines.append(f"- [{title}](./{filename})\n")
        else:
            log(f"    Skipped: {url}")

    (out_dir / "index.md").write_text("".join(toc_lines), encoding="utf-8")
    log(f"[Superhuman] Done.")


async def scrape_spark(client: httpx.AsyncClient) -> None:
    out_dir = OUTPUT_DIR / "spark"
    out_dir.mkdir(parents=True, exist_ok=True)

    start_url = "https://sparkmailapp.com/help/spark-tutorials"
    log(f"\n[Spark] Fetching index: {start_url}")

    resp = await fetch_with_retry(client, start_url)
    if resp is None or resp.status_code != 200:
        log("[Spark] Could not fetch index page — skipping.")
        return

    soup = BeautifulSoup(resp.text, "html.parser")
    base_domain = "sparkmailapp.com"

    article_links: list[tuple[str, str]] = []
    seen_urls: set[str] = set()

    for a in soup.find_all("a", href=True):
        full_url = urljoin(start_url, a["href"])
        parsed = urlparse(full_url)
        if (
            parsed.netloc == base_domain
            and "/help/" in parsed.path
            and full_url not in seen_urls
        ):
            title = a.get_text(strip=True)
            if title and len(title) > 3:
                seen_urls.add(full_url)
                article_links.append((title, full_url))

    save_article(soup, start_url, "tutorials-index", out_dir)
    log(f"  Found {len(article_links)} help articles")

    toc_lines = ["# Spark Mail Help Docs\n\n"]
    for i, (title, url) in enumerate(article_links[:50]):
        await asyncio.sleep(RATE_LIMIT)
        log(f"  [{i+1}/{min(len(article_links), 50)}] {title}")
        art_resp = await fetch_with_retry(client, url)
        if art_resp and art_resp.status_code == 200:
            art_soup = BeautifulSoup(art_resp.text, "html.parser")
            slug = slugify(title) or f"article-{i}"
            filename = save_article(art_soup, url, slug, out_dir)
            toc_lines.append(f"- [{title}](./{filename})\n")
        else:
            log(f"    Skipped: {url}")

    (out_dir / "index.md").write_text("".join(toc_lines), encoding="utf-8")
    log(f"[Spark] Done.")


async def main() -> None:
    log("=" * 60)
    log("Scraping Superhuman & Spark Help Docs for UX Research")
    log("=" * 60)

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=30.0) as client:
        await scrape_superhuman(client)
        await scrape_spark(client)

    log("\n" + "=" * 60)
    log(f"Output: {OUTPUT_DIR}")
    log("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
