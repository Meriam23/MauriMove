from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Keep the public network status panel. Remove only the empty home result/"Prêt" strip.
s = s.replace(".hidden{display:none!important}", ".hidden{display:none!important}.home-ready{display:none!important}.name{font-weight:500!important}.brand{font-weight:500!important}")
s = re.sub(r'<div id="result" class="card"><b>Prêt 😊</b><div class="small">Choisis une destination pour rechercher les correspondances\.?</div></div>', '<div id="result" class="card home-ready"></div>', s, flags=re.S)

# Current C-Care Tamarin location: District One, La Mivoie (not the former Nautica temporary site).
# Approximate map point is anchored in the La Mivoie / coastal-road locality.
CC_LAT = -20.34406
CC_LON = 57.36403
old = "['c care','C-Care Tamarin',-20.35775,57.36850],['c-care tamarin','C-Care Tamarin',-20.35775,57.36850],['nautica','Nautica Commercial Centre',-20.35775,57.36850]"
new = "['c care','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['c-care tamarin','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['c care district one','C-Care Tamarin — District One, La Mivoie',-20.34406,57.36403],['district one','District One, La Mivoie',-20.34406,57.36403],['la mivoie','La Mivoie',-20.34406,57.36403],['nautica','Nautica Commercial Centre',-20.35775,57.36850]"
s = s.replace(old, new)
s = s.replace("const ccLat=-20.35775, ccLon=57.36850;", f"const ccLat={CC_LAT}, ccLon={CC_LON};")
s = s.replace("to.dataset.lat=-20.35775;to.dataset.lon=57.36850;to.dataset.label='C-Care Tamarin'", f"to.dataset.lat={CC_LAT};to.dataset.lon={CC_LON};to.dataset.label='C-Care Tamarin — District One, La Mivoie'")

# Ensure the result card reappears only after a real route result is rendered.
ux = r'''<script id="segamap-site-ux-final">(()=>{
const result=document.getElementById('result');
if(result){
  result.classList.add('home-ready');
  const reveal=()=>{if(result.textContent.trim() && !/Prêt/.test(result.textContent)){result.classList.remove('home-ready')}};
  new MutationObserver(reveal).observe(result,{subtree:true,childList:true,characterData:true});
}
const brand=document.querySelector('.brand .name');if(brand)brand.style.fontWeight='500';
})();</script>'''
s = s.replace('</body>', ux + '</body>')

# Keep the network panel visible; only the empty home result is hidden.
p.write_text(s, encoding='utf-8')
