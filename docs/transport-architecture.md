# MauriMove transport architecture

## Current status — 15 August 2026

MauriMove now separates **authoritative static data**, **operator realtime data**, and **user observations**.

### 1. Static authoritative layer
- Open Data Mauritius: official bus-stop geospatial dataset.
- NLTA: official route, timetable, frequency and average journey-time documents.
- Metro Express: to be added only from an official reusable schedule/stop feed.

### 2. Operator realtime layer
CNT's MoBis officially provides realtime bus arrivals, bus locations and seating information. MauriMove records this as an available integration target, but does not pretend to have access to a public API until a legitimate feed or authorization is available.

### 3. Normalized model
The internal model follows GTFS concepts:
`agency → route → direction/trip → stop → stop_time`.
Realtime is separate:
`vehicle/trip → observed_at → position → ETA → occupancy`.

### 4. Routing
The target multimodal graph is:
`walk → transit → transfer → transit → walk`.
Each edge carries a source and confidence. A scheduled journey time can estimate an itinerary, but it cannot be displayed as a live ETA.

### 5. Confidence
- Official static: authoritative for the published period.
- Operator realtime: authoritative only when directly supplied by the operator.
- User report: corroborating evidence; never silently replaces official data.

### 6. Feedback
Reports are typed (`bus_late`, `bus_missing`, `wrong_stop`, `wrong_route`, `crowding`, `accessibility`, `fare`, `other`) and retain provenance. Anonymous reports are supported by the data model.

## Next implementation gates
1. Join the Open Data Mauritius stop coordinates to normalized NLTA stop names without guessing.
2. Expand NLTA route coverage from route 57 to the remaining route documents.
3. Add Metro Express stops/service from a legitimate official source.
4. Obtain or negotiate a reusable CNT MoBis realtime feed.
5. Replace the current prototype route selector with a graph-based multimodal router.
6. Add an in-app feedback UI and server-side aggregation/trust scoring.
