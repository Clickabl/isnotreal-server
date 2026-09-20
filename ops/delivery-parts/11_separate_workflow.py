from pathlib import Path
import subprocess

# CI configuration was separately updated with the repository connector.
# The Actions job may commit application sources but must not alter workflows.
original = subprocess.check_output(['git', 'show', 'HEAD:.github/workflows/ci.yml'], text=True)
if 'bash ops/ci-postgres-client.sh' not in original:
    raise SystemExit('Matching PostgreSQL client must already be configured in CI')
Path('.github/workflows/ci.yml').write_text(original)
