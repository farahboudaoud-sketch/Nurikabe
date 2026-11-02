"""Assemble l'appli : www/index.html (APK, polices locales) et preview.html (version web)."""
import base64, json, pathlib, re, subprocess
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
cfg = json.loads((src / 'app.json').read_text())
tpl = (src / 'template.html').read_text()
css = ''.join((src / f).read_text() for f in cfg.get('css', []))
js = (src / 'core.js').read_text() + '\n' + '\n'.join((src / f).read_text() for f in cfg['scripts']) + '\n' + (src / 'native.js').read_text() + '\ninit();\n'
html = (tpl.replace('/*GAMECSS*/', css).replace('/*SCRIPTS*/', js)
        .replace('<!--INTROART-->', cfg.get('introArt', ''))
        .replace('{{NAMEUP}}', cfg['name'].upper()).replace('{{NAME}}', cfg['name'])
        .replace('{{KANJI}}', cfg['kanji']).replace('{{TAGLINE}}', cfg['tagline']))
fonts = root / 'www' / 'fonts'
fonts.mkdir(parents=True, exist_ok=True)
nm = root / 'node_modules' / '@fontsource'
digits_file = fonts / 'zkg-digits-700.woff2'
subprocess.run(['pyftsubset', str(nm / 'zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-700-normal.woff2'),
                '--text=0123456789:×—·+−', '--flavor=woff2', f'--output-file={digits_file}'], check=True)
digits = base64.b64encode(digits_file.read_bytes()).decode()
digits_face = ("@font-face{font-family:'Chiffres';font-weight:700;font-display:block;"
               "src:url(data:font/woff2;base64," + digits + ") format('woff2');unicode-range:U+0030-003A,U+002B,U+00B7,U+00D7,U+2014,U+2212}\n")
cjk = ''.join(sorted(set(ch for ch in html if 0x3000 <= ord(ch) <= 0x9FFF)))
local = ''
for w in (400, 600, 800):
    (fonts / f'sm-latin-{w}.woff2').write_bytes((nm / f'shippori-mincho/files/shippori-mincho-latin-{w}-normal.woff2').read_bytes())
    subprocess.run(['pyftsubset', str(nm / f'shippori-mincho/files/shippori-mincho-japanese-{w}-normal.woff2'),
                    f'--text={cjk}', '--flavor=woff2', f'--output-file={fonts / f"sm-jp-{w}.woff2"}'], check=True)
    local += f"@font-face{{font-family:'Shippori Mincho';font-weight:{w};font-display:block;src:url(fonts/sm-latin-{w}.woff2) format('woff2')}}\n"
    local += f"@font-face{{font-family:'Shippori Mincho';font-weight:{w};font-display:block;src:url(fonts/sm-jp-{w}.woff2) format('woff2');unicode-range:U+3000-9FFF,U+FF00-FFEF}}\n"
(root / 'www' / 'index.html').write_text(html.replace('<!--FONTLINKS-->', '').replace('/*FONTFACES*/', local + digits_face))
gf = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      '<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&display=swap" rel="stylesheet">')
(root / 'preview.html').write_text(html.replace('<!--FONTLINKS-->', gf).replace('/*FONTFACES*/', digits_face))
print('ok', cfg['name'], 'kanji:', cjk)
