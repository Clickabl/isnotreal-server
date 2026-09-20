from pathlib import Path

# Temporary integration driver. Removed after generated source is verified and committed.
# Run 8: reconcile the concurrent tests with explicit single-cause publication calls.
if not Path('AGENTS.md').is_file():
    raise SystemExit('Run from the repository root')
for part in sorted(Path('ops/delivery-parts').glob('*.py')):
    print('Applying', part, flush=True)
    exec(compile(part.read_text(), str(part), 'exec'), {'__name__': '__delivery__'})
