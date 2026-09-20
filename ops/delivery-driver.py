from pathlib import Path

# Temporary integration driver. Removed after generated source is verified and committed.
# Run 6: test backups with native PostgreSQL client utilities matching the server major.
if not Path('AGENTS.md').is_file():
    raise SystemExit('Run from the repository root')
for part in sorted(Path('ops/delivery-parts').glob('*.py')):
    print('Applying', part, flush=True)
    exec(compile(part.read_text(), str(part), 'exec'), {'__name__': '__delivery__'})
