'use client';

// ══════════════════════════════════════════════════════
// 🗺️ خريطة مشتركة — MapLibre + بلاطات OpenStreetMap
//
// 🔴 لماذا OSM لا Google: بلا مفتاحٍ ولا بطاقةٍ ولا محاسبةٍ بالاستدعاء، وتغطية
//    عمّان تكفي تماماً لضبط دبّوسٍ ورؤية نقاط. تبديلها لاحقاً يمسّ هذا الملفّ وحده.
//
// تخدم استعمالين: ضبط نقطة المكان (دبّوسٌ يُسحَب) وخريطة حضور اللاعبين (نقاط).
// ══════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapDot {
  id: string | number;
  lat: number;
  lng: number;
  color: string;
  label?: string;
  /** باهتة = آخر موقعٍ معروف لا موقعٌ حاليّ */
  faded?: boolean;
  onClick?: () => void;
}

interface Props {
  center: { lat: number; lng: number } | null;
  /** دائرة السياج بالأمتار — تُرسم حول center */
  radiusM?: number | null;
  /** دبّوسٌ قابلٌ للسحب لضبط النقطة */
  draggablePin?: boolean;
  onPinMove?: (lat: number, lng: number) => void;
  /** 🔴 النقر يضع الدبّوس — بدونه لا سبيل لضبط نقطةٍ من لا نقطة له: الدبّوس
   *  لا يُرسَم أصلاً حين يكون center فارغاً، فلا شيء يُسحَب. ومن يضبط مكاناً
   *  ليس فيه (المدير من مكتبه) لا يملك «خذ موقعي» أيضاً. */
  onMapClick?: (lat: number, lng: number) => void;
  dots?: MapDot[];
  height?: number;
  className?: string;
}

// نمطٌ خامٌ بلا مفتاح — بلاطات OSM القياسيّة
const STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** دائرةٌ بالأمتار كـGeoJSON — MapLibre لا يرسم أنصاف أقطارٍ مِتريّة مباشرةً. */
function circleGeoJSON(lat: number, lng: number, radiusM: number, steps = 72) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [coords] }, properties: {} };
}

export default function VenueMap({
  center, radiusM, draggablePin, onPinMove, onMapClick, dots = [], height = 380, className = '',
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinRef = useRef<maplibregl.Marker | null>(null);
  const dotRefs = useRef<maplibregl.Marker[]>([]);
  const moveCb = useRef(onPinMove);
  moveCb.current = onPinMove;
  const clickCb = useRef(onMapClick);
  clickCb.current = onMapClick;

  // عمّان مركزاً احتياطيّاً حين لا نقطة بعد
  const start = center || { lat: 31.9539, lng: 35.9106 };

  useEffect(() => {
    if (!boxRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: STYLE,
      center: [start.lng, start.lat],
      zoom: center ? 16 : 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;

    map.on('click', e => clickCb.current?.(e.lngLat.lat, e.lngLat.lng));

    map.on('load', () => {
      map.addSource('fence', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any });
      map.addLayer({ id: 'fence-fill', type: 'fill', source: 'fence', paint: { 'fill-color': '#0E6F68', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'fence-line', type: 'line', source: 'fence', paint: { 'line-color': '#0E6F68', 'line-width': 2, 'line-dasharray': [3, 2] } });
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── الدبّوس ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    if (!pinRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#0E6F68;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:' + (draggablePin ? 'grab' : 'default');
      const m = new maplibregl.Marker({ element: el, draggable: !!draggablePin })
        .setLngLat([center.lng, center.lat]).addTo(map);
      if (draggablePin) {
        m.on('dragend', () => { const p = m.getLngLat(); moveCb.current?.(p.lat, p.lng); });
      }
      pinRef.current = m;
    } else {
      pinRef.current.setLngLat([center.lng, center.lat]);
    }
  }, [center, draggablePin]);

  // ── دائرة السياج ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center || !radiusM) return;
    const apply = () => {
      const src = map.getSource('fence') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: 'FeatureCollection', features: [circleGeoJSON(center.lat, center.lng, radiusM)] } as any);
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [center, radiusM]);

  // ── النقاط ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    dotRefs.current.forEach(m => m.remove());
    dotRefs.current = [];
    for (const d of dots) {
      const el = document.createElement('div');
      el.style.cssText =
        `width:16px;height:16px;border-radius:50%;background:${d.color};border:2px solid rgba(0,0,0,.55);` +
        `opacity:${d.faded ? 0.45 : 1};cursor:${d.onClick ? 'pointer' : 'default'};`;
      if (d.label) el.title = d.label;
      if (d.onClick) el.addEventListener('click', d.onClick);
      dotRefs.current.push(new maplibregl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map));
    }
  }, [dots]);

  // ── إعادة التوسيط عند وصول نقطةٍ لأوّل مرّة ──
  const centered = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center || centered.current) return;
    centered.current = true;
    map.easeTo({ center: [center.lng, center.lat], zoom: 16, duration: 600 });
  }, [center]);

  return <div ref={boxRef} className={className}
    style={{ height, width: '100%', borderRadius: 12, overflow: 'hidden', cursor: onMapClick ? 'crosshair' : undefined }} />;
}
