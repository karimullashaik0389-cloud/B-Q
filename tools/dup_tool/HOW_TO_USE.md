# B&Q Duplicate tool - step by step

Do the steps in order. Copy each grey line exactly. The tool only reads; it never changes B&Q or your files.

## A. Get fresh exports (every time, before running)
1. B&Q / Mirakl portal -> My Inventory -> Offers -> Export -> **All offers** (include inactive / 0 stock) -> CSV. Do not filter.
2. Mirakl -> Catalog -> Products -> Export (Excel). Gives `export-products-<date>.xlsx`.
3. Mirakl -> Orders -> Export orders, date range = last 3 months -> CSV. (More than one file is fine.)
4. Your Access file (`Access_<date>.xlsx`, columns sku / Variant code / Reviews / seller / product_url).

## B. On the box (Grok Bot's computer)
1. Put the files in `/workspace/bq` (or your Downloads). The tool picks the newest of each by itself.
2. Run:

       cd /workspace/bq/dup_tool
       python3 find_duplicates.py --live --ai

   - `--live` checks every public B&Q page (about 1 per second; first run of the day ~15-25 min, reruns use saved pages).
   - `--ai` is optional (free Gemini key already on the box). First time it adds ~40 min (free-tier speed); answers are saved, so reruns are fast. Leave it out and it works the same with rule scores.
3. If it prints `STOPPED: ...`, read the sentence: it says which file is missing or wrong. Fix it and run step 2 again.
4. Open the results:
   - `/workspace/send/B&Q Duplicates Final <date>.xlsx`
   - `/workspace/send/delete_list_<date>.csv`
   - `/workspace/bq/dup_tool/out/dashboard_dup.json` (for the dashboard Duplicates card)
5. Read the **Summary** sheet first: Warnings line, export dates, order date range.

## C. On Windows (your own PC)
1. Install Python 3 from https://www.python.org/downloads/ (tick **Add python.exe to PATH**).
2. Open **Command Prompt** and run once:

       pip install pandas openpyxl numpy

   (`curl` is already part of Windows 10/11.)
3. Copy the `dup_tool` folder (from GitHub B-Q) to e.g. `C:\dup_tool`.
4. Put your exports in one folder, e.g. `C:\bq`.
5. Run (one line, change the file names to yours):

       cd C:\dup_tool
       python find_duplicates.py --offers "C:\bq\offers.csv" --products "C:\bq\export-products-XXXX.xlsx" --access "C:\bq\Access_XXXX.xlsx" --orders "C:\bq\orders1.csv" "C:\bq\orders2.csv" --live --out "C:\bq\out"

6. Results are in `C:\bq\out`. Dashboard data is in `C:\dup_tool\out\dashboard_dup.json`.
7. Optional AI second opinion on Windows: `set GEMINI_API_KEY=<your key>` in the same window, then add `--ai`. Never paste the key in a file.

## D. What to do with the results
1. **DELETE LIST** - safe to remove with no more checks (no sales or low per the rules, no reviews, weaker than the kept copy, both pages live). You delete them yourself in Mirakl; the tool never does.
2. **Fix list** - kept listings with weak photos / title / description / key points. Fix these.
3. **Keep both - fix** - two copies selling about the same. Keep both; fix if listed.
4. **Check** - a person must look (reviews on the weaker copy, page missing, pack size differs, lower seller has the better listing, ...). The "Why" column says what to check.
5. **All groups** - everything, with the reason each duplicate exists.

## E. Change the rules (optional)
1. Open `find_duplicates.py`, top of the file:
   - `HIGH_SALES = 10` (high vs low seller), `SIMILAR_PCT = 30` (similar sales), `LOW_SIMILAR_UNITS = 2`, `FIX_BELOW = 6`.
2. Save and run again (step B2 / C5).

## F. Check the tool still works (after any change)

       cd /workspace/bq/dup_tool
       python3 tests/test_tool.py
       python3 tests/test_regression_real.py

1. The first must end with `35/35 tests passed`.
2. The second (box only) must end with `PASS 29 Oct regression`.

## G. Useful extra options
- Name files yourself: `--offers F --products F --access F --orders F1 F2 ...`
- Use only named files, no auto-pick: `--no-auto`
- Compare with a different earlier list: `--prev-list "<file>.xlsx"`
- Different output folder: `--out <folder>`; skip dashboard file: `--dashboard ""`
- Slower page checks: `--delay 2`
