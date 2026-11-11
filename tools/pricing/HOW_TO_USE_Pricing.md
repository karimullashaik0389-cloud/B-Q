# Pricing tab – how to use

Simple steps. Short sentences.

## 1. Open it
1. Open the dashboard. Type the password.
2. Tap **Pricing**.
3. Wait a few seconds. The table loads.
4. To go back, tap **Back** (top left) or use the phone back button.

## 2. Read the top line
The grey line at the top says:
- which **Access file** is used (and its date),
- which **buy box run** is used (and how many SKUs),
- where **Price now** comes from.

If it says the buy box run is **not complete**, some SKUs use the Access buy box instead.

## 3. The boxes at the top (tap one to filter the table)
- **Will change (in upload)** – these go in the upload file.
- **Margin too low** – the buy box is too cheap for us. We keep our price. No change.
- **Raise – held for review** – the rules say we can go up. We do NOT go up unless you say so. All of them are listed in the **Held raises** tab of the Excel file (SKU, current price, proposed price, profit % now vs proposed, 30-day sales, why held). They are never in the upload.
- **Optional penny trim – kept** – our price is only up to 5p (and up to 5% of the price) above the 80% cap price, and nothing else would change (no buy box to chase, no floor to fix). We keep the current price, so there is no upload row. They are listed in the Excel tab **Opt. penny trims (not uploaded)**. Use the filter "Optional penny trims" to see them.
- **Check postage** – multipacks (like "3x ...") and items over 30kg. Check the postage first.
- **Need your review** – no cost, no postage/weight, or £0 price. Fix the data in Access.
- **Blocked (loss / under 50%)** – the price would make a loss or be under 50%. It is never uploaded.
- **Winning – kept** – we have the buy box.
- **All rows** – every row.
- **Duplicate SKU** – the same SKU twice in Access. Only the first row is used.

## 4. The money (same on every tab)
- Total cost = cost + company cost + 15% B&Q fee + postage + collab fee.
- Company cost = cost × 1 for Ashian (China). Cost × 0.5 for others.
- Profit = price − total cost.
- Profit % = profit ÷ cost.
- Postage, in this order (the "Postage rule" column / source shows which one was used):
  1. What you type in **Postage (type here)**.
  2. Special fixed postage: Xmas tree 8ft £3.30, 10ft £4.30; pet bed XL/XXL £3.30; high back stool 2x £3.30, 3x+ £8; fabric folding chair 2x £4.30, 3x+ £8; standard folding chair 2x £3.30, 3x+ £8; suitcase 20in £3.30, 24in/28in £8, suitcase sets £8; tarpaulin 10x15m £3.30, 12x15m £3.30, 15x20m £8; 240L wheelie bins £27; baby high chair £3.30; guitar £3.30; BBQ table £3.30; 3-tier airer £3.30; 9L air fryer £4.30.
  3. Description ending in code H123, H063 or H077 (not CH077 etc.) and over 15.2kg: DPD £14 (to 20kg), £15 (to 25kg), £17 (to 30kg).
  4. The Access "Postage Cost". If that figure equals an old band rate (£1.75 or £2.30, within 0.5p), we use the new rate instead (£1.90 or £2.45). Other Access amounts stay as they are. This mapping is in Settings.
  5. The weight: up to 2000g £1.90, up to 15200g £2.45, up to 20000g £8, up to 25000g £9, up to 30000g £10.50, above that £15. A multi-pack is one parcel (pack weight).
- We use **our** postage rules only. The £1.85 / £2.35 / £5.16 bands in the old master file are deliberately **not** used, so postage can differ from that file on purpose.

## 5. Your own price
1. Type a price in the **Your price** box on a row.
2. The row checks it at once.
3. If it makes a loss or is under 50% on cost, it says **Blocked**. It will not go in the upload.
4. If it is fine, it goes in the upload.
5. Your prices stay after refresh. Clear the box to remove one.

## 6. Two switches
- **Include 100+ sales raises (+10%, max 80%)** – adds the +10% raises to the upload.
- **Include “Check postage” rows** – adds multipacks / over 30kg rows. Only tick after you checked postage.
- **Include optional penny trims** (off by default) – adds the penny trims to the upload, so those prices come down to the 80% cap.

## 7. Download
- **Download B&Q upload** – the file for B&Q. Same layout as the master template. Only changed SKUs. No duplicates. No loss.
- **This table (Excel)** – what you see now, for checking.

## 8. Upload to B&Q
You do this yourself in B&Q (Mirakl): Price import → choose the upload file.
The dashboard never sends anything to B&Q.

## 9. New Access file (optional)
Tap **Choose Access .xlsx**. Pick the new Access_*.xlsx (sheet B&QBB3).
It is read on your device only. Nothing is uploaded.
Tap **Back to the published data** to return.

## 10. Rules in one look
- UK: profit stays between 50% and 80% on cost.
- Rounding: a price set by the 80% cap is rounded **down** to the penny, so it is never over 80%. A floor price is rounded **up**, so it is never under the floor. (Cost under £1 with no sales has floor and cap both 80%: if no penny gives exactly 80%, the cap wins – just under 80%.)
- Postage: our rules only (typed, special list, H-code DPD tiers, Access figure with the old-to-new band mapping above, else weight bands above). The old file's £1.85 / £2.35 / £5.16 bands are not used.
- UK, winning with good sales: keep the price.
- UK, not winning: 1p under the buy box, but never below the floor.
- UK floor with no sales: cost under £1 80%, under £5 70%, under £10 60%, else 50%. With sales: 50%.
- If a UK suggested price would sit under that floor (for example a 0-sales raise that only went up to 50% profit, when the floor is 80/70/60%), we lift the suggestion to the floor price, rounded up to the penny, so profit is just at or above the floor %. Never over the 80% cap, and never a loss. Rows already at or above the floor are not changed. China is not lifted (China raises still never go on the upload). You can turn this off in Settings (`floorLift` = 0). The floors themselves do not change.
- "Sales" means units sold in the last 30 days. We count them from the B&Q orders file. This is the same number the Sales tab uses.
- If the Access file is newer than the orders file, we use the Access "B n Q 30Days" column instead. The grey box at the top tells you which one was used.
- A row with price £0 or blank goes to **NEED YOUR REVIEW**. We do not upload it. Please check the listing.
- China (Ashian): floor 100% on cost. 1p under the buy box, down to the floor.
- Buy box below the floor: keep our price. Shows "Margin too low".
- Never a price with profit £0 or less.
