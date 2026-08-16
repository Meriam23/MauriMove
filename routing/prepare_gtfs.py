#!/usr/bin/env python3
"""Build a conservative GTFS feed from official NLTA route JSON files."""
from __future__ import annotations
import csv, io, json, math, re, sys, zipfile
from datetime import datetime, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

def norm(value: str) -> str:
    value=(value or "").strip().lower().replace("’", "'")
    value=re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def haversine(a,b):
    lat1,lon1=a; lat2,lon2=b; p=math.pi/180
    x=(lon2-lon1)*p*math.cos((lat1+lat2)*p/2); y=(lat2-lat1)*p
    return 6371000*math.sqrt(x*x+y*y)

def pick(row,names):
    lower={norm(k).replace(' ','_'):v for k,v in row.items()}
    for name in names:
        key=norm(name).replace(' ','_')
        if key in lower and str(lower[key]).strip(): return str(lower[key]).strip()
    return ""

def load_mdpa_stops(path):
    raw=Path(path).read_text(encoding="utf-8-sig")
    try: dialect=csv.Sniffer().sniff(raw[:8192],delimiters=",;|\t")
    except csv.Error: dialect=csv.excel
    rows=list(csv.DictReader(io.StringIO(raw),dialect=dialect))
    if not rows: raise SystemExit("Official MDPA bus-stop CSV is empty")
    stops=[]
    for i,row in enumerate(rows,1):
        lat=pick(row,["latitude","lat","y"]); lon=pick(row,["longitude","lon","lng","long","x"])
        if not lat or not lon:
            numeric=[]
            for key,value in row.items():
                try: v=float(str(value).strip())
                except (TypeError,ValueError): continue
                numeric.append((norm(key),v))
            la=[v for _,v in numeric if -21.5<=v<=-19.0]; lo=[v for _,v in numeric if 56.0<=v<=59.5]
            if la and lo: lat,lon=str(la[0]),str(lo[0])
        if not lat or not lon: continue
        try:
            la,lo=float(lat),float(lon)
            if not (-21.5<=la<=-19.0 and 56.0<=lo<=59.5): continue
            sid=pick(row,["stop_id","id","fid","objectid"]) or f"MDPA-{i}"
            stops.append({"id":sid,"lat":la,"lon":lo})
        except ValueError: continue
    if not stops: raise SystemExit("Could not identify latitude/longitude columns in official MDPA CSV")
    return stops

def load_osm_stops(path):
    root=ET.parse(path).getroot(); out=[]; seen=set()
    for node in root.iter("node"):
        lat=node.get("lat"); lon=node.get("lon")
        if not lat or not lon: continue
        tags={t.get("k"):t.get("v","") for t in node.findall("tag")}
        name=tags.get("name") or tags.get("name:en") or tags.get("local_name")
        if not name: continue
        try:
            la,lo=float(lat),float(lon); key=(norm(name),round(la,6),round(lo,6))
            if key in seen: continue
            seen.add(key); out.append({"id":node.get("id"),"name":name,"lat":la,"lon":lo,"n":norm(name)})
        except ValueError: pass
    if not out: raise SystemExit("No named OSM bus stops found")
    return out

def name_variants(name):
    n=norm(name); variants={n}; core=re.sub(r"\([^)]*\)"," ",n); core=re.sub(r"\s+"," ",core).strip()
    if core: variants.add(core)
    aliases={"transportation centre":"transport centre","transportation center":"transport center","bus station":"bus terminal","bus terminal":"bus station"}
    for v in list(variants):
        if v in aliases: variants.add(aliases[v])
    return variants

def name_score(name,osm_name):
    best=0.0
    for a in name_variants(name):
        b=osm_name
        if a==b: best=max(best,1000)
        at,bt=set(a.split()),set(b.split())
        if at and bt: best=max(best,len(at&bt)/len(at|bt)*500+(120 if a in b or b in a else 0))
    return best

def nearest_mdpa(osm,mdpa):
    return min(((haversine((osm["lat"],osm["lon"]),(m["lat"],m["lon"])),m) for m in mdpa),key=lambda x:(x[0],str(x[1].get("id",""))))

