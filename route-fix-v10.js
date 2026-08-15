/* SegaMap v10 — general multi-transfer transit graph + live user progress */
(()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const N=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dist=(a,b)=>Math.hypot((a.lat-b.lat)*111,(a.lon-b.lon)*104);
  const walkMin=km=>Math.max(1,Math.round(km/5*60));
  const busMin=km=>Math.max(1,Math.round(km/19*60));
  let layers=[],watchId=null,currentRoute=null,trackingMarker=null;
  const $=id=>document.getElementById(id);
  function clear(){layers.forEach(x=>{try{x.remove()}catch{}});layers=[];if(trackingMarker){try{trackingMarker.remove()}catch{}trackingMarker=null}}
  function add(x){layers.push(x);return x}
  async function road(points){
    if(points.length<2)return null;
    try{const u='https://router.project-osrm.org/route/v1/driving/'+points.map(p=>p.lon+','+p.lat).join(';')+'?overview=full&geometries=geojson&steps=false';const r=await fetch(u);if(!r.ok)return null;const j=await r.json();const c=j.routes?.[0]?.geometry?.coordinates;if(!c)return null;return c.map(p=>[p[1],p[0]])}catch{return null}
  }
  function nearestList(p,arr,n=28){return arr.map(x=>({...x,d:dist(p,x)})).sort((a,b)=>a.d-b.d).slice(0,n)}
  function buildGraph(){
    const rs=typeof routes!=='undefined'?routes:[];if(!Array.isArray(rs)||!rs.length)return null;
    const nodes=[],byKey=new Map(),cells=new Map(),cellSize=.002,key=(ri,si)=>ri+':'+si,cell=p=>[Math.floor(p.lat/cellSize),Math.floor(p.lon/cellSize)];
    const put=(k,n)=>{const a=cells.get(k)||[];a.push(n);cells.set(k,a)};
    rs.forEach((r,ri)=>{const ss=Array.isArray(r.stops)?r.stops.filter(s=>s&&isFinite(+s.lat)&&isFinite(+s.lon)):[];r.__stops=ss;ss.forEach((s,si)=>{const n={id:key(ri,si),ri,si,route:r,stop:s,edges:[]};nodes.push(n);byKey.set(n.id,n);const [a,b]=cell(s);put(a+','+b,n)})});
    const edge=(a,b,type,cost,meta={})=>a.edges.push({to:b,type,cost,...meta});
    rs.forEach((r,ri)=>{for(let i=0;i<(r.__stops?.length||0)-1;i++){const a=byKey.get(key(ri,i)),b=byKey.get(key(ri,i+1));if(!a||!b)continue;const km=dist(a.stop,b.stop);if(km<.01||km>3)continue;edge(a,b,'bus',busMin(km),{ri,from:i,to:i+1})}});
    for(const a of nodes){const [cx,cy]=cell(a.stop),seen=new Set();for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const b of (cells.get((cx+dx)+','+(cy+dy))||[])){if(a===b||a.ri===b.ri||seen.has(b.id))continue;seen.add(b.id);const km=dist(a.stop,b.stop);if(km<=.18)edge(a,b,'transfer',walkMin(km)+3,{walkKm:km})}}
    return{nodes,rs,byKey};
  }
  function dijkstra(g,A,B){
    const starts=nearestList(A,g.nodes,35).filter(x=>x.d<=1.15),goals=nearestList(B,g.nodes,35).filter(x=>x.d<=1.15);if(!starts.length||!goals.length)return null;
    const goalSet=new Map(goals.map(x=>[x.id,x.d])),D=new Map(),P=new Map(),Q=[];
    for(const s of starts){const c=walkMin(s.d);D.set(s.id,c);P.set(s.id,{prev:null,edge:{type:'walkStart',cost:c,walkKm:s.d}});Q.push([c,s])}
    const pop=()=>{let bi=0;for(let i=1;i<Q.length;i++)if(Q[i][0]<Q[bi][0])bi=i;return Q.splice(bi,1)[0]};let end=null,endCost=Infinity,loops=0;
    while(Q.length&&loops++<12000){const [d,u]=pop();if(d!==D.get(u.id))continue;if(goalSet.has(u.id)){const total=d+walkMin(goalSet.get(u.id));if(total<endCost){end=u;endCost=total}}if(d>endCost+20)continue;for(const e of u.edges){const v=e.to,nd=d+e.cost;if(nd<(D.get(v.id)??Infinity)){D.set(v.id,nd);P.set(v.id,{prev:u.id,edge:e});Q.push([nd,v])}}}
    if(!end)return null;const path=[];let cur=end;while(cur){path.push(cur);const p=P.get(cur.id);if(!p||!p.prev)break;cur=g.byKey.get(p.prev)}path.reverse();const endDist=goalSet.get(end.id),startDist=starts.find(s=>s.id===path[0].id)?.d||0;return{path,cost:endCost,startDist,endDist};
  }
  function makeLegs(sol){
    const legs=[];let last=null;for(let i=1;i<sol.path.length;i++){const a=sol.path[i-1],b=sol.path[i],type=a.ri===b.ri&&b.si===a.si+1?'bus':'transfer';if(type==='bus'){if(!last||last.type!=='bus'||last.ri!==a.ri){last={type:'bus',ri:a.ri,route:a.route,from:a.si,to:b.si,stops:[a.stop,b.stop]};legs.push(last)}else{last.to=b.si;last.stops.push(b.stop)}}else{last={type:'transfer',from:a.stop,to:b.stop,km:dist(a.stop,b.stop)};legs.push(last)}}return legs;
  }
  async function draw(A,B,sol,legs){
    clear();const all=[],first=sol.path[0]?.stop,last=sol.path[sol.path.length-1]?.stop;if(first)all.push({type:'walk',points:[A,first]});for(const l of legs)all.push(l.type==='bus'?{type:'bus',points:l.stops}:{type:'transfer',points:[l.from,l.to]});if(last)all.push({type:'walk',points:[last,B]});
    for(const seg of all){const c=await road(seg.points),pts=c||seg.points.map(p=>[p.lat,p.lon]),color=seg.type==='bus'?'#0072CE':'#F04A4A',style=seg.type==='bus'?{color,weight:6,opacity:.94,lineCap:'round',lineJoin:'round'}:{color,weight:4,opacity:.9,dashArray:'7 8'};add(L.polyline(pts,style).addTo(map))}
    add(L.marker([A.lat,A.lon]).addTo(map).bindPopup('Départ'));add(L.marker([B.lat,B.lon]).addTo(map).bindPopup('Destination'));map.fitBounds(L.latLngBounds([[A.lat,A.lon],[B.lat,B.lon],...sol.path.map(n=>[n.stop.lat,n.stop.lon])]),{padding:[70,70]});
  }
  function routeText(A,B,sol,legs){
    const total=Math.round(sol.cost+sol.endDist/5*60);let html='<div class="card route"><div class="big">🗺️ Meilleur itinéraire</div><div class="small">'+esc(A.label||'Départ')+' → '+esc(B.label||'Destination')+'</div><div class="step"><div class="ico">🚶</div><div><b>Marche jusqu’à '+esc(sol.path[0].stop.name)+'</b><div class="small">~'+walkMin(sol.startDist)+' min</div></div></div>';let busCount=0;
    for(const l of legs){if(l.type==='bus'){busCount++;const km=l.stops.reduce((s,x,i)=>i?s+dist(l.stops[i-1],x):0,0);html+='<div class="step"><div class="ico">🚌</div><div><b>Ligne '+esc(l.route.ref)+'</b><div class="small">'+esc(l.stops[0].name)+' → '+esc(l.stops[l.stops.length-1].name)+' · ~'+busMin(km)+' min</div></div></div>'}else html+='<div class="step"><div class="ico">🔄</div><div><b>Correspondance à '+esc(l.from.name)+'</b><div class="small">Marche ~'+walkMin(l.km)+' min jusqu’à '+esc(l.to.name)+'</div></div></div>'}
    html+='<div class="step"><div class="ico">🚶</div><div><b>Marche jusqu’à '+esc(B.label||'Destination')+'</b><div class="small">~'+walkMin(sol.endDist)+' min</div></div></div><span class="pill">~'+total+' min · '+Math.max(0,busCount-1)+' correspondance'+(busCount-1===1?'':'s')+'</span><div class="small">Les temps bus sont des estimations basées sur la géométrie des arrêts. Aucun ETA GPS n’est inventé.</div><button id="smTrack" class="btn" style="width:100%;margin-top:10px">📍 Suivre ma progression</button><div id="smProgress" class="small" style="margin-top:8px"></div></div>';return html;
  }
  function startTracking(journey){
    const p=$('smProgress');if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;p.textContent='Suivi arrêté.';$('smTrack').textContent='📍 Suivre ma progression';return}const js=journey.legs.filter(x=>x.type==='bus').flatMap(l=>l.stops);if(!navigator.geolocation){p.textContent='Géolocalisation indisponible.';return}p.innerHTML='<b>Suivi activé</b> · localisation en attente…';watchId=navigator.geolocation.watchPosition(pos=>{const here={lat:pos.coords.latitude,lon:pos.coords.longitude};const best=nearestList(here,js,1)[0];if(!best)return;const idx=js.indexOf(best),next=js[idx+1];p.innerHTML='<b>📍 Tu es près de '+esc(best.name)+'</b><br>'+(next?'Prochain arrêt : <b>'+esc(next.name)+'</b> · '+Math.max(0,js.length-idx-1)+' arrêts restants':'Dernier arrêt du trajet atteint.');if(!trackingMarker)trackingMarker=L.circleMarker([here.lat,here.lon],{radius:8,weight:3}).addTo(map);else trackingMarker.setLatLng([here.lat,here.lon])},{enableHighAccuracy:true,maximumAge:5000,timeout:10000});$('smTrack').textContent='⏹ Arrêter le suivi';
  }
  async function resolveInput(input){const q=N(input.value);if(q==='ma position'){try{if(typeof userPos!=='undefined'&&userPos)return userPos}catch{}return new Promise(res=>navigator.geolocation?.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude,label:'Ma position'}),()=>res(null),{enableHighAccuracy:true,timeout:9000}))}if(input.dataset?.lat)return{lat:+input.dataset.lat,lon:+input.dataset.lon,label:input.dataset.label||input.value};try{const local=typeof LOCAL!=='undefined'&&Array.isArray(LOCAL)?LOCAL.find(x=>x.keys?.some(k=>N(k)===q)):null;if(local)return local;const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=mu&q='+encodeURIComponent(input.value+', Mauritius'),{headers:{'Accept-Language':'fr'}}),a=r.ok?await r.json():[];if(a[0])return{lat:+a[0].lat,lon:+a[0].lon,label:a[0].name||input.value}}catch{}return null}
  async function run(){if(!$('go')||!$('result'))return;let rs=typeof routes!=='undefined'?routes:[],tries=0;while(!rs.length&&tries++<30){await wait(500);rs=typeof routes!=='undefined'?routes:[]}if(!rs.length){$('result').innerHTML='<div class="card"><b>Réseau en cours de chargement…</b><div class="small">Réessaie dans quelques secondes.</div></div>';return}const A=await resolveInput($('from')),B=await resolveInput($('to'));if(!A||!B){$('result').innerHTML='<div class="card"><b>Départ ou destination introuvable.</b></div>';return}const g=buildGraph(),sol=dijkstra(g,A,B);if(!sol){$('result').innerHTML='<div class="card"><b>Aucun itinéraire avec correspondances confirmé.</b><div class="small">Le moteur utilise uniquement les parcours et arrêts réellement présents dans les données cartographiques.</div></div>';return}const legs=makeLegs(sol);currentRoute={A,B,sol,legs};await draw(A,B,sol,legs);$('result').innerHTML=routeText(A,B,sol,legs);$('smTrack').onclick=()=>startTracking(currentRoute)}
  function brand(){document.title='SegaMap 🇲🇺';const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#06143F';const b=document.querySelector('.brand');if(b)b.innerHTML='<img src="./segamap-logo.svg" class="smLogo" alt="SegaMap"><span class="smName">SegaMap</span><span>🇲🇺</span>';const s=document.querySelector('.sub');if(s)s.textContent='Le transport mauricien, pensé pour toute l’île.';const st=document.createElement('style');st.textContent='.brand{display:flex;align-items:center;gap:8px}.smLogo{width:38px;height:38px;border-radius:10px;object-fit:cover;box-shadow:0 4px 14px #0002}.smName{font-weight:950;letter-spacing:-1px;color:#06143F}.go{background:linear-gradient(90deg,#ef233c,#0072CE)}';document.head.appendChild(st)}
  function install(){const btn=$('go');if(btn&&!btn.dataset.smWrapped){btn.dataset.smWrapped='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();run()},{capture:true})}brand()}
  let n=0;const boot=()=>{install();if(n++<40)setTimeout(boot,500)};boot();
})();
