# Updated copy (2 Nov 2026): cache-busting + "fetched_at" column + optional saved links.
#  - every request sends Cache-Control: no-cache and Pragma: no-cache
#  - product pages get ?_ts=<epoch ms> (or &_ts= when the link already has a ?) so the page is always fresh
#  - if the input Excel has a "product_url" column (saved diy.com links), those links are used and the search is skipped
#  - output gets a "fetched_at" column (local time of the product page request)
# Same input/output file names as before. Original: bq_buybox_from_codes_excel.py
import time
import re
import datetime
from urllib.parse import quote_plus, urlparse, parse_qs, unquote, urlsplit, urlunsplit, parse_qsl, urlencode

import requests
from bs4 import BeautifulSoup, NavigableString
import pandas as pd

INPUT_EXCEL = "bq_codes.xlsx"              # input Excel with product codes
OUTPUT_EXCEL = "bq_buybox_from_codes.xlsx" # output Excel with seller + price + reviews

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def bust(url: str) -> str:
    """Add _ts=<epoch ms> (replacing any old _ts) so no cache can return an old page."""
    u = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != "_ts"]
    q.append(("_ts", str(int(time.time() * 1000))))
    return urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), u.fragment))

PHRASES = [
    "sold & shipped by",
    "sold and shipped by",
    "sold by",
]

PRICE_REGEX = r"£\s*\d[\d,]*(?:\.\d{2})?"


# ---------- helpers ----------

def normalize_product_url(url: str) -> str:
    """
    If B&Q returns a login/register URL with redirectTo=..., unwrap it
    and return the real product URL.
    """
    if "/customer/register" in url or "/customer/sign-in" in url or "/customer/login" in url:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        redirect_to = qs.get("redirectTo", [None])[0]
        if redirect_to:
            redirect_to = unquote(redirect_to)
            if not redirect_to.startswith("http"):
                return "https://www.diy.com" + redirect_to
            return redirect_to
    return url


def get_product_url_for_code(code: str):
    """
    Use B&Q search to resolve a product code to a product URL.
    """
    search_term = quote_plus(code.strip())
    search_url = f"https://www.diy.com/search?term={search_term}"

    try:
        resp = requests.get(search_url, headers=HEADERS, timeout=20)
    except Exception as e:
        return None, f"ERROR requesting search: {e}"

    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code} on search"

    soup = BeautifulSoup(resp.text, "html.parser")

    # First link that looks like a product (ends with _BQ.prd)
    link = soup.find("a", href=lambda h: h and "_BQ.prd" in h)
    if not link or not link.get("href"):
        return None, "No product link found on search page"

    href = link["href"]
    if href.startswith("http"):
        url = href
    else:
        url = "https://www.diy.com" + href

    url = normalize_product_url(url)
    return url, "OK"


def remove_scripts_and_styles(soup: BeautifulSoup):
    for tag in soup(["script", "style"]):
        tag.decompose()


def find_sold_text_node(soup: BeautifulSoup):
    """
    Find the first text node in normal HTML (not script/style) that
    contains 'Sold & shipped by' or 'Sold by'.
    """
    for node in soup.find_all(string=True):
        if not isinstance(node, NavigableString):
            continue
        parent = node.parent
        if not parent or parent.name in ("script", "style"):
            continue
        text = str(node).strip()
        if not text:
            continue
        lower = text.lower()
        if any(phrase in lower for phrase in PHRASES):
            return node
    return None


def extract_seller_from_container(container):
    """
    Given the small HTML block that contains the sold text, get the seller name.
    """
    # Prefer a link (marketplace seller name is usually clickable)
    link = container.find("a")
    if link:
        name = link.get_text(strip=True)
        if name:
            return name

    # Otherwise parse raw text e.g. "Sold & shipped by B&Q"
    full_text = container.get_text(" ", strip=True)
    lower = full_text.lower()
    for phrase in PHRASES:
        if phrase in lower:
            idx = lower.find(phrase) + len(phrase)
            seller = full_text[idx:].strip(" :-\u00a0")
            return seller.strip()

    return ""


def find_price_near_container(container):
    """
    Walk forward from the seller container in the DOM and return the first
    '£' price found in normal text (not scripts/styles), ignoring the
    'Save up to £100 a year' banner.
    """
    node = container
    steps = 0
    while node is not None and steps < 400:
        node = node.next_element
        steps += 1
        if not isinstance(node, NavigableString):
            continue
        parent = node.parent
        if not parent or parent.name in ("script", "style"):
            continue

        text = str(node)
        lower = text.lower()

        # Ignore club banner text
        if "save up to £100 a year" in lower:
            continue

        m = re.search(PRICE_REGEX, text)
        if m:
            price = m.group(0).replace(" ", "")
            return price

    return ""


