import { useEffect, useRef } from 'react'
import OlMap from 'ol/Map'
import View from 'ol/View'
import Collection from 'ol/Collection'
import Feature, { type FeatureLike } from 'ol/Feature'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import Projection from 'ol/proj/Projection'
import Draw, { createBox } from 'ol/interaction/Draw'
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
import { measure, fmtAngle, fmtArea, fmtLength, dist } from '../lib/geometry'
import { collectTargets, constrainAngle, pointAtLength, snapPoint } from '../lib/snap'
import { activeCalibration } from '../lib/calibration'
import { uid, useHud, useStore, type Tool } from '../store'
import { fittingsAt, nodeById, pipeName, typeById } from '../lib/pipes'
import type { Project } from '../lib/types'
import { mapApi } from './mapApi'

const BLUE = '#2563EB'
const NAVY = '#1E3A5F'
const GREEN = '#059669'
const ORANGE = '#EA580C'

const MIN_POINTS: Record<MeasureType, number> = { distance: 2, polyline: 2, area: 3, angle: 3 }
const NAMES: Record<MeasureType, string> = { distance: 'Jarak', polyline: 'Polyline', area: 'Luas', angle: 'Sudut' }

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
    return type === 'distance' ? cs.slice(0, 2) : type === 'angle' ? cs.slice(0, 3) : cs
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

