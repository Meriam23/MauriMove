(()=>{
  const officialTimes={
    '203':[0,5,10,15,20,25,30,35,40,45,50],
    '57':[0,10,18,20,22,24,27,30,35,38,41,43,45,50]
  };
  function plausible(r){
    const ref=String(r?.ref||'').trim().toUpperCase();
    if(ref!=='203') return true;
    const from=String(r.from||'').toLowerCase(),to=String(r.to||'').toLowerCase();
    const names=(r.stops||[]).map(s=>String(s.name||'').toLowerCase());
    const known=['port louis','brabant','grnw','camp benoit','petite riviere','foyer','gros cailloux','canot','saint martin','mont roches','camp levieux'];
    const hits=names.filter(n=>known.some(k=>n.includes(k))).length;
    return hits>=3 && ((from.includes('port louis')&&to.includes('camp levieux'))||(to.includes('port louis')&&from.includes('camp levieux')));
  }
  function busMinutes(x){
    const ref=String(x?.route?.ref||'').trim().toUpperCase();
    if(ref==='203') return Math.max(1,(x.j-x.i)*5);
    if(ref==='57'){
      const forward=officialTimes['57'];
      const reverse=[0,5,7,9,12,15,20,23,26,28,30,32,40,50];
      const a=(String(x.route.from||'').toLowerCase().includes('wolmar')||String(x.route.to||'').toLowerCase().includes('quatre'))?reverse:forward;
      if(x.i>=0&&x.j<a.length) return Math.max(1,a[x.j]-a[x.i]);
    }
    return null;
  }
  window.routeCandidates=function(from,to){
    const A=nearestStops(from,10),B=nearestStops(to,10),res=[];
    for(const s of A) for(const t of B) for(const ri of [...s.routes]){
      const r=routes[ri]; if(!plausible(r)) continue;
      const i=r.stops.findIndex(x=>x.id===s.id),j=r.stops.findIndex(x=>x.id===t.id);
      if(i>=0&&j>i) res.push({type:'direct',route:r,ri,i,j,os:s,ds:t,walkA:s.d,walkB:t.d,busStops:j-i});
    }
    return res.sort((a,b)=>(a.walkA+a.walkB)-(b.walkA+b.walkB)).slice(0,12);
  };
  window.draw=function(points){
    clearMarks();
    const fallback=L.polyline(points,{color:'#246bfd',weight:5,dashArray:'8 8'}).addTo(map); marks.push(fallback);
    const coords=points.map(p=>p[1]+','+p[0]).join(';');
    fetch('https://router.project-osrm.org/route/v1/driving/'+coords+'?overview=full&geometries=geojson&steps=false')
      .then(r=>r.ok?r.json():Promise.reject()).then(j=>{
        const c=j.routes?.[0]?.geometry?.coordinates; if(!c) return;
        fallback.remove();
        const ll=c.map(p=>[p[1],p[0]]);
        marks.push(L.polyline(ll,{color:'#246bfd',weight:5}).addTo(map));
        marks.push(L.marker(points[0]).addTo(map).bindPopup('Départ'));
        marks.push(L.marker(points.at(-1)).addTo(map).bindPopup('Destination'));
        map.fitBounds(ll,{padding:[80,80]});
      }).catch(()=>map.fitBounds(points,{padding:[80,80]}));
  };
  window.cardDirect=function(x,w1,w2){
    const bus=busMinutes(x), total=bus===null?null:w1.min+bus+w2.min;
    const busText=bus===null?'Durée bus officielle indisponible pour ce tronçon':'~'+bus+' min · durée moyenne officielle NLTA';
    return '<div class="card best"><div class="big">⭐ Ligne '+esc(x.route.ref)+'</div><div class="small">'+esc(x.route.from||'')+(x.route.to?' → '+esc(x.route.to):'')+(x.route.operator?' · '+esc(x.route.operator):'')+'</div><div class="step"><div class="ico">🚶</div><div><b>'+esc(x.os.name||'Arrêt de bus')+'</b><div class="small">'+w1.min+' min · '+w1.m+' m depuis le départ</div></div></div><div class="step"><div class="ico">🚌</div><div><b>'+esc(x.os.name||'Arrêt de bus')+' → '+esc(x.ds.name||'Arrêt de bus')+'</b><div class="small">'+busText+'</div></div></div><div class="step"><div class="ico">🚶</div><div><b>'+esc(x.ds.name||'Arrêt de bus')+'</b><div class="small">'+w2.min+' min · '+w2.m+' m jusqu’à la destination</div></div></div><span class="pill">Correspondance : directe</span></div><div class="warn">'+(total===null?'⏱️ Durée totale non affichée : durée bus officielle manquante.':'⏱️ Durée indicative totale : <b>~'+total+' min</b>.')+' Aucun ETA temps réel n’est inventé.</div>';
  };

  // Citymapper-style place picker: type a few letters and choose a precise result.
  function normPlace(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
  function addPicker(input){
    if(!input||input.dataset.pickerReady)return;
    input.dataset.pickerReady='1';
    const box=document.createElement('div');
    box.className='mauri-suggestions';
    Object.assign(box.style,{display:'none',background:'#fff',border:'1px solid #e4e7ec',borderRadius:'14px',margin:'5px 0',overflow:'hidden',boxShadow:'0 12px 30px rgba(0,0,0,.12)',maxHeight:'280px',overflowY:'auto',position:'relative',zIndex:'2000'});
    input.parentElement.parentElement.appendChild(box);
    let timer=null,controller=null;
    async function search(){
      const q=input.value.trim();
      if(q.length<2){box.style.display='none';return}
      if(controller)controller.abort();controller=new AbortController();
      box.innerHTML='<div style="padding:12px;color:#667085;font-size:12px">🔎 Recherche de lieux à Maurice…</div>';box.style.display='block';
      try{
        const r=await fetch(NOM+'?format=jsonv2&addressdetails=1&limit=6&countrycodes=mu&q='+encodeURIComponent(q),{headers:{'Accept-Language':'fr'},signal:controller.signal});
        const data=r.ok?await r.json():[];
        const seen=new Set(),items=[];
        data.forEach(x=>{const key=(+x.lat).toFixed(5)+','+(+x.lon).toFixed(5);if(!seen.has(key)){seen.add(key);items.push(x)}});
        box.innerHTML='';
        if(!items.length){box.innerHTML='<div style="padding:12px;color:#667085;font-size:12px">Aucun lieu trouvé à Maurice.</div>';return}
        items.forEach(item=>{
          const b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;text-align:left;border:0;background:#fff;padding:12px 14px;font-size:13px;color:#101828;border-bottom:1px solid #eee';
          const name=item.name||String(item.display_name||q).split(',')[0];
          const address=String(item.display_name||'Maurice').split(',').slice(1,3).join(', ').trim()||'Maurice';
          b.innerHTML='<b>📍 '+esc(name)+'</b><div style="font-size:11px;color:#667085;margin-top:3px">'+esc(address)+'</div>';
          b.onclick=()=>{input.value=item.display_name;input.dataset.selectedLat=item.lat;input.dataset.selectedLon=item.lon;input.dataset.selectedLabel=name;box.style.display='none';};
          box.appendChild(b);
        });
      }catch(e){if(e.name!=='AbortError')box.innerHTML='<div style="padding:12px;color:#667085;font-size:12px">Recherche indisponible.</div>'}
    }
    input.addEventListener('input',()=>{delete input.dataset.selectedLat;delete input.dataset.selectedLon;clearTimeout(timer);timer=setTimeout(search,250)});
    input.addEventListener('focus',()=>{if(input.value.trim().length>=2)search()});
    input.addEventListener('keydown',e=>{if(e.key==='Escape')box.style.display='none';if(e.key==='Enter'&&box.style.display==='block'){const b=box.querySelector('button');if(b){e.preventDefault();b.click()}}});
    document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==input)box.style.display='none'});
  }
  addPicker(document.getElementById('from'));addPicker(document.getElementById('to'));
})();