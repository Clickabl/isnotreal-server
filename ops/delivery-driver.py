from pathlib import Path

# Temporary integration driver. Removed after generated source is verified and committed.
# Run 9: the full server suite passed; keep workflow edits outside the Actions source commit.
if not Path('AGENTS.md').is_file():
    raise SystemExit('Run from the repository root')
for part in sorted(Path('ops/delivery-parts').glob('*.py')):
    print('Applying', part, flush=True)
    exec(compile(part.read_text(), str(part), 'exec'), {'__name__': '__delivery__'})