function makeStyle(h: number, getMpp: () => number | null, getSelected: () => string | null): (feature: FeatureLike, resolution?: number) => Style[] {
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
      if (type === 'polyline' || type === 'area') {
        r.segments_m.forEach((len, i) => {
          const a = pts[i]
          const b = pts[(i + 1) % pts.length]
          if (len <= 0 || (type === 'polyline' && i >= pts.length - 1)) return
          styles.push(new Style({ geometry: new Point(toOl([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], h)), text: labelText(fmtLength(len), NAVY, 11) }))
        })
      }
      if (type === 'angle' && r.angle_deg !== null) {
        styles.push(new Style({ geometry: new Point(toOl(pts[1], h)), text: new Text({ text: fmtAngle(r.angle_deg), offsetY: -18, font: '600 13px "Fira Sans", sans-serif', fill: new Fill({ color: NAVY }), stroke: new Stroke({ color: '#fff', width: 4 }) }) }))
      } else if (type === 'area' && pts.length >= 3) {
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
      const width = Math.min(3 + ((t?.diameter_in ?? 2) * 25.4) / 40, 8) + (selected ? 1.5 : 0)
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

/** Gaya pratinjau saat menggambar: garis putus-putus, penanda snap, dan label panjang. */
function makePreviewStyle(h: number, getMpp: () => number | null): StyleLike {
  const base = makeStyle(h, getMpp, () => null)
  return (feature, resolution) => {
    const pk = feature.get('pk') as string
    if (pk === 'snap') return new Style({ image: new CircleStyle({ radius: 8, stroke: new Stroke({ color: ORANGE, width: 2 }), fill: new Fill({ color: 'rgba(234,88,12,0.15)' }) }) })
    if (pk === 'ref') return referenceStyle(true)
    if (pk === 'pipe') {
      const g = feature.getGeometry()
      const mpp = getMpp()
      const styles = [new Style({ stroke: new Stroke({ color: ORANGE, width: 3, lineDash: [8, 6] }) })]
      if (g instanceof LineString && mpp) {
        const [a, b] = g.getCoordinates()
        styles.push(new Style({ geometry: new Point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), text: labelText(fmtLength(Math.hypot(b[0] - a[0], b[1] - a[1]) * mpp), ORANGE, 12) }))
      }
      return styles
    }
    const arr = base(feature, resolution)
    for (const st of arr) st.getStroke()?.setLineDash([6, 5])
    return arr
  }
}

const areaStyle = new Style({
  stroke: new Stroke({ color: ORANGE, width: 2, lineDash: [10, 6] }),
  text: new Text({ text: 'Area cetak', font: '600 12px "Fira Sans", sans-serif', fill: new Fill({ color: ORANGE }), stroke: new Stroke({ color: '#fff', width: 3 }), offsetY: 14, placement: 'point' }),
})

interface DrawApi {
  finish: () => void
  undo: () => void
  abort: () => boolean
  addLength: (m: number) => boolean
}

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
    areaSource: VectorSource
    drawApi: DrawApi | null
  } | null>(null)

  const image = useStore((s) => s.project.image)
  const imageUrl = useStore((s) => s.imageUrl)
  const measurements = useStore((s) => s.project.measurements)
  const calibrations = useStore((s) => s.project.calibrations)
  const tool = useStore((s) => s.tool)
  const selectedId = useStore((s) => s.selectedId)
  const pendingRef = useStore((s) => s.pendingRef)
  const project = useStore((s) => s.project)

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
    const areaSource = new VectorSource()
    const translateFeatures = new Collection<Feature>()
    const translate = new Translate({ features: translateFeatures, hitTolerance: 6 })
    const style = makeStyle(h, () => mppRef.current, () => selRef.current)
    const modifyFeatures = new Collection<Feature>()
    const modify = new Modify({
      features: modifyFeatures,
      insertVertexCondition: () => { const t = modifyFeatures.item(0)?.get('mtype'); return t !== 'distance' && t !== 'angle' },
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
        new VectorLayer({ source: areaSource, style: areaStyle }),
        new VectorLayer({ source: previewSource, style: makePreviewStyle(h, () => mppRef.current) }),
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

    ctx.current = { map, h, measureSource, refSource, modify, modifyFeatures, pipeSource, previewSource, translateFeatures, translate, areaSource, drawApi: null }

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
      finishDrawing: () => ctx.current?.drawApi?.finish(),
      undoLastPoint: () => ctx.current?.drawApi?.undo(),
      abortDrawing: () => ctx.current?.drawApi?.abort() ?? false,
      drawLength: (m) => ctx.current?.drawApi?.addLength(m) ?? false,
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

  // Area cetak terpilih.
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    c.areaSource.clear()
    const b = project.print_layout.bbox_px
    if (b) c.areaSource.addFeature(new Feature(new Polygon([[toOl([b[0], b[1]], c.h), toOl([b[2], b[1]], c.h), toOl([b[2], b[3]], c.h), toOl([b[0], b[3]], c.h), toOl([b[0], b[1]], c.h)]])))
  }, [project.print_layout.bbox_px, image, imageUrl])

  // Mesin menggambar: klik demi klik, dengan snap, kunci sudut (Shift), dan input panjang dari keyboard.
  useEffect(() => {
    const c = ctx.current
    if (!c || !image) return
    const { map, h, previewSource } = c
    const view = map.getView()
    c.modify.setActive(tool === 'select')
    c.translate.setActive(tool === 'select')
    previewSource.clear()
    c.drawApi = null
    useHud.getState().set({ drawCount: 0 })
    if (tool === 'select') return

    if (tool === 'printarea') {
      const box = new Draw({ type: 'Circle', geometryFunction: createBox(), style: areaStyle })
      box.on('drawend', (e) => {
        const ext = e.feature.getGeometry()?.getExtent()
        if (!ext) return
        const x0 = Math.max(0, ext[0])
        const x1 = Math.min(image.width_px, ext[2])
        const y0 = Math.max(0, h - ext[3])
        const y1 = Math.min(image.height_px, h - ext[1])
        const st = useStore.getState()
        setTimeout(() => {
          if (x1 - x0 < 10 || y1 - y0 < 10) st.setNotice({ kind: 'error', text: 'Area terlalu kecil. Tarik kotak yang lebih besar.' })
          else st.setPrintLayout({ bbox_px: [x0, y0, x1, y1] })
          st.setTool('select')
          st.openDialog('print')
        }, 0)
      })
      map.addInteraction(box)
      return () => map.removeInteraction(box)
    }

    const pts: Pt[] = []
    let cursor: Pt | null = null
    let raw: number[] | null = null
    let snapped = false
    let shift = false
    const res = () => view.getResolution() ?? 1

    const lastPoint = (): Pt | null => {
      if (tool === 'pipe') {
        const st = useStore.getState()
        return (st.pipeChain && nodeById(st.project, st.pipeChain)?.point_px) || null
      }
      return pts[pts.length - 1] ?? null
    }

    const resolve = (coord: number[]): { p: Pt; snapped: boolean } => {
      const p = fromOl(coord, h)
      const last = lastPoint()
      if (shift && last) return { p: constrainAngle(last, p), snapped: false }
      if (useStore.getState().snapOn) {
        const hit = snapPoint(p, collectTargets(projRef.current, pts), 10 * res())
        if (hit) return { p: hit.point, snapped: true }
      }
      return { p, snapped: false }
    }

    const refresh = () => {
      previewSource.clear()
      const last = lastPoint()
      if (tool === 'pipe') {
        if (last && cursor) previewSource.addFeature(new Feature({ geometry: new LineString([toOl(last, h), toOl(cursor, h)]), pk: 'pipe' }))
      } else {
        const all = cursor ? [...pts, cursor] : [...pts]
        if (all.length >= 2) {
          const coords = all.map((p) => toOl(p, h))
          const geom = tool === 'area' && all.length >= 3 ? new Polygon([[...coords, coords[0]]]) : new LineString(coords)
          previewSource.addFeature(new Feature({ geometry: geom, pk: tool === 'reference' || tool === 'verify' ? 'ref' : 'measure', mtype: tool }))
        }
      }
      if (cursor && snapped) previewSource.addFeature(new Feature({ geometry: new Point(toOl(cursor, h)), pk: 'snap' }))
      useHud.getState().set({ drawCount: tool === 'pipe' ? (last ? 1 : 0) : pts.length })
    }

    const finish = () => {
      const st = useStore.getState()
      if (tool === 'pipe') { st.endPipeChain(); refresh(); return }
      if (tool === 'reference' || tool === 'verify') {
        if (pts.length >= 2) st.setPendingRef({ p1: pts[0], p2: pts[1], mode: tool === 'verify' ? 'verify' : 'calibrate' })
      } else if (pts.length >= MIN_POINTS[tool]) {
        const n = st.project.measurements.filter((m) => m.type === tool).length + 1
        st.addMeasurement({ id: uid('m'), layer_id: 'layer-ukur', type: tool, points_px: [...pts], label: `${NAMES[tool]} ${n}` })
      }
      pts.length = 0
      cursor = null
      refresh()
    }

    const commit = (p: Pt, nodeTol: number) => {
      const st = useStore.getState()
      if (tool === 'pipe') {
        st.pipeClick(p, nodeTol)
        cursor = p
        refresh()
        return
      }
      const last = pts[pts.length - 1]
      if (last && dist(last, p) <= 4 * res()) return finish() // klik dua kali di titik yang sama = selesai
      pts.push(p)
      refresh()
      if ((tool === 'distance' || tool === 'reference' || tool === 'verify') && pts.length === 2) finish()
      else if (tool === 'angle' && pts.length === 3) finish()
    }

    const onMove = (e: { coordinate: number[] }) => {
      raw = e.coordinate
      const r = resolve(raw)
      cursor = r.p
      snapped = r.snapped
      refresh()
    }
    const onClick = (e: { coordinate: number[] }) => {
      const r = resolve(e.coordinate)
      snapped = r.snapped
      commit(r.p, 10 * res())
    }
    const onShift = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || shift === (e.type === 'keydown')) return
      shift = e.type === 'keydown'
      if (raw) onMove({ coordinate: raw })
    }

    map.on('pointermove', onMove)
    map.on('click', onClick)
    window.addEventListener('keydown', onShift)
    window.addEventListener('keyup', onShift)

    c.drawApi = {
      finish,
      undo: () => { if (tool !== 'pipe') { pts.pop(); refresh() } },
      abort: () => {
        const had = tool === 'pipe' ? !!lastPoint() : pts.length > 0
        if (tool === 'pipe') useStore.getState().endPipeChain()
        pts.length = 0
        cursor = null
        refresh()
        return had
      },
      addLength: (m) => {
        const mpp = mppRef.current
        const last = lastPoint()
        if (!mpp || !last || !(m > 0)) return false
        commit(pointAtLength(last, cursor, m / mpp), 0)
        return true
      },
    }
    return () => {
      map.un('pointermove', onMove)
      map.un('click', onClick)
      window.removeEventListener('keydown', onShift)
      window.removeEventListener('keyup', onShift)
      previewSource.clear()
      c.drawApi = null
      useHud.getState().set({ drawCount: 0 })
    }
  }, [tool, image, imageUrl])

  // Pintasan keyboard di kanvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, dialog, [role="dialog"]')) return
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const keyTool: Record<string, Tool> = { v: 'select', r: 'reference', k: 'verify', d: 'distance', p: 'polyline', a: 'area', s: 'angle', l: 'pipe' }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
      } else if (!mod && !e.altKey && keyTool[e.key.toLowerCase()]) {
        const next = keyTool[e.key.toLowerCase()]
        if (next !== 'select' && next !== 'reference' && !mppRef.current) {
          st.setNotice({ kind: 'error', text: 'Kalibrasi skala dulu (tombol R) sebelum mengukur.' })
          return
        }
        st.setTool(next)
      } else if (e.key === 'Escape') {
        if (!mapApi.current?.abortDrawing()) {
          st.setPendingRef(null)
          st.setTool('select')
          st.select(null)
        }
      } else if (e.key === 'Enter') {
        mapApi.current?.finishDrawing()
      } else if (e.key === 'Backspace' && st.tool !== 'select' && st.tool !== 'pipe') {
        e.preventDefault()
        mapApi.current?.undoLastPoint()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        st.deleteSelected()
      } else if (/^[0-9.,]$/.test(e.key) && !mod && useHud.getState().drawCount > 0) {
        // Mengetik angka saat menggambar = langsung mengisi panjang segmen berikutnya.
        document.getElementById('length-input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      ref={elRef}
      className="map"
      role="application"
      aria-label="Area foto. Scroll untuk zoom, seret untuk geser. Pintasan: V pilih, R referensi, D jarak, P polyline, A luas, S sudut, L pipa, K verifikasi, Esc batal."
      data-tool={tool}
    />
  )
}
