#!/usr/bin/env python3
from __future__ import annotations
import csv,io,json,math,re,sys,zipfile
from datetime import datetime,timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

def norm(v):
    v=(v or '').strip().lower().replace('’',"'"); return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',v)).strip()
def hav(a,b):
    p=math.pi/180; x=(b[1]-a[1])*p*math.cos((a[0]+b[0])*p/2); y=(b[0]-a[0])*p; return 6371000*math.sqrt(x*x+y*y)
def pick(r,names):
    d={norm(k).replace(' ','_'):v for k,v in r.items()}
    for n in names:
        v=d.get(norm(n).replace(' ','_'),'')
        if str(v).strip(): return str(v).strip()
    return ''
def load_mdpa(path):
    raw=Path(path).read_text(encoding='utf-8-sig')
    try: dia=csv.Sniffer().sniff(raw[:8192],delimiters=',;|\t')
    except csv.Error: dia=csv.excel
    rows=list(csv.DictReader(io.StringIO(raw),dialect=dia)); out=[]
    if not rows: raise SystemExit('Official MDPA bus-stop CSV is empty')
    for i,r in enumerate(rows,1):
        la,lo=pick(r,['latitude','lat','y']),pick(r,['longitude','lon','lng','long','x'])
        if not la or not lo:
            nums=[]
            for v in r.values():
                try: nums.append(float(str(v).strip()))
                except (TypeError,ValueError): pass
            aa=[v for v in nums if -21.5<=v<=-19]; oo=[v for v in nums if 56<=v<=59.5]
            if aa and oo: la,lo=str(aa[0]),str(oo[0])
        try:
            la,lo=float(la),float(lo)
            if not(-21.5<=la<=-19 and 56<=lo<=59.5): continue
            sid=pick(r,['stop_id','id','fid','objectid']) or f'MDPA-{i}'; name=pick(r,['stop_name','name','bus_stop_name','description','label','title'])
            out.append({'id':sid,'name':name,'n':norm(name),'lat':la,'lon':lo,'source':'mdpa'})
        except (TypeError,ValueError): pass
    if not out: raise SystemExit('Could not identify latitude/longitude columns in official MDPA CSV')
    return out
def load_osm(path):
    root=ET.parse(path).getroot(); out=[]; seen=set()
    for n in root.iter('node'):
        la,lo=n.get('lat'),n.get('lon')
        if not la or not lo: continue
        tags={t.get('k'):t.get('v','') for t in n.findall('tag')}; name=tags.get('name') or tags.get('name:en') or tags.get('local_name')
        if not name: continue
        try:
            la,lo=float(la),float(lo); key=(norm(name),round(la,6),round(lo,6))
            if key not in seen: seen.add(key); out.append({'id':n.get('id'),'name':name,'n':norm(name),'lat':la,'lon':lo,'source':'osm'})
        except ValueError: pass
    if not out: raise SystemExit('No named OSM nodes found')
    return out
def variants(name):
    n=norm(name); vs={n}; core=norm(re.sub(r'\([^)]*\)',' ',n))
    if core: vs.add(core)
    for p in re.findall(r'\(([^)]*)\)',n):
        p=norm(p)
        if p: vs.add(p)
    return vs
def score(a,b):
    b=norm(b); best=0
    for x in variants(a):
        if x==b: best=max(best,1000)
        ax,bx=set(x.split()),set(b.split())
        if ax and bx: best=max(best,len(ax&bx)/len(ax|bx)*500+(120 if x in b or b in x else 0))
    return best
