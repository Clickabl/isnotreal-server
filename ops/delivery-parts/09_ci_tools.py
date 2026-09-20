from pathlib import Path
import re

p=Path('.github/workflows/ci.yml');s=p.read_text()
s=re.sub(r'      - name: Use PostgreSQL 17 backup tools\n        run: \|\n(?:          .*\n)+', '      - run: bash ops/ci-postgres-client.sh\n', s)
p.write_text(s)
