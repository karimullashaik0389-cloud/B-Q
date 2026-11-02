"""Python bridge to THE shared engine bq_price.js (runs it with node) – so Python outputs use the identical function."""
import json, subprocess, tempfile, os
HERE = os.path.dirname(os.path.abspath(__file__))
def run(payload):
    with tempfile.TemporaryDirectory() as d:
        i, o = os.path.join(d, 'i.json'), os.path.join(d, 'o.json')
        json.dump(payload, open(i, 'w'))
        subprocess.run(['node', os.path.join(HERE, 'engine_cli.js'), i, o], check=True)
        return json.load(open(o))['out']
def calc(items): return run({'op': 'calc', 'items': items})
def postage(items): return run({'op': 'postage', 'items': items})
def post_info(items): return run({'op': 'postInfo', 'items': items})
def decide_all(rows, opt=None): return run({'op': 'decideAll', 'rows': rows, 'opt': opt or {}})
def from_access(aoa, ov=None, opt=None): return run({'op': 'fromAccess', 'aoa': aoa, 'ov': ov or {}, 'opt': opt or {}})