ANCHORS={
 'port louis transportation centre':(-20.15774,57.50466),'g r n w':(-20.1748,57.47287),'grnw':(-20.1748,57.47287),
 'camp benoit':(-20.18451,57.46554),'petite riviere foyer piat':(-20.20076,57.44357),'petite riviere foyer fiat':(-20.20076,57.44357),
 'clarence beginning of village':(-20.29778,57.3925),'clarence end of village':(-20.29778,57.3925),
 'grande riviere noire salt pans':(-20.36028,57.36611),'tamarin salt pans':(-20.32556,57.37056),'tamarin beginning of village':(-20.32556,57.37056),
 'riviere du rempart bridge':(-20.318,57.370),'montee bois puant':(-20.36,57.37),'montee bol junction geoffroy road':(-20.235,57.425)
}
LOCALITIES={
 'port louis':(-20.16194,57.49889),'petite riviere noire':(-20.38970,57.38196),'grande riviere noire':(-20.36028,57.36611),
 'la preneuse':(-20.35456,57.36559),'tamarin':(-20.32556,57.37056),'clarence':(-20.29778,57.39250),
 'flic en flac':(-20.27800,57.37200),'bambous':(-20.25667,57.40611),'canot':(-20.22186,57.43007),
 'petite riviere':(-20.19551,57.44592),'gros cailloux':(-20.20722,57.43000),'case noyale':(-20.39800,57.36700),
 'la gaulette':(-20.42000,57.36000),'coteau raffin':(-20.43472,57.35447),'le morne':(-20.44494,57.32619),
 'chamarel':(-20.42250,57.38389)
}
def anchor_stop(name,coord):
    n=norm(name); return {'id':'anchor:'+n,'name':name,'n':n,'lat':coord[0],'lon':coord[1],'source':'anchor'}
def bridge(name,osm,mdpa):
    normalized=norm(name); a=ANCHORS.get(normalized)
    if a:
        near=sorted(((hav(a,(m['lat'],m['lon'])),m) for m in mdpa),key=lambda x:(x[0],str(x[1]['id'])))
        if near and near[0][0]<=750:return near[0][1]
        near_osm=sorted(((hav(a,(s['lat'],s['lon'])),s) for s in osm),key=lambda x:(x[0],str(x[1]['id'])))
        if near_osm and near_osm[0][0]<=1000:return near_osm[0][1]
        return anchor_stop(name,a)
    direct=sorted(((score(name,m['name']),m) for m in mdpa),key=lambda x:(-x[0],str(x[1]['id'])))
    if direct and direct[0][0]>=1000:
        top=direct[0][0]; tied=[m for s,m in direct if s==top]
        if len(tied)==1:return tied[0]
        raise SystemExit(f'Ambiguous official MDPA stop identity for {name!r}')
    if direct and direct[0][0]>=420 and (len(direct)==1 or direct[0][0]-direct[1][0]>=20): return direct[0][1]
    for locality,coord in sorted(LOCALITIES.items(),key=lambda x:-len(x[0])):
        if locality in normalized:return anchor_stop(name,coord)
    ranked=sorted(((score(name,s['n']),s) for s in osm),key=lambda x:(-x[0],str(x[1]['id'])))
    if ranked and ranked[0][0]>0:
        top=ranked[0][0]; tied=[s for sc,s in ranked if sc==top]
        if len(tied)>1:
            tied=sorted(tied,key=lambda s:(min(hav((s['lat'],s['lon']),(m['lat'],m['lon'])) for m in mdpa),str(s['id'])))
            if len(tied)>1 and hav((tied[0]['lat'],tied[0]['lon']),(tied[1]['lat'],tied[1]['lon']))<20:raise SystemExit(f'Ambiguous OSM identity match for {name!r}')
        s=tied[0];near=min(hav((s['lat'],s['lon']),(m['lat'],m['lon'])) for m in mdpa)
        if near<=500:return min(((hav((s['lat'],s['lon']),(m['lat'],m['lon'])),m) for m in mdpa),key=lambda x:x[0])[1]
        print(f"Warning: using named OSM coordinate for NLTA stop {name!r}: {s['name']!r}",file=sys.stderr);return s
    raise SystemExit(f'No coordinate candidate for NLTA stop: {name!r}')
def departures(service,freq):
    out=[]
    for day,cfg in service.items():
        if freq:
            for p in freq:
                t=datetime.strptime(p['from'],'%H:%M');end=datetime.strptime(p['to'],'%H:%M')
                while t<=end:out.append((day,t.strftime('%H:%M:%S')));t+=timedelta(minutes=int(p['minutes']))
        else:
            t=datetime.strptime(cfg['first'],'%H:%M');end=datetime.strptime(cfg['last'],'%H:%M')
            while t<=end:out.append((day,t.strftime('%H:%M:%S')));t+=timedelta(minutes=30)
    return out
