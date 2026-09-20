from pathlib import Path
import re

p=Path('tests/postgres.integration.test.mjs');s=p.read_text()
# A publisher call now activates one explicitly selected cause. Independent-cause
# activation is tested in delivery-checks.mjs rather than writing four causes at once.
s=s.replace('fullArtifactCount, 48', 'fullArtifactCount, 12')
s=s.replace('deltaArtifactCount, 48', 'deltaArtifactCount, 12')
s=re.sub(r"published\.(full|manifest|delta)\('israel-palestine',\s*'israel-palestine',", r"published.\1('israel-palestine',", s)
p.write_text(s)
