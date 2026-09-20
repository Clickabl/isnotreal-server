from pathlib import Path

# Temporary integration driver. Removed after the generated source is verified and committed.
# Run 2: include existing formatting failures before type and runtime checks.
if not Path('AGENTS.md').is_file():
    raise SystemExit('Run from the repository root')
for part in sorted(Path('ops/delivery-parts').glob('*.py')):
    print('Applying', part, flush=True)
    exec(compile(part.read_text(), str(part), 'exec'), {'__name__': '__delivery__'})
