from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

s = s.replace(".hidden{display:none!important}", ".hidden{display:none!important}.home-ready{display:none!important}.name{font-weight:500!important}.brand{font-weight:500!important}")
s = re.sub(r'<div id="result" class="card"><b>Prêt 😊</b><div class="small">Choisis une destination pour rechercher les correspondances\\.? </div></div>', '<div id="result" class="card home-ready"></div>', s, flags=re.S)
CC_LAT = -20.34406
CC_LON = 57.36403
old = "['c care','C-Care Tamarin',-20.35775,57.36850],['c-care tamarin','C-Care Tamarin',-20.35775,57.36850],['nautica','Nautica Commercial Centre',-20.35775,57.36850]"
new = "['c care','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['c-care tamarin','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['c care district one','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['district one','District One, La Mivoie',-20.34406,57.36403],['la mivoie','La Mivoie',-20.34406,57.36403],['nautica','Nautica Commercial Centre',-20.35775,57.36850]"
s = s.replace(old, new)
s = s.replace("const ccLat=-20.35775, ccLon=57.36850;", f"const ccLat={CC_LAT}, ccLon={CC_LON};")
s = s.replace("to.dataset.lat=-20.35775;to.dataset.lon=57.36850;to.dataset.label='C-Care Tamarin'", f"to.dataset.lat={CC_LAT};to.dataset.lon={CC_LON};to.dataset.label='C-Care Tamarin — District One, La Mivoie'")

ux = r'''<script id="segamap-site-ux-final">(()=>{
const result=document.getElementById('result');
if(result){result.classList.add('home-ready');const reveal=()=>{if(result.textContent.trim()&&!/Prêt/.test(result.textContent))result.classList.remove('home-ready')};new MutationObserver(reveal).observe(result,{subtree:true,childList:true,characterData:true});}
const brand=document.querySelector('.brand .name');if(brand)brand.style.fontWeight='500';
const network=document.getElementById('networkInfo');if(network)network.remove();
const badge=document.createElement('div');badge.id='segamap-version-badge';badge.textContent='v1.3 · Production UI';badge.style='position:fixed;right:10px;top:10px;z-index:9999;background:#06143F;color:#fff;border-radius:999px;padding:5px 9px;font:700 10px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 4px 14px #0003;letter-spacing:.2px';document.body.appendChild(badge);
if(navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{});if(window.caches)caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).catch(()=>{});}
})();</script>'''
s = s.replace('</body>', ux + '</body>')
p.write_text(s, encoding='utf-8')
