# B&Q duplicate listings tool - how it works

What it does
- Finds offers on B&Q that are really the same product listed more than once, and says which copy to keep and which can be deleted.
- It only reads files and public B&Q pages. It never changes or deletes anything on B&Q, and it does not change your files.

How to run it (one command)
    cd /workspace/bq/dup_tool
    python3 find_duplicates.py --live --ai
- With no file names, it picks the newest files on the box itself:
  - offers: newest Mirakl offer export (csv with Offer SKU / Product SKU / Activated / Quantity)
  - products: newest catalog export (export-products-*.xlsx, sheet Data)
  - access: newest Access_*.xlsx (gives the variant code for each SKU)
  - orders: every Mirakl orders csv/xlsx it can find (merged; the same order line is counted once)
- You can name the files yourself:
    python3 find_duplicates.py --offers offers.csv --products export-products-XXXX.xlsx --orders orders.csv orders2.csv --live
- --live checks each listing's public B&Q page (about 1 page a second). Pages are saved in cache/pages_<date>, so a second run the same day uses the saved pages and gives the same answer.
- Without --live nothing can be marked "Delete (verified)"; those offers go to Check.
- Before running, export a fresh FULL offer list (all offers, including inactive) from the B&Q/Mirakl portal so the tool sees 0-stock listings too.

Step 1 - load every listing
- All offers in the export, active and inactive (B&Q turns an offer inactive when stock is 0).

Step 2 - find duplicate groups
- Two offers are linked if they have: the same EAN; the same variant code (from Access); or the same / near-identical title within the same SKU stem (the SKU without its last -number, e.g. ABC-DEF-1 and ABC-DEF-01).
- Links are chained, so groups of 3, 4 or more are found.
- Same title alone is NOT enough across different SKU stems, because colour and size variants often share one title.
- Each group gets a plain "Why duplicated" note, e.g. "same EAN listed under two offer SKUs (-1 vs -01)", "new EAN created for same product", "same title, different EAN", "pack size differs".
- "New vs earlier list" shows if the group was already in the last duplicate list.

Step 3 - status and strength
- Activated / Quantity / Inactivity reason come from the offer export.
- Strength (0-100) adds up five scores out of 10, then doubles them: photos (count, main photo size), title (length near 121-124, product type, size/pack, colour/material, use words, no repeats, no SuperGift/OVOVO, not cut off), description (length, facts, readability, no pasted image-prompt text), key points, and attributes filled.
- Invalid EAN check digit or a "DO NOT USE" category takes points off.
- The live page is used when it loads; otherwise the catalog export.

Settings (top of find_duplicates.py)
- HIGH_SALES = 10 units: at or above is a high seller, below is a low seller.
- SIMILAR_PCT = 30: two high sellers within 30% of each other have "similar" sales.
- LOW_SIMILAR_UNITS = 2: two low sellers within 2 units have "similar" sales.
- FIX_BELOW = 6: a kept listing needs a fix when its photo, title, description or key points score is below 6/10.
- variant_merges.json (next to the script, not on GitHub): variant codes known to be the same product (from the 29 Oct list), e.g. {"CODE-A": "CODE-B"}. Add more lines when you find more.
- Sales are units in the order files for the date range shown on the Summary sheet (cancelled lines left out).

Step 4 - pick the copy to keep (a recommendation - you make the final call)
- Order: has sales, then most units, then active over inactive, then strength, reviews, our buy box, lower price.
- One active copy + inactive copies: the active one is kept; the inactive ones go to delete. Exception: if an inactive copy is clearly the stronger listing, it goes to Check (copy its photos/text to the kept copy first).
- All active or all inactive: the strongest copy is kept.
- Kept copies are "Keep - fix" (with what to fix: images / title / description / bullets) or "Keep - no fix".

Step 5 - when two or more copies have sales
- Case 1 - similar sales (both 10+ and within 30%, or both under 10 and within 2 units): keep BOTH, each "Keep - fix" or "Keep - no fix". Shown on the "Keep both - fix" sheet. Never deleted.
- Case 2 - one copy 10+ and the other under 10:
  - the lower one has ANY reviews: Check.
  - no reviews and its listing is also weaker (strength and reviews not better): DELETE LIST.
  - no reviews but its listing is stronger: Check (move its content first?).
- Case 3 - the 10+ seller with good reviews is kept ("Keep - fix" only if its listing has real gaps); its duplicate with no reviews, under 10 sales and a poorer listing goes to the DELETE LIST.
- Anything else (e.g. 40 vs 15 units, or 8 vs 1 unit): Check.

Step 6 - safety checks before anything is called deletable
- A copy with no sales but with reviews or sales signs on its page: Check.
- A copy goes on the DELETE LIST only if: no reviews, no sales signs, its own page was checked, the kept copy's page is live, pack sizes match, the kept copy is not inactive while this one is active, and its listing is not stronger than the kept one.
- Every DELETE LIST row shows the kept-instead SKU, units of both, reviews of both, strength of both, and both live page results.
- Optional --ai: a second opinion from Gemini (key already saved on the box as GEMINI_API_KEY; only public listing text is sent). If it rates a delete row clearly stronger than its kept copy, the row moves to Check. Without the key the tool works the same with rule-based scores.
- Anything unclear (page missing, failed to load, different pack sizes, EAN selling under another SKU) is "Check".

Regression test
- regress.py rebuilds the 29 Oct list from its source (user_file_2026-10-29_1601.xlsx, Paste Here) with the same grouping rules and compares group by group. The result is on the Summary sheet.

What a public B&Q page can and cannot show
- Can show: page live or missing, title, photos, description, key points, reviews and rating (shared by all sellers on that page), who has the buy box, whether our offer (Diva Package) is shown and in stock, price.
- Cannot show: how many units an offer sold. "Bought in the last 48 hours" style badges are drawn by the browser, not in the page, so they usually cannot be seen. Sales come from our order exports only.

Output (in /workspace/send)
- B&Q Duplicates Final <date>.xlsx
  - DELETE LIST - safe to delete with no further checks: no sales, no reviews, weaker than a kept copy whose page is live.
  - All groups - every group and offer with scores, status, sales, reviews, decision and why.
  - Check - anything that needs a person to look.
  - Keep both - fix - groups where two copies sell about the same (both kept).
  - Fix list - kept offers that need fixing, and what to fix.
  - Summary - counts, files used, date ranges, top 10 groups by sales, failed pages.
  - How it works - this text.
- delete_list_<date>.csv - the DELETE LIST as a csv (Offer SKU, EAN, group, link, kept instead, reason).

- out/dashboard_dup.json - the same results for the Duplicates card on the dashboard (summary counts, delete list, fix list, check list, all groups with why and decision). Public B&Q links only, no keys.

Testing
    python3 tests/test_tool.py
- 35 checks on made-up sample data (no internet, no real data): groups of 2, 3 and 4+, all inactive, one active, similar sales (keep both), 10+ vs under 10 with and without reviews, stronger lower seller, page missing (404), kept page missing, colour variants not merged, wrong / missing / swapped files, old export and no-inactive warnings, CSV vs XLSX, no --live = no deletes, rerun gives identical files, dashboard JSON matches the workbook, regression helper.
    python3 tests/test_regression_real.py
- On the box only: rebuilds the 29 Oct list from its own source file and compares (skips if those files are not there).
