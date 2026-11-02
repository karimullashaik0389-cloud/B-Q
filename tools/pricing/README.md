# Pricing tab (6th dashboard tab)

Code only. No real data, no keys. Real data is in client-side encrypted `.enc` files.

- `bq_price.js` – the one pricing engine. Used by the Pricing tab, the Sales/Orders tabs and the Excel outputs.
- `site/tabs_pricing.js` – the Pricing tab UI.
- `build_pricing.py` – builds `pricing.enc` and the two Excel files (Pricing workbook + B&Q price upload).
- `engine.py` / `engine_cli.js` – Python bridge to the same engine (runs it with node).
- `apply_app_patch.py` – makes the Sales/Orders app use `bq_price.js`.
- `verify_excel.py`, `master_match.py` – checks (Excel formulas = engine; formulas = master copy).
- `tests/` – engine unit tests and Playwright tests. `testdata/` is MADE-UP data.
  The 50,000-row file is made by `python3 tests/make_big_testdata.py`.
- `HOW_TO_USE_Pricing.md` – simple guide.
