# Products selling — nightly build

The dashboard card reads `productselling.enc` from the site root, next to `sales.enc` and `orders.enc`. The file is BQE1 (AES-256-GCM, PBKDF2-SHA256, 600,000 rounds). The password is the same dashboard password. It is never passed on the command line.

Copy these from this repo onto the machine that runs `/workspace/bq/hosting/build` (the private `refresh_and_publish` flow mirrors these sources):

- `tools/selling/build_products_selling.py`
- `tools/bqcrypt.py` (already used for the other `.enc` files)

The script does not need the pricing workbook. It needs:

1. The daily orders export. Same raw JSON the Sales and Orders pages already use (`L`, `sku`, `st`), or a CSV/XLSX with SKU, date, quantity and status columns.
2. Optional Access workbook (the B&QBB3 sheet, or the pricing catalogue). This is only for the UK / China split and the zero-sales count. Without it, those two figures are left blank.
3. Optional history JSON, kept on the build machine and not committed. Each run appends that day’s distinct-SKU count. Example path: `/workspace/bq/KEEP/products-selling-history.json`.
4. The password in `BQ_PASSWORD` or `BQ_PASSWORD_FILE` (the existing file is `/workspace/bq/KEEP/secrets/dashboard_password.txt`).

```bash
export BQ_PASSWORD_FILE=/workspace/bq/KEEP/secrets/dashboard_password.txt
python3 tools/selling/build_products_selling.py \
  --orders /path/to/orders-raw.json \
  --access /path/to/Access.xlsx \
  --history /workspace/bq/KEEP/products-selling-history.json \
  --html /tmp/productselling.html \
  --enc /path/to/site/productselling.enc
```

Publish `productselling.enc` in the same step as `index.html`, `sales.html`, `orders.html` and `productselling.html`. If the enc file is not there yet, Sales and Orders still unlock; the Products selling card says the nightly file is missing.

Do not commit the orders export, the Access file, the history file, the HTML or `productselling.enc`. They contain SKUs.

Counts use the same day rule as the Sales tab: cancelled orders are dropped, and the last 30 days are the newest order day plus the 29 days before it. Yesterday is the day before that newest order day. A newly selling SKU sold yesterday and in none of the 30 days before yesterday.
