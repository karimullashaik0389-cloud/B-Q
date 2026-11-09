"""Set plain input cells in an xlsx without dropping formulas. Test helper only."""
import re, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
edits = []
for arg in sys.argv[3:]:
    sheet, sku, col, val = arg.split("|")
    edits.append((sheet, sku, col, val))
zin = zipfile.ZipFile(src)
rels = zin.read("xl/_rels/workbook.xml.rels").decode()
wb = zin.read("xl/workbook.xml").decode()
rid_to_file = {m.group(1): m.group(2) for m in re.finditer(r'Id="(rId\d+)"[^>]*Target="worksheets/([^"]+)"', rels)}
name_to_file = {}
for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb):
    name_to_file[m.group(1).replace("&amp;", "&")] = "xl/worksheets/" + rid_to_file[m.group(2)]
zout = zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    for sheet, sku, col, val in edits:
        if item.filename != name_to_file.get(sheet):
            continue
        xml = data.decode()
        found = None
        for rm in re.finditer(r'<row r="(\d+)"[^>]*>.*?</row>', xml, flags=re.S):
            if re.search(r'<c r="A%s"[^>]*>.*?<v>%s</v>' % (rm.group(1), re.escape(sku)), rm.group(0)):
                found = rm
                break
        if not found:
            raise SystemExit("no %s on %s" % (sku, sheet))
        rr = found.group(1)
        cell = col + rr
        body = re.sub(r'<c r="%s"[^>]*>.*?</c>' % cell, "", found.group(0))
        body = body.replace("</row>", '<c r="%s"><v>%s</v></c></row>' % (cell, val))
        xml = xml[:found.start()] + body + xml[found.end():]
        data = xml.encode()
    zout.writestr(item, data)
zout.close()