def bridge_stop(name,osm_stops,mdpa_stops):
    # Immigration Square is the real-world bus terminal referred to by NLTA
    # timetables as "Port Louis (Transportation Centre)". OSM represents the
    # terminal as a large station polygon/area, while the official MDPA feed
    # may place individual stop coordinates on its platforms. Therefore this
    # hub is resolved from a verified geographic anchor to the authoritative
    # MDPA point instead of requiring an arbitrary OSM node to be within 250m.
    hub_anchors={
        "port louis transportation centre":(-20.15774,57.50466),
    }
    normalized=norm(name)
    if normalized in hub_anchors:
        anchor=hub_anchors[normalized]
        distance, mdpa=min(
            ((haversine(anchor,(m["lat"],m["lon"])),m) for m in mdpa_stops),
            key=lambda x:(x[0],str(x[1].get("id","")))
        )
        # Keep the exception conservative: the authoritative MDPA point must
        # still be plausibly at the known terminal, not merely somewhere in
        # Port Louis. A 750m ceiling covers platform/entrance placement while
        # preventing an unrelated city stop from being selected.
        if distance>750:
            raise SystemExit(f"No official MDPA coordinate near verified hub anchor for NLTA stop {name!r} (nearest {distance:.1f}m)")
        return mdpa

    ranked=sorted(((name_score(name,s["n"]),s) for s in osm_stops),key=lambda x:(-x[0],str(x[1].get("id",""))))
    if not ranked or ranked[0][0]<180:
        raise SystemExit(f"No safe OSM identity match for NLTA stop: {name!r}")
    top=ranked[0][0]; tied=[s for score,s in ranked if score==top]
    if len(tied)>1:
        tied_ranked=sorted(((nearest_mdpa(s,mdpa_stops)[0],s) for s in tied),key=lambda x:(x[0],str(x[1].get("id",""))))
        if tied_ranked[0][0]>250: raise SystemExit(f"No official MDPA coordinate near OSM candidates for NLTA stop {name!r}")
        if len(tied_ranked)>1 and tied_ranked[1][0]-tied_ranked[0][0]<20: raise SystemExit(f"Ambiguous OSM identity match for {name!r}: {tied_ranked[0][1]['name']!r} / {tied_ranked[1][1]['name']!r}")
        osm=tied_ranked[0][1]
    else:
        if len(ranked)>1 and ranked[0][0]-ranked[1][0]<20:
            hub=norm(name)
            if not any(x in hub for x in ("transportation centre","transportation center","bus station","bus terminal")):
                raise SystemExit(f"Ambiguous OSM identity match for {name!r}: {ranked[0][1]['name']!r} / {ranked[1][1]['name']!r}")
        osm=ranked[0][1]
    nearby=sorted(((haversine((osm["lat"],osm["lon"]),(m["lat"],m["lon"])),m) for m in mdpa_stops),key=lambda x:(x[0],str(x[1].get("id",""))))
    if not nearby or nearby[0][0]>500:
        raise SystemExit(f"No official MDPA coordinate within 500m of OSM stop {osm['name']!r} for NLTA stop {name!r}")
    if len(nearby)>1 and nearby[1][0]-nearby[0][0]<10 and nearby[0][0]>30: raise SystemExit(f"Ambiguous MDPA coordinate near {name!r}: {nearby[0][0]:.1f}m / {nearby[1][0]:.1f}m")
    return nearby[0][1]

def times_for_direction(service,frequency,default_every=30):
    out=[]
    for day,cfg in service.items():
        if frequency:
            for p in frequency:
                t=datetime.strptime(p["from"],"%H:%M"); end=datetime.strptime(p["to"],"%H:%M")
                while t<=end: out.append((day,t.strftime("%H:%M:%S"))); t+=timedelta(minutes=int(p["minutes"]))
        else:
            t=datetime.strptime(cfg["first"],"%H:%M"); end=datetime.strptime(cfg["last"],"%H:%M")
            while t<=end: out.append((day,t.strftime("%H:%M:%S"))); t+=timedelta(minutes=default_every)
    return out

def write_csv(z,name,fields,rows):
    buf=io.StringIO(); w=csv.DictWriter(buf,fieldnames=fields,lineterminator="\n"); w.writeheader(); w.writerows(rows); z.writestr(name,buf.getvalue())

