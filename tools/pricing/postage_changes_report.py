#!/usr/bin/env python3
"""Postage-fix change report: old vs new engine result.json -> xlsx. Profit is re-checked here with independent maths."""
import json, re, sys, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
old_p, new_p, oldup, newup, out = sys.argv[1:6]
O = json.load(open(old_p))['rows']; N = json.load(open(new_p))['rows']
assert len(O) == len(N) and all(a['sku'] == b['sku'] for a, b in zip(O, N))
def up(p):
    ws = openpyxl.load_workbook(p, data_only=True).active
    return {r[0]: r[1] for r in ws.iter_rows(min_row=3, values_only=True) if r[0]}
uo, un = up(oldup), up(newup)
def prof(r, price):  # independent: 0.85*price - cost*mult - postage - collab
    if r['cost'] in (None, '') or r['post'] is None or price is None: return None, None
    p = 0.85 * price - r['cost'] * r['mult'] - r['post'] - (r['collab'] or 0)
    return round(p + 1e-9, 2), (p / r['cost'] if r['cost'] else None)  # +1e-9: half-penny float edge (e.g. 7.245) rounds up like the engine
H = ['SKU', 'Description', 'Weight (g)', 'Old postage', 'Old postage source', 'New postage', 'Rule (new source)', 'Current price', 'Old profit £', 'Old profit %', 'New profit £', 'New profit %',
     'Floor % (unchanged)', 'Old status', 'New status', 'Old upload price', 'New upload price', 'Upload price changed?', 'Now a loss?', 'Now below floor?', 'Note']
rows = []; bad = 0
for a, b in zip(O, N):
    hcode = bool(re.search(r'(?:^|-)\s*(H123|H063|H077)\s*$', b.get('title') or '', re.I))
    if a['post'] == b['post'] and not hcode: continue
    op, opc = prof(a, a['price']); np_, npc = prof(b, b['price'])
    if b.get('profit') is not None and np_ is not None and abs(np_ - b['profit']) > 0.006: bad += 1; print('profit mismatch', b['sku'], np_, b['profit'])
    note = []
    if a['post'] == b['post']: note.append('postage unchanged (H-code row, listed for the record)')
    if 'Suitcase set' in (b.get('postSrc') or ''): note.append('suitcase set at £8 large rate = assumption from 26 Oct rules; confirm a set ships as one parcel')
    if b.get('postSrc') in ('Special: Baby high chair',): note.append('rule from the 26 Oct 2026 list (not on the 2 Nov handwritten note)')
    if 'Wheelie bin' in (b.get('postSrc') or ''): note.append('£27 per 27 Oct 2026 instruction; weight left as is')
    if b.get('check'): note.append('Check postage: ' + b['check'])
    oldbelow = opc is not None and a.get('floorPct') is not None and opc < a['floorPct'] - 1e-9
    loss = np_ is not None and np_ <= 0; below = npc is not None and b.get('floorPct') is not None and npc < b['floorPct'] - 1e-9
    rows.append([b['sku'], b['title'], b.get('w'), a['post'], a.get('postSrc'), b['post'], b.get('postSrc'), b['price'], op, opc, np_, npc, b.get('floorPct'), a['status'], b['status'],
                 uo.get(b['sku']), un.get(b['sku']), 'YES' if uo.get(b['sku']) != un.get(b['sku']) else 'no', 'YES' if loss else 'no', ('YES – new' if not oldbelow else 'YES – was already below') if below else 'no', '; '.join(note)])
rows.sort(key=lambda r: (r[3] == r[5], r[6] or '', r[0]))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Postage changes'; ws.append(H)
for r in rows: ws.append(r)
hf = PatternFill('solid', fgColor='1F3864'); red = PatternFill('solid', fgColor='FFC7CE')
for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = hf; c.alignment = Alignment(wrap_text=True, vertical='center')
for i, wd in enumerate([22, 46, 10, 10, 18, 10, 28, 10, 10, 10, 10, 10, 10, 22, 22, 11, 11, 10, 9, 10, 60]): ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = wd
for r in range(2, len(rows) + 2):
    for c in 'DFHIKPQ': ws[f'{c}{r}'].number_format = '£#,##0.00'
    for c in 'JLM': ws[f'{c}{r}'].number_format = '0%'
    for c in 'ST':
        if str(ws[f'{c}{r}'].value).startswith('YES'): ws[f'{c}{r}'].fill = red
ws.freeze_panes = 'B2'; ws.auto_filter.ref = f'A1:U{len(rows) + 1}'
chg = [r for r in rows if r[3] != r[5]]
S = wb.create_sheet('Summary')
for l in [['Postage fix 2 Nov 2026 – shared engine bq_price.js v4 (special fixed postage + H123/H063/H077 DPD tiers)'], [],
          ['SKUs whose postage changed', len(chg)], ['H-code rows listed (postage unchanged)', len(rows) - len(chg)],
          ['Now a loss at current price', sum(r[18] == 'YES' for r in rows)], ['Below floor at current price (new / already before)', '%d / %d' % (sum(r[19] == 'YES – new' for r in rows), sum(r[19] == 'YES – was already below' for r in rows))],
          ['Upload rows old / new', '%d / %d' % (len(uo), len(un))], ['Upload rows added', ', '.join(sorted(set(un) - set(uo))) or 'none'], ['Upload rows removed', ', '.join(sorted(set(uo) - set(un))) or 'none'],
          ['Upload prices changed', ', '.join(k for k in sorted(set(uo) & set(un)) if uo[k] != un[k]) or 'none'],
          ['Profit = 0.85 x price - cost x 2 (Ashian) / 1.5 (others) - postage - collab. Re-checked independently here; mismatches vs engine', bad],
          ['Profit % = profit / cost. Floors unchanged. Prices of already-winning and kept rows are unchanged (nothing is repriced by this fix).']]: S.append(l)
S.column_dimensions['A'].width = 70; S.column_dimensions['B'].width = 40; S['A1'].font = Font(bold=True)
wb.save(out); print(json.dumps({'listed': len(rows), 'changed': len(chg), 'loss': sum(r[18] == 'YES' for r in rows), 'below_new': sum(r[19] == 'YES – new' for r in rows), 'below_already': sum(r[19] == 'YES – was already below' for r in rows), 'upload_changed': sum(r[17] == 'YES' for r in rows), 'profit_mismatch': bad}))
