# data/

Encrypted uploads from the dashboard's **Access** tab. Everything here is encrypted in the browser
with the dashboard password (AES-256-GCM, `BQE1` format) before it is uploaded - nothing readable is stored.

- `all_variant_<date>_<time>.enc` - "Update All variant" uploads (newest one is used).
- `codes_<date>_<time>.enc` - EAN lists for the buy box check (newest one is used).

Upload new files with GitHub's "Add file > Upload files" page for this folder (see HOW_TO_USE_tabs.md).
