FROM docker.io/opentripplanner/opentripplanner:2.9.0

USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl python3 ca-certificates unzip osmium-tool && rm -rf /var/lib/apt/lists/*

WORKDIR /var/opentripplanner
COPY routing/prepare_gtfs.py /opt/prepare_gtfs.py
COPY data/transit /opt/transit

# The 2.9.0 Docker image does not expose the shaded JAR at a stable filesystem
# path. Download the official signed release artifact instead and verify its
# published SHA-256 before using it.
RUN mkdir -p /app \
    && curl -fsSL "https://github.com/opentripplanner/OpenTripPlanner/releases/download/v2.9.0/otp-shaded-2.9.0.jar" -o /app/otp.jar \
    && echo "112824122cd1a89e2dff6b5b3088ffbd4f04c3c0a400ca9f08f17b762f5325f6  /app/otp.jar" | sha256sum -c -

# OSM is the street/walking network used by OTP. For the stop identity bridge,
# include all named OSM nodes as well as explicitly tagged transit stops: some
# official timetable stop names are mapped as named junctions/landmarks rather
# than highway=bus_stop objects.
RUN curl -fsSL "https://download.geofabrik.de/africa/mauritius-latest.osm.pbf" -o /var/opentripplanner/mauritius.osm.pbf \
    && osmium tags-filter /var/opentripplanner/mauritius.osm.pbf 'n/name' -o /tmp/named_nodes.osm

# Official Mauritius bus-stop dataset. Coordinates are taken from the official
# stop inventory when a safe identity exists; named OSM/locality anchors are
# used only for timetable landmarks absent from that inventory.
RUN curl -fsSL "https://data.govmu.org/dataset/2ba9ca15-d2d4-415e-9b37-3148511da1b9/resource/11e30efe-7fb9-41bb-a718-a3f0a5525dd7/download/busstops.csv" -o /tmp/busstops.csv \
    && test -s /tmp/busstops.csv \
    && python3 /opt/prepare_gtfs.py /opt/transit /tmp/busstops.csv /tmp/named_nodes.osm /var/opentripplanner/mauritius.gtfs.zip \
    && test -s /var/opentripplanner/mauritius.gtfs.zip

COPY routing/build-config.json /var/opentripplanner/build-config.json

RUN java -Xmx4g -jar /app/otp.jar --build --save /var/opentripplanner \
    && test -s /var/opentripplanner/graph.obj

EXPOSE 8080
CMD ["java", "-Xmx1g", "-jar", "/app/otp.jar", "--load", "--serve", "/var/opentripplanner"]
