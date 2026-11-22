import { useEffect, useRef } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Collection from 'ol/Collection'
import Feature from 'ol/Feature'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import Projection from 'ol/proj/Projection'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Translate from 'ol/interaction/Translate'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import { defaults as defaultControls } from 'ol/control/defaults'
import { LineString, MultiPoint, Point, Polygon } from 'ol/geom'
import { Geometry } from 'ol/geom'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import type { StyleLike } from 'ol/style/Style'
import 'ol/ol.css'
import type { MeasureType, Pt } from '../lib/types'
import { measure, fmtArea, fmtLength } from '../lib/geometry'
import { activeCalibration } from '../lib/calibration'
import { uid, useHud, useStore, type Tool } from '../store'
import { fittingsAt, nodeById, pipeName, typeById } from '../lib/pipes'
import type { Project } from '../lib/types'
import { mapApi } from './mapApi'

const BLUE = '#2563EB'
const NAVY = '#1E3A5F'
const GREEN = '#059669'
const ORANGE = '#EA580C'

const MIN_POINTS: Record<MeasureType, number> = { distance: 2, polyline: 2, area: 3 }

const toOl = (p: Pt, h: number): [number, number] => [p[0], h - p[1]]
const fromOl = (c: number[], h: number): Pt => [c[0], h - c[1]]

function pointsOf(geom: Geometry, type: MeasureType, h: number): Pt[] {
  if (geom instanceof Polygon) {
    const ring = geom.getCoordinates()[0] ?? []
    // Cincin poligon menutup di titik pertama: buang duplikatnya.
    return ring.slice(0, Math.max(ring.length - 1, 0)).map((c) => fromOl(c, h))
  }
  if (geom instanceof LineString) {
    const cs = geom.getCoordinates().map((c) => fromOl(c, h))
    return type === 'distance' ? cs.slice(0, 2) : cs
  }
  return []
}

const labelText = (text: string, color: string, size = 12) =>
  new Text({
    text,
    font: `600 ${size}px "Fira Sans", sans-serif`,
    fill: new Fill({ color }),
    stroke: new Stroke({ color: '#ffffff', width: 4 }),
    padding: [2, 4, 2, 4],
    overflow: true,
  })

function makeStyle(h: number, getMpp: () => number | null, getSelected: () => string | null): StyleLike {
  return (feature) => {
    const geom = feature.getGeometry()
    if (!geom || !(geom instanceof Geometry)) return []
    const type = (feature.get('mtype') as MeasureType | undefined) ?? 'polyline'
    const selected = feature.get('mid') === getSelected()
    const color = selected ? ORANGE : BLUE
    const styles: Style[] = [
      new Style({
        stroke: new Stroke({ color, width: selected ? 3 : 2 }),
        fill: new Fill({ color: selected ? 'rgba(234,88,12,0.12)' : 'rgba(37,99,235,0.12)' }),
      }),
    ]
    const pts = pointsOf(geom, type, h)
    if (pts.length === 0) return styles
    styles.push(
      new Style({
        geometry: new MultiPoint(pts.map((p) => toOl(p, h))),
        image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color, width: 2 }) }),
      }),
    )
    const mpp = getMpp()
    if (mpp && pts.length >= 2) {
      const r = measure(type, pts, mpp)
      if (type !== 'distance') {
        r.segments_m.forEach((len, i) => {
          const a = pts[i]
          const b = pts[(i + 1) % pts.length]
          if (len <= 0 || (type === 'polyline' && i >= pts.length - 1)) return
          styles.push(new Style({ geometry: new Point(toOl([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h)), text: labelText(fmtLength(len), NAVY, 11) }))
        })
      }
      if (type === 'area' && pts.length >= 3) {
        const poly = new Polygon([[...pts.map((p) => toOl(p, h)), toOl(pts[0], h)]])
        styles.push(new Style({ geometry: poly.getInteriorPoint(), text: labelText(`${fmtArea(r.area_m2 ?? 0)}\nKeliling ${fmtLength(r.length_m)}`, NAVY, 12) }))
      } else if (type === 'distance') {
        const [a, b] = pts
        styles.push(new Style({ geometry: new Point(toOl([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h)), text: labelText(fmtLength(r.length_m), NAVY, 13) }))
      } else if (type === 'polyline') {
        styles.push(new Style({ geometry: new Point(toOl(pts[pts.length - 1], h)), text: labelText(`Total ${fmtLength(r.length_m)}`, NAVY, 12) }))
      }
    }
    return styles
  }
}