def get_review_count(html: str):
    """
    Extract the review count from the full product HTML.
    Returns (reviews_str, reason).
    """
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)

    patterns = [
        r"from\s+(\d+)\s+product reviews",
        r"from\s+(\d+)\s+reviews",
        r"\((\d+)\)\s*reviews?",
    ]

    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1), "OK"

    # Last-resort fallback: any "(123)" – only if not zero
    m = re.search(r"\((\d+)\)", text)
    if m and m.group(1) != "0":
        return m.group(1), "OK (fallback)"

    return "", "Reviews not found"


def get_seller_price_reviews(product_url: str):
    """
    Given a B&Q product URL, return (seller, price, reviews, status).
    """
    try:
        resp = requests.get(bust(product_url), headers=HEADERS, timeout=20)
    except Exception as e:
        return "", "", "", f"ERROR requesting product page: {e}"

    if resp.status_code != 200:
        return "", "", "", f"HTTP {resp.status_code} on product page"

    html = resp.text

    # Reviews use the full HTML (we keep scripts/styles for context)
    reviews, reviews_reason = get_review_count(html)

    soup = BeautifulSoup(html, "html.parser")
    remove_scripts_and_styles(soup)

    sold_node = find_sold_text_node(soup)
    if not sold_node:
        return "", "", reviews, f"No 'Sold & shipped by' / 'Sold by' text found; reviews: {reviews_reason}"

    container = sold_node.parent

    seller = extract_seller_from_container(container)
    seller_reason = "OK" if seller else "Seller text found but name not parsed"
    if not seller:
        seller = "UNKNOWN"

    price = find_price_near_container(container)
    price_reason = "OK" if price else "Price not found near seller block"

    status = f"seller: {seller_reason}; price: {price_reason}; reviews: {reviews_reason}"
    return seller, price, reviews, status


SAVED_LINKS = {}


def load_codes_from_excel(path: str):
    """
    Read codes from the FIRST column of the Excel file.
    Header can be anything (code, sku, etc.).
    Optional column "product_url": saved diy.com product links (used instead of searching).
    """
    df = pd.read_excel(path, dtype=str)
    first_col = df.columns[0]
    url_col = next((c for c in df.columns if str(c).strip().lower().replace(" ", "_") == "product_url"), None)
    codes = []
    for i, x in enumerate(df[first_col].astype(str).tolist()):
        x = x.strip()
        if x.endswith(".0"):
            x = x[:-2]
        if not x or x.lower() == "nan":
            continue
        codes.append(x)
        if url_col is not None:
            u = str(df[url_col].iloc[i]).strip()
            if u.startswith("http") and "_BQ.prd" in u:
                SAVED_LINKS[x] = u
    return codes


# ---------- main ----------

def main():
    codes = load_codes_from_excel(INPUT_EXCEL)
    print(f"Found {len(codes)} product codes to check.")

    results = []

    for i, code in enumerate(codes, start=1):
        print(f"{i}/{len(codes)} - Code: {code}")

        if code in SAVED_LINKS:
            product_url, url_status = SAVED_LINKS[code], "saved link"
        else:
            product_url, url_status = get_product_url_for_code(code)

        if not product_url:
            print(f"   Could not resolve URL: {url_status}")
            results.append(
                {
                    "code": code,
                    "product_url": "",
                    "seller": "",
                    "price": "",
                    "reviews": "",
                    "status": url_status,
                    "fetched_at": "",
                }
            )
            time.sleep(1.5)
            continue

        print(f"   Product URL: {product_url}")

        fetched_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        seller, price, reviews, info_status = get_seller_price_reviews(product_url)

        results.append(
            {
                "code": code,
                "product_url": product_url,
                "seller": seller,
                "price": price,
                "reviews": reviews,
                "status": f"{url_status}; {info_status}",
                "fetched_at": fetched_at,
            }
        )

        # Be polite to B&Q
        time.sleep(1.5)

    df_out = pd.DataFrame(results)
    df_out.to_excel(OUTPUT_EXCEL, index=False)
    print(f"Done. Saved {len(results)} rows to {OUTPUT_EXCEL}")


if __name__ == "__main__":
    main()
