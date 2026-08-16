(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const PLACES=[
 ['carrefour city','Carrefour City Flic-en-Flac','Coastal Rd, Flic en Flac, Mauritius',-20.2749,57.3742],
 ['carrefour city flic en flac','Carrefour City Flic-en-Flac','Coastal Rd, Flic en Flac, Mauritius',-20.2749,57.3742],
 ['carrefour flic en flac','Carrefour City Flic-en-Flac','Coastal Rd, Flic en Flac, Mauritius',-20.2749,57.3742],
 ['c care','C-Care Tamarin','Tamarin, Mauritius',-20.35775,57.36850],
 ['c-care tamarin','C-Care Tamarin','Tamarin, Mauritius',-20.35775,57.36850],
 ['sofitel','Sofitel Mauritius L Imperial Resort And Spa','Wolmar, Mauritius',-20.311623,57.367472],
 ['cascavelle','Cascavelle Shopping Mall','Cascavelle, Mauritius',-20.27819,57.40225],
 ['port louis','Port Louis Victoria','Port Louis, Mauritius',-20.16194,57.49889],
 ['quatre bornes','Quatre Bornes Traffic Centre','Quatre Bornes, Mauritius',-20.264,57.479],
 ['rose hill','Rose Hill Bus Station','Rose Hill, Mauritius',-20.233,57.469],
 ['curepipe','Curepipe Bus Station','Curepipe, Mauritius',-20.318,57.526],
 ['central flacq','Central Flacq Bus Station','Central Flacq, Mauritius',-20.190,57.714],
 ['mahebourg','Mahébourg Bus Station','Mahébourg, Mauritius',-20.408,57.700]
];
const local=q=>{const n=norm(q);if(!n)return[];return PLACES.filter(p=>p[0].includes(n)||n.includes(p[0])).slice(0,7).map(p=>({label:p[1],address:p[2],lat:p[3],lon:p[4]}));};
async function geo(q){const l=local(q);if(l.length)return l;try{const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=mu&addressdetails=1&q='+encodeURIComponent(q+', Mauritius');const r=await fetch(u,{headers:{'Accept-Language':'fr'},cache:'no-store'});if(!r.ok)throw Error(r.status);const d=await r.json();return d.map(x=>({label:x.name||x.display_name.split(',')[0],address:x.display_name,lat:+x.lat,lon:+x.lon}));}catch{return[]}}
function show(input,box,data){box.innerHTML='';if(!data.length){box.innerHTML='<div class="suggestion"><span>Aucun lieu trouvé à Maurice. Essaie avec le nom du lieu ou de la rue.</span></div>';box.classList.remove('hidden');return}for(const x of data){const b=document.createElement('button');b.type='button';b.className='suggestion';b.innerHTML='<b>📍 '+esc(x.label)+'</b><span>'+esc(x.address)+'</span>';b.onclick=()=>{input.value=x.label;input.dataset.lat=x.lat;input.dataset.lon=x.lon;input.dataset.label=x.label;box.classList.add('hidden')};box.appendChild(b)}box.classList.remove('hidden')}
function installSearch(id,boxId){const input=$(id),box=$(boxId);if(!input||!box)return;let timer;input.addEventListener('input',e=>{e.stopImmediatePropagation();delete input.dataset.lat;delete input.dataset.lon;delete input.dataset.label;clearTimeout(timer);const q=input.value.trim();if(q.length<2){box.classList.add('hidden');return}timer=setTimeout(async()=>show(input,box,await geo(q)),180)},true);input.addEventListener('focus',()=>{const q=input.value.trim();if(q.length>=2)geo(q).then(d=>show(input,box,d))});}
installSearch('from','fromSug');installSearch('to','toSug');
function fixRoutes(){if(!Array.isArray(window.routes))return;for(const r of window.routes){for(const s of r.stops||[]){if(!s.name)s.name=s.stop_name||s.stopName||s.label||s.title||'Arrêt';if(!Number.isFinite(+s.lat)&&Number.isFinite(+s.latitude))s.lat=+s.latitude;if(!Number.isFinite(+s.lon)&&Number.isFinite(+s.lng))s.lon=+s.lng;}}}
const appIcon='./segamap-app-icon.svg?v=final';const pageLogo='./segamap-logo-v2.svg?v=final';document.querySelectorAll('img.logo').forEach(i=>i.src=pageLogo);const icon=document.querySelector('link[rel="apple-touch-icon"]');if(icon)icon.href=appIcon;const fav=document.querySelector('link[rel="icon"]');if(fav)fav.href=appIcon;const man=document.querySelector('link[rel="manifest"]');if(man)man.href='./manifest.webmanifest?v=final';
let n=0;const t=setInterval(()=>{fixRoutes();if(Array.isArray(window.routes)&&window.routes.length)n++;if(n>5||++window.__segamapFinalTicks>80)clearInterval(t)},250);
})();