def write(z,name,fields,rows):
    b=io.StringIO();w=csv.DictWriter(b,fieldnames=fields,lineterminator='\n');w.writeheader();w.writerows(rows);z.writestr(name,b.getvalue())
def main():
    if len(sys.argv)!=5:raise SystemExit('usage: prepare_gtfs.py ROUTE_DIR MDPA_STOPS_CSV OSM_XML OUTPUT_ZIP')
    rd,mc,ox,out=map(Path,sys.argv[1:]);mdpa=load_mdpa(mc);osm=load_osm(ox);files=sorted(rd.glob('route-*.json'))
    if not files:raise SystemExit('No route-*.json files found')
    routes=[];trips=[];stops=[];stimes=[];seen={};tn=0
    for f in files:
        d=json.loads(f.read_text());rid=str(d['route_id']);routes.append({'route_id':rid,'agency_id':'NLTA','route_short_name':rid,'route_long_name':f'Line {rid}','route_type':3})
        for direc in d.get('directions',[]):
            resolved=[];direction=int(direc.get('direction_id',0))
            for s in direc.get('stops',[]):
                m=bridge(s['name'],osm,mdpa);sid=('mdpa' if m.get('source')=='mdpa' else 'osm')+':'+str(m['id']);resolved.append((sid,m,s));seen[sid]={'m':m,'name':s['name']}
            for day,depstr in departures(direc['service'],direc.get('frequency_weekdays')):
                service_id={'weekdays':'WEEK','saturdays':'SAT','sundays_public_holidays':'SUN'}[day];tn+=1;tid=f'{rid}-{direction}-{tn}';dep=datetime.strptime(depstr,'%H:%M:%S');trips.append({'route_id':rid,'service_id':service_id,'trip_id':tid,'direction_id':direction})
                for seq,(sid,m,s) in enumerate(resolved):
                    tm=(dep+timedelta(minutes=int(s.get('journey_minutes',0)))).strftime('%H:%M:%S');stimes.append({'trip_id':tid,'arrival_time':tm,'departure_time':tm,'stop_id':sid,'stop_sequence':seq})
    for sid,v in seen.items():
        m=v['m'];stops.append({'stop_id':sid,'stop_name':v['name'],'stop_lat':m['lat'],'stop_lon':m['lon']})
    cal=[{'service_id':'WEEK','monday':1,'tuesday':1,'wednesday':1,'thursday':1,'friday':1,'saturday':0,'sunday':0,'start_date':'20260816','end_date':'20271231'},{'service_id':'SAT','monday':0,'tuesday':0,'wednesday':0,'thursday':0,'friday':0,'saturday':1,'sunday':0,'start_date':'20260816','end_date':'20271231'},{'service_id':'SUN','monday':0,'tuesday':0,'wednesday':0,'thursday':0,'friday':0,'saturday':0,'sunday':1,'start_date':'20260816','end_date':'20271231'}]
    out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        write(z,'agency.txt',['agency_id','agency_name','agency_url','agency_timezone','agency_lang'],[{'agency_id':'NLTA','agency_name':'National Land Transport Authority','agency_url':'https://nlta.govmu.org/','agency_timezone':'Indian/Mauritius','agency_lang':'en'}]);write(z,'routes.txt',list(routes[0]),routes);write(z,'stops.txt',['stop_id','stop_name','stop_lat','stop_lon'],stops);write(z,'trips.txt',['route_id','service_id','trip_id','direction_id'],trips);write(z,'stop_times.txt',['trip_id','arrival_time','departure_time','stop_id','stop_sequence'],stimes);write(z,'calendar.txt',list(cal[0]),cal);write(z,'feed_info.txt',['feed_publisher_name','feed_publisher_url','feed_lang','feed_start_date','feed_end_date'],[{'feed_publisher_name':'SegaMap / NLTA source','feed_publisher_url':'https://nlta.govmu.org/','feed_lang':'en','feed_start_date':'20260816','feed_end_date':'20271231'}])
    print(f'Created {out}: {len(routes)} routes, {len(stops)} stops, {len(trips)} trips')
if __name__=='__main__':main()
