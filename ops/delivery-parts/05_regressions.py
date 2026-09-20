from pathlib import Path

p=Path('tests/delivery-checks.mjs')
s=p.read_text()
s="import { Buffer } from 'node:buffer';\nimport process from 'node:process';\nimport { URL } from 'node:url';\nconst { fetch, console } = globalThis;\n"+s
p.write_text(s)
p=Path('packages/application/src/index.ts')
s=p.read_text().replace('left.localeCompare(right)', "(left < right ? -1 : left > right ? 1 : 0)")
p.write_text(s)
