from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Remove the now-empty technical network/status strip from the home screen.
s = re.sub(r'<div id="networkInfo"[^>]*>.*?</div>', '', s, flags=re.S)

# Remove the old follow button completely; GPS tracking starts when a route is opened.
s = re.sub(
    r"const follow=document\.createElement\('button'\);follow\.className='route-follow-final';.*?follow\.onclick=startLive;",
    "startLive();",
    s,
    flags=re.S,
)

# On route entry, show the complete trip first. Clicking an individual step still zooms to it.
overview = """function showOverview(){document.querySelectorAll('.route-step-final').forEach(e=>e.classList.remove('active'));clearMap();const all=[];geomsFinal.forEach((line,i)=>{if(!line||line.length<2)return;all.push(...line);const st=stepsFinal[i];const poly=L.polyline(line,{weight:5,opacity:.82,dashArray:st?.type==='bus'?null:'9 8'}).addTo(map);layers.push(poly)});if(all.length)map.fitBounds(L.latLngBounds(all),{padding:[70,70]});if(liveMarker)liveMarker.bringToFront()}"""
s = s.replace("function showStep(i){currentStepFinal=i;", overview + "\nfunction showStep(i){currentStepFinal=i;", 1)
s = s.replace("prepareGeoms().then(()=>showStep(0));", "prepareGeoms().then(()=>showOverview());", 1)

# Canonical west corridor. Stop order follows the current NLTA route documents;
# coordinates are fixed to the corresponding road-side localities so route matching
# cannot jump to a wrong OSM relation (the source of the Tamarin Beginning bug).
W = {
    '57': ('Quatre Bornes (Traffic Centre)','Wolmar',[
        ('Quatre Bornes (Traffic Centre)',-20.2640,57.4790),('La Louise',-20.2710,57.4710),
        ('Palma (Government School)',-20.2760,57.4530),('Palma (Junction Bassin Estate)',-20.2780,57.4470),
        ('Beaux Songes (Reservoir)',-20.2740,57.4330),('Montee Bol (Junction Geoffroy Road)',-20.2680,57.4250),
        ('Bambous (Mangues Vert Doux)',-20.2590,57.4200),('Bambous (Junction Black River / Geoffroy Roads)',-20.2570,57.4140),
        ('Bambous (Dragon Store)',-20.2571,57.4177),('Junction Flic en Flac',-20.281108,57.404107),
        ('Junction Flic en Flac / Anna Estate Roads',-20.2860,57.3940),('Flic en Flac (Government School)',-20.2920,57.3760),
        ('Flic en Flac (Golden Beach Restaurant)',-20.2980,57.3660),('Wolmar',-20.30702,57.36722)]),
    '123': ('Port Louis (Transportation Centre)','Wolmar',[
        ('Port Louis (Transportation Centre)',-20.16194,57.49889),('Brabant (SPAR)',-20.1655,57.4940),
        ('G.R.N.W.',-20.1755,57.4740),('Camp Benoit',-20.1815,57.4595),('Petite Riviere (Police Station)',-20.1953,57.4267),
        ('Petite Riviere (Foyer Piat)',-20.2010,57.4280),('Gros Cailloux',-20.20722,57.4300),('Canot',-20.2240,57.4240),
        ('Bambous (Roches Brunes Youth Training Centre)',-20.2520,57.4150),('Bambous (Junction Black River / Geoffroy Roads)',-20.2570,57.4140),
        ('Bambous (Dragon Store)',-20.2571,57.4177),('Junction Flic en Flac',-20.281108,57.404107),
        ('Junction Flic en Flac / Anna Estate Roads',-20.2860,57.3940),('Flic en Flac (Government School)',-20.2920,57.3760),
        ('Flic en Flac (Golden Beach Restaurant)',-20.2980,57.3660),('Wolmar',-20.30702,57.36722)]),
    '57A': ('Quatre Bornes (Traffic Centre)','Cascavelle',[
        ('Quatre Bornes (Traffic Centre)',-20.2640,57.4790),('La Louise',-20.2710,57.4710),
        ('Palma (Government School)',-20.2760,57.4530),('Palma (Junction Bassin Estate)',-20.2780,57.4470),
        ('Beaux Songes (Reservoir)',-20.2740,57.4330),('Cascavelle',-20.27819,57.40225)]),
    '5': ('Quatre Bornes (Traffic Centre)','Baie du Cap',[
        ('Quatre Bornes (Traffic Centre)',-20.2640,57.4790),('La Louise',-20.2710,57.4710),
        ('Palma (Government School)',-20.2760,57.4530),('Palma (Junction Bassin Estate)',-20.2780,57.4470),
        ('Beaux Songes (Reservoir)',-20.2740,57.4330),('Montee Bol (Junction Geoffroy Road)',-20.2680,57.4250),
        ('Bambous (Mangues Vert Doux)',-20.2590,57.4200),('Bambous (Junction Black River / Geoffroy Roads)',-20.2570,57.4140),
        ('Bambous (Dragon Store)',-20.2571,57.4177),('Junction Flic en Flac',-20.281108,57.404107),
        ('Clarence (Beginning of Village)',-20.2970,57.3890),('Clarence (End of Village)',-20.3040,57.3820),
        ('Riviere du Rempart Bridge',-20.3130,57.3745),('Tamarin (Beginning of Village)',-20.3210,57.3720),
        ('Tamarin (Salt Pans)',-20.3310,57.3680),('La Preneuse',-20.35523,57.36620),
        ('Grande Riviere Noire (Salt Pans)',-20.3630,57.3665),('Grande Riviere Noire (Trois Bras Store)',-20.35775,57.36850),
        ('Montee Bois Puant',-20.3700,57.3650),('Petite Riviere Noire (Salt Pans)',-20.3830,57.3640),
        ('Petite Riviere Noire (End of Village)',-20.3950,57.3630),('Case Noyale',-20.4230,57.3620),
        ('La Gaulette',-20.4160,57.3660),('Coteau Raffin',-20.4220,57.3590),
        ('Le Morne (Hotel Junction)',-20.4440,57.3370),('Le Morne (Le Paradis Hotel)',-20.4455,57.3265),
        ('Le Morne (Le Berjaya Hotel)',-20.4475,57.3225),('Le Morne (Football Ground)',-20.4485,57.3200),
        ('Le Morne (End of Village)',-20.4560,57.3200),('La Prairie (Beach)',-20.4660,57.3220),
        ('La Prairie (Signpost Dangerous Bath)',-20.4690,57.3230),('Maconde',-20.4740,57.3240),('Baie du Cap',-20.4780,57.3230)]),
    '119': ('Port Louis (Transportation Centre)','Grande Riviere Noire (Trois Bras Store)',[
        ('Port Louis (Transportation Centre)',-20.16194,57.49889),('Brabant (SPAR)',-20.1655,57.4940),
        ('G.R.N.W.',-20.1755,57.4740),('Camp Benoit',-20.1815,57.4595),('Petite Riviere (Police Station)',-20.1953,57.4267),
        ('Petite Riviere (Foyer Piat)',-20.2010,57.4280),('Gros Cailloux',-20.20722,57.4300),('Canot',-20.2240,57.4240),
        ('Bambous (Roches Brunes Youth Training Centre)',-20.2520,57.4150),('Bambous (Junction Black River / Geoffroy Roads)',-20.2570,57.4140),
        ('Bambous (Dragon Store)',-20.2571,57.4177),('Junction Flic en Flac',-20.281108,57.404107),
        ('Clarence (Beginning of Village)',-20.2970,57.3890),('Clarence (End of Village)',-20.3040,57.3820),
        ('Riviere du Rempart Bridge',-20.3130,57.3745),('Tamarin (Beginning of Village)',-20.3210,57.3720),
        ('Tamarin (Salt Pans)',-20.3310,57.3680),('La Preneuse',-20.35523,57.36620),
        ('Grande Riviere Noire (Salt Pans)',-20.3630,57.3665),('Grande Riviere Noire (Trois Bras Store)',-20.35775,57.36850)])
}

