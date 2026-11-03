import { useEffect, useRef } from 'react';
import L from 'leaflet';

function riderIcon(member, isMe) {
  const heading = member.heading || 0;
  const bubble = document.createElement('div');
  bubble.className = `rider-bubble ${isMe ? 'me' : ''} ${member.status || 'riding'}`;

  const arrow = document.createElement('div');
  arrow.className = 'rider-arrow';
  arrow.style.transform = `rotate(${heading}deg)`;
  arrow.textContent = '▲';

  const emoji = document.createElement('div');
  emoji.className = 'rider-emoji';
  emoji.textContent = member.emoji || '🏍️';

  const label = document.createElement('div');
  label.className = 'rider-label';
  label.textContent = member.name || 'Rider';

  bubble.append(arrow, emoji, label);
  return L.divIcon({
    className: 'rider-divicon',
    iconSize: [54, 64],
    iconAnchor: [27, 32],
    html: bubble,
  });
}

export default function RideMapView({
  ride,
  members,
  meId,
  route,
  followId,
  target,
  onSelectMember,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef({});

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control
      .attribution({ position: 'bottomleft' })
      .addAttribution('© OpenStreetMap contributors')
      .addTo(map);
    map.setView([ride.start.lat, ride.start.lng], 11);
    mapRef.current = map;
    layerRef.current = { riders: {}, route: null, start: null, dest: null, nav: null };
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [ride.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layerRef.current;
    if (layers.start) map.removeLayer(layers.start);
    if (layers.dest) map.removeLayer(layers.dest);
    layers.start = L.marker([ride.start.lat, ride.start.lng], {
      icon: L.divIcon({
        className: 'pin-icon',
        html: '<div class="map-pin start">A</div>',
        iconAnchor: [14, 28],
      }),
    }).addTo(map);
    layers.dest = L.marker([ride.dest.lat, ride.dest.lng], {
      icon: L.divIcon({
        className: 'pin-icon',
        html: '<div class="map-pin dest">B</div>',
        iconAnchor: [14, 28],
      }),
    }).addTo(map);
  }, [ride.start.lat, ride.start.lng, ride.dest.lat, ride.dest.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layerRef.current;
    if (layers.route) {
      map.removeLayer(layers.route);
      layers.route = null;
    }
    if (route?.geometry?.coordinates?.length) {
      const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      layers.route = L.polyline(latlngs, {
        color: '#1a73e8',
        weight: 7,
        opacity: 0.92,
        lineJoin: 'round',
      }).addTo(map);
      map.fitBounds(layers.route.getBounds(), { padding: [48, 48] });
    }
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layerRef.current;
    const seen = new Set();
    for (const member of members) {
      if (member.lat == null) continue;
      seen.add(member.userId);
      const icon = riderIcon(member, member.userId === meId);
      if (!layers.riders[member.userId]) {
        const marker = L.marker([member.lat, member.lng], { icon, zIndexOffset: 1000 }).addTo(map);
        marker.on('click', () => onSelectMember?.(member));
        layers.riders[member.userId] = marker;
      } else {
        layers.riders[member.userId].setLatLng([member.lat, member.lng]);
        layers.riders[member.userId].setIcon(icon);
        layers.riders[member.userId].setZIndexOffset(1000);
      }
    }
    Object.keys(layers.riders).forEach((id) => {
      if (!seen.has(id)) {
        map.removeLayer(layers.riders[id]);
        delete layers.riders[id];
      }
    });
    const follow = members.find((m) => m.userId === followId);
    if (follow?.lat != null) {
      map.panTo([follow.lat, follow.lng], { animate: true });
    }
  }, [members, meId, followId, onSelectMember]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = layerRef.current;
    if (layers.nav) {
      map.removeLayer(layers.nav);
      layers.nav = null;
    }
    if (target?.geometry?.coordinates?.length) {
      const latlngs = target.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      layers.nav = L.polyline(latlngs, {
        color: '#e53935',
        weight: 5,
        dashArray: '10 8',
      }).addTo(map);
    }
  }, [target]);

  return <div className="map-canvas" ref={elRef} />;
}