const FIT_SHORT: Record<string, string> = { elbow: 'E', tee: 'T', cross: '+', reducer: 'R', valve: 'V', cap: 'C', meter: 'M', manhole: 'MH' }

function makePipeStyle(h: number, getMpp: () => number | null, getSelected: () => string | null, getProject: () => Project): StyleLike {
  return (feature) => {
    const kind = feature.get('kind') as 'segment' | 'node'
    const id = feature.get('pid') as string
    const selected = id === getSelected()
    const proj = getProject()
    if (kind === 'segment') {
      const seg = proj.pipe_segments.find((x) => x.id === id)
      const t = seg ? typeById(proj, seg.pipe_type_id) : undefined
      const color = selected ? ORANGE : (t?.color ?? BLUE)
      const width = Math.min(3 + (t?.diameter_mm ?? 60) / 40, 8) + (selected ? 1.5 : 0)
      const styles: Style[] = [new Style({ stroke: new Stroke({ color: '#ffffff', width: width + 3 }) }), new Style({ stroke: new Stroke({ color, width }) })]
      const g = feature.getGeometry()
      const mpp = getMpp()
      if (g instanceof LineString && seg) {
        const [a, b] = g.getCoordinates()
        const px = Math.hypot(b[0] - a[0], b[1] - a[1])
        const text = mpp ? `${pipeName(t)} · ${fmtLength(px * mpp)}` : pipeName(t)
        styles.push(new Style({ geometry: new Point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), text: labelText(text, NAVY, 11) }))
      }
      return styles
    }
    const node = nodeById(proj, id)
    if (!node) return []
    const fits = fittingsAt(proj, node)
    const special = node.node_type !== 'junction' && ['valve', 'cap', 'meter', 'manhole'].includes(node.node_type)
    const color = selected ? ORANGE : special ? '#DC2626' : NAVY
    const styles: Style[] = [new Style({ image: new CircleStyle({ radius: special ? 7 : 5, fill: new Fill({ color: special ? color : '#ffffff' }), stroke: new Stroke({ color, width: 2 }) }) })]
    if (fits.length > 0) {
      const txt = fits.map((f) => FIT_SHORT[f.kind] + (f.angle_deg ? String(f.angle_deg) : '')).join(' ')
      styles.push(new Style({ text: new Text({ text: txt, offsetY: -16, font: '600 11px "Fira Sans", sans-serif', fill: new Fill({ color: color }), stroke: new Stroke({ color: '#fff', width: 3 }) }) }))
    }
    void h
    return styles
  }
}

const referenceStyle = (dashed: boolean): Style[] => [
  new Style({ stroke: new Stroke({ color: GREEN, width: 2, lineDash: dashed ? [8, 6] : undefined }) }),
  new Style({ image: new CircleStyle({ radius: 4, fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color: GREEN, width: 2 }) }), geometry: (f) => new MultiPoint((f.getGeometry() as LineString).getCoordinates()) }),
]

