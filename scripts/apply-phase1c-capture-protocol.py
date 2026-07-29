from pathlib import Path

# Make desktop request parsing tolerant of Windows UTF-8 BOMs.
desktop_path = Path('desktop/main.cjs')
desktop = desktop_path.read_text(encoding='utf-8')
old_read = "function readJson(file, fallback=null) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }"
new_read = "function readJson(file, fallback=null) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\\uFEFF/,'')); } catch { return fallback; } }"
if new_read not in desktop:
    if old_read not in desktop:
        raise RuntimeError('Desktop JSON reader anchor is missing.')
    desktop = desktop.replace(old_read, new_read, 1)
desktop_path.write_text(desktop, encoding='utf-8')

# Write the request explicitly as BOM-free UTF-8 on Windows.
controller_path = Path('scripts/run-phase1c-visual-captures.ps1')
controller = controller_path.read_text(encoding='utf-8')
old_write = "  $request|ConvertTo-Json -Depth 8|Set-Content $temp -Encoding utf8"
new_write = "  $requestJson=$request|ConvertTo-Json -Depth 8\n  [IO.File]::WriteAllText($temp,$requestJson,[Text.UTF8Encoding]::new($false))"
if new_write not in controller:
    if old_write not in controller:
        raise RuntimeError('Visual-capture request writer anchor is missing.')
    controller = controller.replace(old_write, new_write, 1)
controller_path.write_text(controller, encoding='utf-8')

if "replace(/^\\uFEFF/,'')" not in desktop:
    raise RuntimeError('Desktop JSON reader is not BOM-safe.')
if '[Text.UTF8Encoding]::new($false)' not in controller:
    raise RuntimeError('Visual capture requests are not explicitly BOM-free.')

print('Made the packaged visual-capture request protocol BOM-safe.')
