from pathlib import Path
import json,secrets,socket
root=Path('/private/tmp/ued-skill-file-tools-test')
assert not root.exists(), 'Use a fresh synthetic root; do not overwrite an active test environment.'
root.mkdir()
(root/'.synthetic-file-tools-root').write_text('synthetic-only')
for name in ['data/meta','skill/示例目录/assets','skill/上传目录','skill/empty','runtime','evidence']:(root/name).mkdir(parents=True,exist_ok=True)
for port in [5447,5449]:
 s=socket.socket();s.bind(('127.0.0.1',port));s.close()
env={'TMPDIR':'/private/tmp','DATA_DIR':str(root/'data'),'HALDUR_DESIGN_SKILL_ROOT':str(root/'skill'),'HALDUR_DESIGN_SKILL_RUNTIME_ROOT':str(root/'runtime'),'ADMIN_USERNAME':'preview-admin','ADMIN_PASSWORD':secrets.token_hex(24),'ADMIN_SESSION_SECRET':secrets.token_hex(32),'ADMIN_SESSION_SECURE':'false','PUBLIC_ORIGIN':'http://127.0.0.1:5447','HOST_BIND_HOST':'127.0.0.1','UED_LOCAL_TEST_MODE':'true','AGENT_ENABLED':'false','NEXT_TELEMETRY_DISABLED':'1'}
p=root/'test-env.json';p.write_text(json.dumps(env));p.chmod(0o600)
(root/'skill/SKILL.md').write_text('# 合成 Skill 验收\n\n仅用于本轮隔离验证。\n')
(root/'skill/示例目录/assets/style.css').write_text('body { background:#eef6f0; padding:24px; font-family:Arial; } .card{background:white;border-radius:12px;padding:24px;max-width:740px;margin:auto;}button{background:#2ccc6c;border:0;padding:12px 20px;border-radius:8px;cursor:pointer;} .logo{width:160px;height:90px;background-image:url("logo.svg");}')
(root/'skill/示例目录/assets/app.js').write_text('document.querySelector("#count").addEventListener("click",()=>{let e=document.querySelector("#value");e.textContent=String(Number(e.textContent)+1)});')
svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect x="10" y="10" width="220" height="120" rx="20" fill="#2ccc6c"/><text x="40" y="82" font-size="28">Skill Preview</text></svg>'
(root/'skill/示例目录/assets/logo.svg').write_text(svg)
(root/'skill/示例目录/矢量图.svg').write_text(svg)
html='''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/style.css"><script defer src="assets/app.js"></script></head><body><div class="card"><h1>Haldur 文件预览验收</h1><p>同目录与子目录 CSS、JS、SVG 资源</p><img src="assets/logo.svg" width="160"><div class="logo"></div><p>当前数值：<strong id="value">0</strong></p><button id="count">增加数值</button><details><summary>展开说明</summary><p>真实本地交互正常</p></details><div style="height:1200px"></div><p id="bottom">长页面底部</p></div></body></html>'''
(root/'skill/示例目录/交互预览 (#1).html').write_text(html)
(root/'skill/示例目录/独立.html').write_text('<h1>自包含 HTML</h1><button onclick="this.textContent=\'已点击\'">本地按钮</button><style>body{font-family:sans-serif;padding:30px}</style>')
(root/'skill/示例目录/缺失.html').write_text('<link rel=stylesheet href=missing.css><img src=missing.svg><h1>资源缺失提示</h1>')
(root/'skill/上传目录/conflict.md').write_text('original conflict bytes')
(root/'skill/outside.txt').write_text('outside resource')
print('Prepared synthetic test root; no model or original credentials accessed.')