west_js = ['<script id="segamap-west-corridor-final">(()=>{const WEST=[];']
for ref,(frm,to,stops) in W.items():
    ss=','.join("{id:'west-%s-%s',name:%r,lat:%s,lon:%s}"%(ref,i,n,lat,lon) for i,(n,lat,lon) in enumerate(stops))
    west_js.append("WEST.push({ref:%r,from:%r,to:%r,operator:'NLTA',stops:[%s]});"%(ref,frm,to,ss))
west_js.append("const refs=new Set(WEST.map(r=>r.ref));window.applyWestTransitData=()=>{if(!Array.isArray(window.routes))return;routes=routes.filter(r=>!refs.has(String(r.ref)));routes.push(...WEST)};window.applyWestTransitData();})();</script>")
west_js=''.join(west_js)

marker='<script id="segamap-final-corrections-js">const carrefourLat=-20.27925;const SOFITEL_STOP={lat:-20.30702,lon:57.36722,label:"Flic en Flac Public Beach / Wolmar"};</script>'
s=s.replace('</body>', marker+west_js+'</body>')
s=s.replace("go.onclick=async function(){", "go.onclick=async function(){if(window.applyWestTransitData)window.applyWestTransitData();", 1)

# Deterministic destination point for the temporary C-Care location in Nautica.
s=s.replace("const ccLat=-20.35775, ccLon=57.36850;", "const ccLat=-20.35775, ccLon=57.36850;")
s=s.replace("to.dataset.lat=ccLat;to.dataset.lon=ccLon;to.dataset.label='C-Care Tamarin'", "to.dataset.lat=-20.35775;to.dataset.lon=57.36850;to.dataset.label='C-Care Tamarin'")

p.write_text(s, encoding='utf-8')