def main():
    if len(sys.argv)!=5: raise SystemExit("usage: prepare_gtfs.py ROUTE_DIR MDPA_STOPS_CSV OSM_STOPS_XML OUTPUT_ZIP")
    route_dir,mdpa_csv,osm_xml,output=map(Path,sys.argv[1:]); official=load_mdpa_stops(mdpa_csv); osm_stops=load_osm_stops(osm_xml)
    routes=sorted(route_dir.glob("route-*.json"))
    if not routes: raise SystemExit("No route-*.json files found")
    agencies=[{"agency_id":"NLTA","agency_name":"National Land Transport Authority","agency_url":"https://nlta.govmu.org/","agency_timezone":"Indian/Mauritius","agency_lang":"en"}]
    route_rows=[]; trip_rows=[]; stop_rows=[]; stop_time_rows=[]; trip_no=0; seen_stops={}
    for route_file in routes:
        data=json.loads(route_file.read_text(encoding="utf-8")); rid=str(data["route_id"]); route_rows.append({"route_id":rid,"agency_id":"NLTA","route_short_name":rid,"route_long_name":f"Line {rid}","route_type":3})
        for d in data.get("directions",[]):
            direction=int(d.get("direction_id",0)); resolved=[]
            for s in d.get("stops",[]):
                m=bridge_stop(s["name"],osm_stops,official); sid=f"mdpa:{m['id']}"; resolved.append((sid,m,s)); seen_stops[sid]={"m":m,"name":s["name"]}
            for day,departure in times_for_direction(d["service"],d.get("frequency_weekdays")):
                service_id={"weekdays":"WEEK","saturdays":"SAT","sundays_public_holidays":"SUN"}[day]; trip_no+=1; tid=f"{rid}-{direction}-{trip_no}"; dep=datetime.strptime(departure,"%H:%M:%S"); trip_rows.append({"route_id":rid,"service_id":service_id,"trip_id":tid,"direction_id":direction})
                for seq,(sid,m,s) in enumerate(resolved):
                    arr=(dep+timedelta(minutes=int(s.get("journey_minutes",0)))).strftime("%H:%M:%S"); stop_time_rows.append({"trip_id":tid,"arrival_time":arr,"departure_time":arr,"stop_id":sid,"stop_sequence":seq})
    for sid,v in seen_stops.items():
        m=v["m"]; stop_rows.append({"stop_id":sid,"stop_name":v["name"],"stop_lat":m["lat"],"stop_lon":m["lon"]})
    calendar_rows=[{"service_id":"WEEK","monday":1,"tuesday":1,"wednesday":1,"thursday":1,"friday":1,"saturday":0,"sunday":0,"start_date":"20260816","end_date":"20271231"},{"service_id":"SAT","monday":0,"tuesday":0,"wednesday":0,"thursday":0,"friday":0,"saturday":1,"sunday":0,"start_date":"20260816","end_date":"20271231"},{"service_id":"SUN","monday":0,"tuesday":0,"wednesday":0,"thursday":0,"friday":0,"saturday":0,"sunday":1,"start_date":"20260816","end_date":"20271231"}]
    Path(output).parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,"w",zipfile.ZIP_DEFLATED) as z:
        write_csv(z,"agency.txt",list(agencies[0]),agencies); write_csv(z,"routes.txt",["route_id","agency_id","route_short_name","route_long_name","route_type"],route_rows); write_csv(z,"stops.txt",["stop_id","stop_name","stop_lat","stop_lon"],stop_rows); write_csv(z,"trips.txt",["route_id","service_id","trip_id","direction_id"],trip_rows); write_csv(z,"stop_times.txt",["trip_id","arrival_time","departure_time","stop_id","stop_sequence"],stop_time_rows); write_csv(z,"calendar.txt",list(calendar_rows[0]),calendar_rows); write_csv(z,"feed_info.txt",["feed_publisher_name","feed_publisher_url","feed_lang","feed_start_date","feed_end_date"],[{"feed_publisher_name":"SegaMap / NLTA source","feed_publisher_url":"https://nlta.govmu.org/","feed_lang":"en","feed_start_date":"20260816","feed_end_date":"20271231"}])
    print(f"Created {output}: {len(route_rows)} routes, {len(seen_stops)} stops, {len(trip_rows)} trips")

if __name__=="__main__": main()
