#!/usr/bin/env python3
"""Scrape Superhuman and Spark help docs into markdown files for UX research."""

import sys
import time
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
import markdownify

OUTPUT_DIR = Path(__file__).parent.parent / "docs" / "ux-research"
RATE_LIMIT = 1.0  # seconds between requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def slugify(text: str) -> str:
    """Convert text to a filesystem-safe slug."""
    text = re.sub(r'[^\w\s-]', '', text.lower())
    return re.sub(r'[\s_]+', '-', text).strip('-')[:80]


def scrape_superhuman(client: httpx.Client):
    """Scrape Superhuman Help Center guides."""
    out_dir = OUTPUT_DIR / "superhuman"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Start from the guides page
    start_url = "https://help.superhuman.com/hc/en-us/articles/45237127271699-Guides"
    print(f"[Superhuman] Fetching index: {start_url}")
    
    resp = client.get(start_url)
    if resp.status_code != 200:
        print(f"  ERROR: {resp.status_code}")
        return
    
    soup = BeautifulSoup(resp.text, "html.parser")
    
    # Find all article links in the page
    article_links = []
    base_domain = "help.superhuman.com"
    
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full_url = urljoin(start_url, href)
        parsed = urlparse(full_url)
        if parsed.netloc == base_domain and "/articles/" in parsed.path:
            title = a.get_text(strip=True)
            if title and full_url not in [l[1] for l in article_links]:
                article_links.append((title, full_url))
    
    # Also scrape the guides page itself
    _save_article(soup, start_url, "guides-index", out_dir)
    
    # Now try to find more content by checking category pages
    category_urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full_url = urljoin(start_url, href)
        parsed = urlparse(full_url)
        if parsed.netloc == base_domain and ("/categories/" in parsed.path or "/sections/" in parsed.path):
            category_urls.add(full_url)
    
    # Scrape category pages for more article links
    for cat_url in list(category_urls)[:10]:
        time.sleep(RATE_LIMIT)
        print(f"  Scanning category: {cat_url}")
        try:
            resp = client.get(cat_url)
            if resp.status_code == 200:
                cat_soup = BeautifulSoup(resp.text, "html.parser")
                for a in cat_soup.find_all("a", href=True):
                    href = a["href"]
                    full_url = urljoin(cat_url, href)
                    parsed = urlparse(full_url)
                    if parsed.netloc == base_domain and "/articles/" in parsed.path:
                        title = a.get_text(strip=True)
                        if title and full_url not in [l[1] for l in article_links]:
                            article_links.append((title, full_url))
        except Exception as e:
            print(f"    Error: {e}")
    
    print(f"  Found {len(article_links)} articles")
    
    # Scrape each article
    toc_lines = ["# Superhuman Help Docs\n\n"]
    for i, (title, url) in enumerate(article_links[:50]):  # cap at 50 articles
        time.sleep(RATE_LIMIT)
        print(f"  [{i+1}/{min(len(article_links),50)}] {title}")
        try:
            resp = client.get(url)
            if resp.status_code == 200:
                art_soup = BeautifulSoup(resp.text, "html.parser")
                slug = slugify(title) or f"article-{i}"
                filename = _save_article(art_soup, url, slug, out_dir)
                toc_lines.append(f"- [{title}](./{filename})\n")
            else:
                print(f"    HTTP {resp.status_code}")
        except Exception as e:
            print(f"    Error: {e}")
    
    # Write TOC
    (out_dir / "index.md").write_text("".join(toc_lines))
    print(f"[Superhuman] Done. {len(article_links)} articles scraped.")


def scrape_spark(client: httpx.Client):
    """Scrape Spark Mail tutorials."""
    out_dir = OUTPUT_DIR / "spark"
    out_dir.mkdir(parents=True, exist_ok=True)

    start_url = "https://sparkmailapp.com/help/spark-tutorials"
    print(f"\n[Spark] Fetching index: {start_url}")
    
    resp = client.get(start_url)
    if resp.status_code != 200:
        print(f"  ERROR: {resp.status_code}")
        return
    
    soup = BeautifulSoup(resp.text, "html.parser")
    
    # Find tutorial links
    article_links = []
    base_domain = "sparkmailapp.com"
    
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full_url = urljoin(start_url, href)
        parsed = urlparse(full_url)
        if parsed.netloc == base_domain and "/help/" in parsed.path:
            title = a.get_text(strip=True)
            if title and len(title) > 3 and full_url not in [l[1] for l in article_links]:
                article_links.append((title, full_url))
    
    # Save the index page
    _save_article(soup, start_url, "tutorials-index", out_dir)
    
    print(f"  Found {len(article_links)} help articles")
    
    # Scrape each
    toc_lines = ["# Spark Mail Help Docs\n\n"]
    for i, (title, url) in enumerate(article_links[:50]):
        time.sleep(RATE_LIMIT)
        print(f"  [{i+1}/{min(len(article_links),50)}] {title}")
        try:
            resp = client.get(url)
            if resp.status_code == 200:
                art_soup = BeautifulSoup(resp.text, "html.parser")
                slug = slugify(title) or f"article-{i}"
                filename = _save_article(art_soup, url, slug, out_dir)
                toc_lines.append(f"- [{title}](./{filename})\n")
            else:
                print(f"    HTTP {resp.status_code}")
        except Exception as e:
            print(f"    Error: {e}")
    
    (out_dir / "index.md").write_text("".join(toc_lines))
    print(f"[Spark] Done. {len(article_links)} articles scraped.")


def _save_article(soup: BeautifulSoup, url: str, slug: str, out_dir: Path) -> str:
    """Extract article content and save as markdown. Returns filename."""
    # Try to find the main content area
    content = (
        soup.find("article") or
        soup.find("div", class_="article-body") or
        soup.find("div", class_="content") or
        soup.find("main") or
        soup.find("div", {"role": "main"})
    )
    
    if not content:
        content = soup.find("body")
    
    # Get title
    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else slug
    
    # Convert to markdown
    if content:
        # Make image URLs absolute
        for img in content.find_all("img"):
            src = img.get("src", "")
            if src and not src.startswith("http"):
                img["src"] = urljoin(url, src)
        
        # Make links absolute
        for a in content.find_all("a", href=True):
            href = a["href"]
            if href and not href.startswith("http") and not href.startswith("#"):
                a["href"] = urljoin(url, href)
        
        md = markdownify.markdownify(str(content), heading_style="ATX", strip=["script", "style", "nav"])
    else:
        md = f"*Could not extract content from {url}*"
    
    # Build final markdown
    filename = f"{slug}.md"
    final = f"# {title}\n\n**Source:** {url}\n\n---\n\n{md}"
    
    (out_dir / filename).write_text(final)
    return filename


def main():
    print("=" * 60)
    print("Scraping Superhuman & Spark Help Docs for UX Research")
    print("=" * 60)
    
    with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30.0) as client:
        scrape_superhuman(client)
        scrape_spark(client)
    
    print("\n" + "=" * 60)
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