export function MapView() {
  const elRef = useRef<HTMLDivElement>(null)
  const ctx = useRef<{
    map: OlMap
    h: number
    measureSource: VectorSource
    refSource: VectorSource
    modify: Modify
    modifyFeatures: Collection<Feature>
    pipeSource: VectorSource
    previewSource: VectorSource
    translateFeatures: Collection<Feature>
    translate: Translate
    draw: Draw | null
  } | null>(null)

  const image = useStore((s) => s.project.image)
  const imageUrl = useStore((s) => s.imageUrl)
  const measurements = useStore((s) => s.project.measurements)
  const calibrations = useStore((s) => s.project.calibrations)
  const tool = useStore((s) => s.tool)
  const selectedId = useStore((s) => s.selectedId)
  const pendingRef = useStore((s) => s.pendingRef)
  const project = useStore((s) => s.project)
  const pipeChain = useStore((s) => s.pipeChain)

  const mpp = activeCalibration(calibrations)?.meters_per_px ?? null
  const mppRef = useRef(mpp)
  const selRef = useRef(selectedId)
  mppRef.current = mpp
  const projRef = useRef(project)
  projRef.current = project
  selRef.current = selectedId

  // Buat peta sekali per foto (komponen di-remount lewat key di App).
  useEffect(() => {
    if (!elRef.current || !image || !imageUrl) return
    const w = image.width_px
    const h = image.height_px
    const extent = [0, 0, w, h]
    const projection = new Projection({ code: 'foto-piksel', units: 'pixels', extent })

    const measureSource = new VectorSource()
    const refSource = new VectorSource()
    const pipeSource = new VectorSource()
    const previewSource = new VectorSource()
    const translateFeatures = new Collection<Feature>()
    const translate = new Translate({ features: translateFeatures, hitTolerance: 6 })
    const style = makeStyle(h, () => mppRef.current, () => selRef.current)
    const modifyFeatures = new Collection<Feature>()
    const modify = new Modify({
      features: modifyFeatures,
      insertVertexCondition: () => modifyFeatures.item(0)?.get('mtype') !== 'distance',
    })

    const view = new View({
      projection,
      center: [w / 2, h / 2],
      resolution: Math.max(w, h) / 800,
      minResolution: 0.02, // sampai ±50x: sub-piksel
      maxResolution: Math.max(w, h) * 4,
      constrainResolution: false,
      smoothExtentConstraint: true,
    })

    const map = new OlMap({
      target: elRef.current,
      controls: defaultControls({ zoom: false, rotate: false, attribution: false }),
      interactions: defaultInteractions({ doubleClickZoom: false, altShiftDragRotate: false, pinchRotate: false }).extend([modify, translate]),
      layers: [
        new ImageLayer({ source: new ImageStatic({ url: imageUrl, projection, imageExtent: extent, interpolate: false }) }),
        new VectorLayer({ source: refSource, style: (f) => referenceStyle(f.get('dashed') === true) }),
        new VectorLayer({ source: pipeSource, style: makePipeStyle(h, () => mppRef.current, () => selRef.current, () => projRef.current) }),
        new VectorLayer({ source: measureSource, style }),
        new VectorLayer({ source: previewSource, style: new Style({ stroke: new Stroke({ color: ORANGE, width: 2, lineDash: [6, 6] }) }) }),
      ],
      view,
    })

    const fit = () => {
      map.updateSize()
      view.fit(extent, { padding: [32, 32, 32, 32] })
    }
    fit()

    modify.on('modifyend', (e) => {
      const f = e.features.item(0)
      const id = f?.get('mid') as string | undefined
      const g = f?.getGeometry()
      if (!f || !id || !g) return
      const type = f.get('mtype') as MeasureType
      const pts = pointsOf(g, type, h)
      if (pts.length >= MIN_POINTS[type]) useStore.getState().updateMeasurementPoints(id, pts)
      else useStore.setState((s) => ({ project: { ...s.project } })) // paksa sinkron ulang ke data asli
    })

    map.on('pointermove', (e) => useHud.getState().set({ cursor: fromOl(e.coordinate, h).map((v) => Math.round(v * 10) / 10) as Pt }))
    map.getViewport()?.addEventListener('pointerleave', () => useHud.getState().set({ cursor: null }))
    view.on('change:resolution', () => useHud.getState().set({ zoomPct: Math.round(100 / (view.getResolution() ?? 1)) }))
    view.on('change:rotation', () => useHud.getState().set({ rotationDeg: Math.round((view.getRotation() * 180) / Math.PI) }))
    useHud.getState().set({ zoomPct: Math.round(100 / view.getResolution()!), rotationDeg: 0 })

    // Klik di mode Pilih memilih objek pengukuran.
    map.on('singleclick', (e) => {
      if (useStore.getState().tool !== 'select') return
      const hits: Feature[] = []
      map.forEachFeatureAtPixel(e.pixel, (f) => { if (f instanceof Feature && !f.get('locked')) hits.push(f) }, { layerFilter: (l) => l.getSource() === measureSource || l.getSource() === pipeSource, hitTolerance: 6 })
      // Node didahulukan dari segmen, supaya titik di ujung pipa mudah dipilih.
      const pick = hits.find((f) => f.get('kind') === 'node') ?? hits[0]
      useStore.getState().select((pick?.get('mid') ?? pick?.get('pid') ?? null) as string | null)
    })

    // Tool pipa: klik menambah node/segmen; pratinjau garis mengikuti kursor.
    map.on('click', (e) => {
      if (useStore.getState().tool !== 'pipe') return
      useStore.getState().pipeClick(fromOl(e.coordinate, h), 12 * (view.getResolution() ?? 1))
    })
    map.on('pointermove', (e) => {
      const st = useStore.getState()
      previewSource.clear()
      if (st.tool !== 'pipe' || !st.pipeChain) return
      const from = nodeById(st.project, st.pipeChain)
      if (from) previewSource.addFeature(new Feature(new LineString([toOl(from.point_px, h), e.coordinate])))
    })

    translate.on('translating', (e) => {
      const f = e.features.item(0)
      const id = f?.get('pid') as string | undefined
      const g = f?.getGeometry()
      if (!id || !(g instanceof Point)) return
      const c = g.getCoordinates()
      const proj = projRef.current
      for (const sf of pipeSource.getFeatures()) {
        if (sf.get('kind') !== 'segment') continue
        const seg = proj.pipe_segments.find((x) => x.id === sf.get('pid'))
        if (!seg || (seg.from_node_id !== id && seg.to_node_id !== id)) continue
        const other = nodeById(proj, seg.from_node_id === id ? seg.to_node_id : seg.from_node_id)
        if (!other) continue
        const o = toOl(other.point_px, h)
        sf.setGeometry(new LineString(seg.from_node_id === id ? [c, o] : [o, c]))
      }
    })
    translate.on('translateend', (e) => {
      const f = e.features.item(0)
      const id = f?.get('pid') as string | undefined
      const g = f?.getGeometry()
      if (id && g instanceof Point) useStore.getState().moveNodeTo(id, fromOl(g.getCoordinates(), h))
    })

    ctx.current = { map, h, measureSource, refSource, modify, modifyFeatures, pipeSource, previewSource, translateFeatures, translate, draw: null }

    mapApi.current = {
      fit,
      zoomBy: (factor) => {
        const r = view.getResolution()!
        view.animate({ resolution: Math.min(Math.max(r / factor, view.getMinResolution()), view.getMaxResolution()), duration: 150 })
      },
      rotateBy: (deg) => view.animate({ rotation: view.getRotation() + (deg * Math.PI) / 180, duration: 200 }),
      resetRotation: () => view.animate({ rotation: 0, duration: 200 }),
      focusPoints: (pts) => {
        if (pts.length === 0) return
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => h - p[1])
        view.fit([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: [120, 120, 120, 120], minResolution: Math.max(view.getResolution() ?? 1, 0.02) * 0.999, duration: 200 })
      },
      finishDrawing: () => ctx.current?.draw?.finishDrawing(),
      undoLastPoint: () => ctx.current?.draw?.removeLastPoint(),
      abortDrawing: () => ctx.current?.draw?.abortDrawing(),
    }

    return () => {
      mapApi.current = null
      ctx.current = null
      map.setTarget(undefined)
      map.dispose()
    }
  }, [image, imageUrl])

  // Sinkronkan objek pengukuran dengan data proyek.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.measureSource.clear()
    c.modifyFeatures.clear()
    const layerOf = (id: string) => projRef.current.layers.find((l) => l.id === id)
    for (const m of measurements) {
      const layer = layerOf(m.layer_id)
      if (layer && !layer.visible) continue
      const coords = m.points_px.map((p) => toOl(p, c.h))
      const geom = m.type === 'area' ? new Polygon([[...coords, coords[0]]]) : new LineString(coords)
      const f = new Feature({ geometry: geom, mid: m.id, mtype: m.type, locked: !!layer?.locked })
      c.measureSource.addFeature(f)
      if (m.id === selectedId && tool === 'select' && !layer?.locked) c.modifyFeatures.push(f)
    }
  }, [measurements, project.layers, mpp, selectedId, tool, image, imageUrl])

  // Sinkronkan graf pipa dengan data proyek.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.pipeSource.clear()
    c.translateFeatures.clear()
    const layerOf = (id: string) => project.layers.find((l) => l.id === id)
    for (const s of project.pipe_segments) {
      const layer = layerOf(s.layer_id)
      if (layer && !layer.visible) continue
      const a = nodeById(project, s.from_node_id)
      const b = nodeById(project, s.to_node_id)
      if (!a || !b) continue
      c.pipeSource.addFeature(new Feature({ geometry: new LineString([toOl(a.point_px, c.h), toOl(b.point_px, c.h)]), kind: 'segment', pid: s.id, locked: !!layer?.locked }))
    }
    for (const n of project.pipe_nodes) {
      const layer = layerOf(n.layer_id)
      if (layer && !layer.visible) continue
      const f = new Feature({ geometry: new Point(toOl(n.point_px, c.h)), kind: 'node', pid: n.id, locked: !!layer?.locked })
      c.pipeSource.addFeature(f)
      if (n.id === selectedId && tool === 'select' && !layer?.locked) c.translateFeatures.push(f)
    }
  }, [project, mpp, selectedId, tool, image, imageUrl])

  // Pratinjau pipa hilang saat rantai selesai.
  useEffect(() => {
    if (!pipeChain) ctx.current?.previewSource.clear()
  }, [pipeChain])

  // Garis referensi: yang sedang menunggu input dan yang dipakai kalibrasi aktif.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.refSource.clear()
    const active = activeCalibration(calibrations)
    if (active?.input && !pendingRef) {
      const f = new Feature(new LineString(active.input.points_px.map((p) => toOl(p, c.h))))
      f.set('dashed', true)
      c.refSource.addFeature(f)
    }
    if (pendingRef) c.refSource.addFeature(new Feature(new LineString([toOl(pendingRef.p1, c.h), toOl(pendingRef.p2, c.h)])))
  }, [calibrations, pendingRef, image, imageUrl])

  // Pasang interaksi gambar sesuai alat aktif.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.modify.setActive(tool === 'select')
    c.translate.setActive(tool === 'select')
    if (c.draw) {
      c.map.removeInteraction(c.draw)
      c.draw = null
    }
    if (tool === 'select' || tool === 'pipe') return
    const type: MeasureType | 'reference' = tool
    const isArea = type === 'area'
    const h = c.h
    const draw = new Draw({
      type: isArea ? 'Polygon' : 'LineString',
      maxPoints: type === 'distance' || type === 'reference' ? 2 : undefined,
      minPoints: isArea ? 3 : 2,
      style: type === 'reference' ? referenceStyle(false) : makeStyle(h, () => mppRef.current, () => null),
    })
    draw.on('drawend', (e) => {
      const g = e.feature.getGeometry()
      if (!g) return
      if (type === 'reference') {
        const pts = pointsOf(g, 'distance', h)
        if (pts.length === 2) useStore.getState().setPendingRef({ p1: pts[0], p2: pts[1] })
        return
      }
      const pts = pointsOf(g, type, h)
      if (pts.length < MIN_POINTS[type]) return
      const n = useStore.getState().project.measurements.filter((m) => m.type === type).length + 1
      const names: Record<MeasureType, string> = { distance: 'Jarak', polyline: 'Polyline', area: 'Luas' }
      useStore.getState().addMeasurement({ id: uid('m'), layer_id: 'layer-ukur', type, points_px: pts, label: `${names[type]} ${n}` })
    })
    c.map.addInteraction(draw)
    c.draw = draw
    return () => {
      c.map.removeInteraction(draw)
      if (c.draw === draw) c.draw = null
    }
  }, [tool, image, imageUrl])

  // Pintasan keyboard di kanvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, dialog, [role="dialog"]')) return
      const st = useStore.getState()
      const keyTool: Record<string, Tool> = { v: 'select', r: 'reference', d: 'distance', p: 'polyline', a: 'area', l: 'pipe' }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && keyTool[e.key.toLowerCase()]) {
        const next = keyTool[e.key.toLowerCase()]
        if (next !== 'select' && next !== 'reference' && !mppRef.current) {
          st.setNotice({ kind: 'error', text: 'Kalibrasi skala dulu (tombol R) sebelum mengukur.' })
          return
        }
        st.setTool(next)
      } else if (e.key === 'Escape' && st.tool === 'pipe' && st.pipeChain) {
        st.endPipeChain()
      } else if (e.key === 'Escape') {
        mapApi.current?.abortDrawing()
        st.setPendingRef(null)
        st.setTool('select')
        st.select(null)
      } else if (e.key === 'Enter') {
        if (st.tool === 'pipe') st.endPipeChain()
        else mapApi.current?.finishDrawing()
      }
      else if (e.key === 'Backspace' && st.tool !== 'select' && st.tool !== 'pipe') { e.preventDefault(); mapApi.current?.undoLastPoint() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) st.deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={elRef}
      className="map"
      role="application"
      aria-label="Area foto. Scroll untuk zoom, seret untuk geser. Pintasan: V pilih, R referensi, D jarak, P polyline, A luas, L pipa, Esc batal."
      data-tool={tool}
    />
  )
}
