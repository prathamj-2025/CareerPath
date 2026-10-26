# Builds the Claude-artifact copy of the app in ../careerpath-artifact: index.html without the
# document wrappers (the publisher adds them) plus the same JS files as public/.
import re, shutil, os, sys
src = os.path.join(os.path.dirname(__file__), '..', 'public')
out = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/careerpath'
os.makedirs(out, exist_ok=True)
h = open(os.path.join(src, 'index.html'), encoding='utf-8').read()
h = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', h, flags=re.I)
h = re.sub(r'<meta [^>]*>\s*', '', h)
h = re.sub(r'<link rel="icon"[^>]*>\s*', '', h)
h = re.sub(r'<style>\s*:root \{\s*color-scheme: light dark;.*?</style>\s*', '', h, count=1, flags=re.S)
h = h.replace('</head>\n<body>', '').replace('</body>\n</html>', '')
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(h)
for f in os.listdir(src):
    if f.endswith('.js'): shutil.copy(os.path.join(src, f), os.path.join(out, f))
vend = os.path.join(src, 'vendor')
if os.path.isdir(vend):
    os.makedirs(os.path.join(out, 'vendor'), exist_ok=True)
    for f in os.listdir(vend):
        if f.endswith('.js'): shutil.copy(os.path.join(vend, f), os.path.join(out, 'vendor', f))
print('built', out)
