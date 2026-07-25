from pathlib import Path

source_path = Path('scripts/apply-phase1b-stellar-sky.py')
source = source_path.read_text(encoding='utf-8')
source = source.replace('        <label>Cloud mode<select id="v010CloudQuality">\n', '')
exec(compile(source, str(source_path), 'exec'), {'__name__': '__main__'})
