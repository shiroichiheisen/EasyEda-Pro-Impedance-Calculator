"use strict";
var edaEsbuildExportName = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    about: () => about,
    activate: () => activate,
    runImpedanceCalc: () => runImpedanceCalc
  });

  // extension.json
  var version = "1.7.3";

  // src/index.ts
  function activate(_status, _arg) {
  }

  function about() {
    eda.sys_Dialog.showInformationMessage(
      "PCB Trace Impedance Calculator v" + version + "\n\nCalculates Z\u2080 (Microstrip, Stripline, Differential) for each PCB trace segment.",
      "About"
    );
  }

  var STORAGE_KEY = "impedance-calc-data";

  function toast(msg, type, timer) {
    if (type === void 0) type = "info";
    if (timer === void 0) timer = 3;
    try {
      eda.sys_Message.showToastMessage(msg, type, timer);
    } catch (e) {
    }
  }

  var MIL_TO_MM = 0.0254;

  async function runImpedanceCalc() {
    try {
      toast("Extracting PCB data...", "info", 5);
      var pcbData = await extractPCBData();

      var totalTraces = pcbData.lines.length + pcbData.arcs.length;
      if (totalTraces === 0) {
        toast("No traces found", "warn");
        eda.sys_Dialog.showInformationMessage(
          "No traces found. Please open a PCB project before using this extension.",
          "Warning"
        );
        return;
      }

      toast("Found " + pcbData.lines.length + " traces, " + pcbData.arcs.length + " arcs, " + pcbData.vias.length + " vias, " + pcbData.pads.length + " pads", "success");

      // Show which layer IDs were found (helps debug layer mapping)
      var layerSet = {};
      pcbData.lines.forEach(function(l) { layerSet[l.layer] = true; });
      pcbData.arcs.forEach(function(a) { layerSet[a.layer] = true; });
      var layerIds = Object.keys(layerSet).sort(function(a,b){ return a-b; });
      toast("Layers detected: " + layerIds.join(", "), "info", 5);

      var ok = await eda.sys_Storage.setExtensionUserConfig(STORAGE_KEY, pcbData);
      if (!ok) {
        toast("Failed to store data", "error");
        eda.sys_Dialog.showInformationMessage(
          "Failed to store PCB data.",
          "Error"
        );
        return;
      }

      toast("Opening impedance calculator...", "info", 2);
      await eda.sys_IFrame.openIFrame(
        "/iframe/index.html",
        1200,
        800,
        "trace-impedance-calculator",
        {
          maximizeButton: true,
          minimizeButton: true,
          title: "PCB Trace Impedance Calculator"
        }
      );
    } catch (err) {
      toast("Error: " + (err && err.message ? err.message : err), "error", 5);
      eda.sys_Dialog.showInformationMessage(
        "Failed to start: " + (err && err.message ? err.message : err),
        "Error"
      );
    }
  }

  async function extractPCBData() {
    var result = {
      unit: "mm",
      lines: [],
      arcs: [],
      vias: [],
      pads: [],
      zones: [],
      boardOutline: null,
      copperLayerCount: null,
      apiLayerNames: {},
      _rawSamples: {}
    };

    // ── Get copper layer count and names from EasyEDA API ──
    try {
      var apiLayerCount = await eda.pcb_Layer.getTheNumberOfCopperLayers();
      if (typeof apiLayerCount === 'number' && apiLayerCount > 0) {
        result.copperLayerCount = apiLayerCount;
      }
    } catch(e) {}
    try {
      var apiAllLayers = await eda.pcb_Layer.getAllLayers();
      if (Array.isArray(apiAllLayers)) {
        for (var ali = 0; ali < apiAllLayers.length; ali++) {
          var al = apiAllLayers[ali];
          if (al && al.id && al.name) {
            result.apiLayerNames[al.id] = al.name;
          }
        }
      }
    } catch(e) {}

    // Straight traces
    try {
      var lines = await eda.pcb_PrimitiveLine.getAll();
      if (lines.length > 0) {
        try {
          var sample = lines[0];
          var sampleProps = {};
          for (var sp in sample) {
            try { sampleProps[sp] = typeof sample[sp] === 'function' ? '[function]' : sample[sp]; } catch(e2) { sampleProps[sp] = '[error]'; }
          }
          result._rawSamples.line = sampleProps;
        } catch(e) {}
      }
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        try {
          result.lines.push({
            type: "WIRE",
            id: l.primitiveId,
            startX: l.startX * MIL_TO_MM,
            startY: l.startY * MIL_TO_MM,
            endX: l.endX * MIL_TO_MM,
            endY: l.endY * MIL_TO_MM,
            width: l.lineWidth * MIL_TO_MM,
            layer: l.layer,
            net: l.net
          });
        } catch (e) {}
      }
    } catch (e) {}

    // Arcs
    try {
      var arcs = await eda.pcb_PrimitiveArc.getAll();
      for (var i = 0; i < arcs.length; i++) {
        var a = arcs[i];
        try {
          var sx = a.startX * MIL_TO_MM, sy = a.startY * MIL_TO_MM;
          var ex = a.endX * MIL_TO_MM, ey = a.endY * MIL_TO_MM;
          var arcAngleDeg = a.arcAngle || 0;
          var arcObj = {
            type: "ARC",
            id: a.primitiveId,
            startX: sx, startY: sy,
            endX: ex, endY: ey,
            arcAngle: arcAngleDeg,
            width: a.lineWidth * MIL_TO_MM,
            layer: a.layer,
            net: a.net,
            arcSegments: null,
            centerX: null, centerY: null, radius: null,
            startAngle: null, endAngle: null
          };
          // Compute arc center, radius, angles for canvas drawing
          if (Math.abs(arcAngleDeg) > 0.1) {
            var angleRad = arcAngleDeg * Math.PI / 180;
            var mx = (sx + ex) / 2, my = (sy + ey) / 2;
            var dx = ex - sx, dy = ey - sy;
            var halfChord = Math.sqrt(dx * dx + dy * dy) / 2;
            if (halfChord > 1e-6) {
              var halfAngle = angleRad / 2;
              var d = halfChord / Math.tan(halfAngle);
              var nx = -dy / (2 * halfChord), ny = dx / (2 * halfChord);
              var cx = mx + d * nx, cy = my + d * ny;
              var r = halfChord / Math.sin(Math.abs(halfAngle));
              arcObj.centerX = cx;
              arcObj.centerY = cy;
              arcObj.radius = Math.abs(r);
              arcObj.startAngle = Math.atan2(sy - cy, sx - cx) * 180 / Math.PI;
              arcObj.endAngle = Math.atan2(ey - cy, ex - cx) * 180 / Math.PI;
              // Subdivide into line segments
              var startAngle = Math.atan2(sy - cy, sx - cx);
              var nSegs = Math.max(2, Math.ceil(Math.abs(arcAngleDeg) / 5));
              var stepAngle = angleRad / nSegs;
              var pts = [];
              for (var k = 0; k <= nSegs; k++) {
                var ang = startAngle + k * stepAngle;
                pts.push({ x: cx + Math.abs(r) * Math.cos(ang), y: cy + Math.abs(r) * Math.sin(ang) });
              }
              var segs = [];
              for (var k2 = 0; k2 < pts.length - 1; k2++) {
                segs.push({ x1: pts[k2].x, y1: pts[k2].y, x2: pts[k2 + 1].x, y2: pts[k2 + 1].y });
              }
              arcObj.arcSegments = segs;
            }
          }
          result.arcs.push(arcObj);
        } catch (e) {}
      }
    } catch (e) {}

    // ── Arc width fix: inherit width from connected line segments ──
    try {
      var SNAP = 0.005;
      function snapKey(net, layer, x, y) {
        return net + '|' + layer + '|' + (Math.round(x / SNAP) * SNAP).toFixed(4) + '|' + (Math.round(y / SNAP) * SNAP).toFixed(4);
      }
      var epWidths = {};
      for (var li = 0; li < result.lines.length; li++) {
        var ll = result.lines[li];
        epWidths[snapKey(ll.net, ll.layer, ll.startX, ll.startY)] = ll.width;
        epWidths[snapKey(ll.net, ll.layer, ll.endX, ll.endY)] = ll.width;
      }
      var arcFixed = 0;
      for (var ai = 0; ai < result.arcs.length; ai++) {
        var arc = result.arcs[ai];
        var lineW = epWidths[snapKey(arc.net, arc.layer, arc.startX, arc.startY)] ||
                    epWidths[snapKey(arc.net, arc.layer, arc.endX, arc.endY)];
        if (lineW && lineW !== arc.width) {
          arc._origWidth = arc.width;
          arc.width = lineW;
          arcFixed++;
        }
      }
      if (arcFixed > 0) {
        for (var ai2 = 0; ai2 < result.arcs.length; ai2++) {
          var arc2 = result.arcs[ai2];
          if (arc2._origWidth === undefined) continue;
          epWidths[snapKey(arc2.net, arc2.layer, arc2.startX, arc2.startY)] = arc2.width;
          epWidths[snapKey(arc2.net, arc2.layer, arc2.endX, arc2.endY)] = arc2.width;
        }
        for (var ai3 = 0; ai3 < result.arcs.length; ai3++) {
          var arc3 = result.arcs[ai3];
          if (arc3._origWidth !== undefined) continue;
          var chainW = epWidths[snapKey(arc3.net, arc3.layer, arc3.startX, arc3.startY)] ||
                       epWidths[snapKey(arc3.net, arc3.layer, arc3.endX, arc3.endY)];
          if (chainW && chainW !== arc3.width) {
            arc3._origWidth = arc3.width;
            arc3.width = chainW;
          }
        }
      }
      result._arcWidthFix = { total: result.arcs.length, fixed: arcFixed };
    } catch(e) {}

    // Vias
    try {
      var vias = await eda.pcb_PrimitiveVia.getAll();
      if (vias.length > 0) {
        try {
          var sample = vias[0];
          var sampleProps = {};
          for (var sp in sample) {
            try { sampleProps[sp] = typeof sample[sp] === 'function' ? '[function]' : sample[sp]; } catch(e2) { sampleProps[sp] = '[error]'; }
          }
          result._rawSamples.via = sampleProps;
        } catch(e) {}
      }
      for (var i = 0; i < vias.length; i++) {
        var v = vias[i];
        try {
          result.vias.push({
            type: "VIA",
            id: v.primitiveId,
            x: v.x * MIL_TO_MM,
            y: v.y * MIL_TO_MM,
            diameter: v.diameter * MIL_TO_MM,
            holeDiameter: v.holeDiameter * MIL_TO_MM,
            net: v.net
          });
        } catch (e) {}
      }
    } catch (e) {}

    // Pads
    try {
      var pads = await eda.pcb_PrimitivePad.getAll();
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        try {
          result.pads.push({
            type: "PAD",
            id: p.primitiveId,
            x: p.x * MIL_TO_MM,
            y: p.y * MIL_TO_MM,
            padWidth: p.pad[1] * MIL_TO_MM,
            padHeight: p.pad[2] * MIL_TO_MM,
            layer: p.layer,
            net: p.net || "",
            padNumber: p.padNumber
          });
        } catch (e) {}
      }
    } catch (e) {}

    // Copper zones (pour)
    try {
      var pours = await eda.pcb_PrimitivePour.getAll();
      if (pours.length > 0) {
        try {
          var sample = pours[0];
          var sampleProps = {};
          for (var sp in sample) {
            try { sampleProps[sp] = typeof sample[sp] === 'function' ? '[function]' : sample[sp]; } catch(e2) { sampleProps[sp] = '[error]'; }
          }
          result._rawSamples.pour = sampleProps;
        } catch(e) {}
      }
      for (var i = 0; i < pours.length; i++) {
        try {
          var pour = pours[i];
          var zoneEntry = {
            type: "ZONE",
            id: pour.primitiveId,
            net: pour.net,
            layer: pour.layer
          };
          // Try to get bounds/area if the API exposes them
          try { if (pour.bounds) zoneEntry.bounds = pour.bounds; } catch(e) {}
          try { if (pour.area) zoneEntry.area = pour.area; } catch(e) {}
          try { if (pour.width) zoneEntry.width = pour.width * MIL_TO_MM; } catch(e) {}
          try { if (pour.fillStyle !== undefined) zoneEntry.fillStyle = pour.fillStyle; } catch(e) {}
          try { if (pour.thermal !== undefined) zoneEntry.thermal = pour.thermal; } catch(e) {}
          try { if (pour.clearance) zoneEntry.clearance = pour.clearance * MIL_TO_MM; } catch(e) {}
          result.zones.push(zoneEntry);
        } catch (e) {}
      }
    } catch (e) {}

    // Approximate arc between two points with line segments (SVG-style)
    function _approxArc(sx, sy, ex, ey, rx, ry, largeArc, sweep, nSegs) {
      var pts = [];
      var dx = ex - sx, dy = ey - sy;
      var dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 1e-6) { pts.push({ x: ex, y: ey }); return pts; }
      var r = Math.max(rx, ry) || dist / 2;
      if (r < dist / 2) r = dist / 2;
      var mx = (sx + ex) / 2, my = (sy + ey) / 2;
      var halfChord = dist / 2;
      var h = Math.sqrt(Math.max(0, r*r - halfChord*halfChord));
      var nx = -dy / dist, ny = dx / dist;
      var sign = (sweep ? 1 : -1);
      if (largeArc) sign = -sign;
      var cenX = mx + sign * h * nx, cenY = my + sign * h * ny;
      var sa = Math.atan2(sy - cenY, sx - cenX);
      var ea = Math.atan2(ey - cenY, ex - cenX);
      var da = ea - sa;
      if (sweep && da < 0) da += 2 * Math.PI;
      if (!sweep && da > 0) da -= 2 * Math.PI;
      for (var k = 1; k <= nSegs; k++) {
        var t = k / nSegs;
        var a = sa + t * da;
        pts.push({ x: cenX + r * Math.cos(a), y: cenY + r * Math.sin(a) });
      }
      return pts;
    }

    // Approximate arc: EasyEDA-style "ARC", arcAngle, endX, endY
    function _approxArcEda(sx, sy, ex, ey, arcAngleDeg, nSegs) {
      var pts = [];
      if (Math.abs(arcAngleDeg) < 0.01) { pts.push({ x: ex, y: ey }); return pts; }
      var dx = ex - sx, dy = ey - sy;
      var chord = Math.sqrt(dx * dx + dy * dy);
      if (chord < 1e-9) { pts.push({ x: ex, y: ey }); return pts; }
      var halfAngleRad = Math.abs(arcAngleDeg) * Math.PI / 360;
      var sinHalf = Math.sin(halfAngleRad);
      if (Math.abs(sinHalf) < 1e-9) { pts.push({ x: ex, y: ey }); return pts; }
      var radius = chord / (2 * sinHalf);
      var cosHalf = Math.cos(halfAngleRad);
      var h = radius * cosHalf;
      var mx = (sx + ex) / 2, my = (sy + ey) / 2;
      var nx = -dy / chord, ny = dx / chord;
      var sign = arcAngleDeg > 0 ? 1 : -1;
      var cenX = mx + sign * h * nx, cenY = my + sign * h * ny;
      var sa = Math.atan2(sy - cenY, sx - cenX);
      var ea = Math.atan2(ey - cenY, ex - cenX);
      var da = ea - sa;
      if (arcAngleDeg < 0) { if (da > 0) da -= 2 * Math.PI; }
      else { if (da < 0) da += 2 * Math.PI; }
      for (var k = 1; k <= nSegs; k++) {
        var t = k / nSegs;
        var a = sa + t * da;
        pts.push({ x: cenX + radius * Math.cos(a), y: cenY + radius * Math.sin(a) });
      }
      return pts;
    }

    // Parse polygon data with arc support (state machine parser)
    function _parseOutlinePolygon(polyObj) {
      if (!polyObj || !polyObj.polygon || !Array.isArray(polyObj.polygon)) return null;
      var poly = polyObj.polygon;
      var points = [];

      if (poly[0] === 'R' && poly.length >= 5) {
        var rOx = poly[1] * MIL_TO_MM, rOy = poly[2] * MIL_TO_MM;
        var rW = poly[3] * MIL_TO_MM, rH = poly[4] * MIL_TO_MM;
        var rAngle = (poly.length >= 6 ? poly[5] : 0) * Math.PI / 180;
        var rCos = Math.cos(rAngle), rSin = Math.sin(rAngle);
        var rLocalCorners = [[0, 0], [rW, 0], [rW, -rH], [0, -rH]];
        for (var ri = 0; ri < 4; ri++) {
          var rdx = rLocalCorners[ri][0], rdy = rLocalCorners[ri][1];
          points.push({ x: rOx + rdx * rCos - rdy * rSin, y: rOy + rdx * rSin + rdy * rCos });
        }
      } else {
        var pidx = 0;
        var pCurX = 0, pCurY = 0;
        while (pidx < poly.length) {
          if (typeof poly[pidx] === 'string') {
            var pcmd = poly[pidx].toUpperCase();
            pidx++;
            if (pcmd === 'A' || pcmd === 'ARC') {
              if (pidx + 2 < poly.length && typeof poly[pidx] === 'number' &&
                  typeof poly[pidx+1] === 'number' && typeof poly[pidx+2] === 'number') {
                var isEdaArc = (pidx + 3 >= poly.length || typeof poly[pidx+3] === 'string');
                if (isEdaArc) {
                  var arcAngleDeg = poly[pidx];
                  var aEndX = poly[pidx+1] * MIL_TO_MM;
                  var aEndY = poly[pidx+2] * MIL_TO_MM;
                  pidx += 3;
                  var arcPts = _approxArcEda(pCurX, pCurY, aEndX, aEndY, arcAngleDeg, 18);
                  for (var api2 = 0; api2 < arcPts.length; api2++) {
                    points.push(arcPts[api2]);
                  }
                  pCurX = aEndX; pCurY = aEndY;
                } else if (pidx + 6 < poly.length) {
                  var aRx = Math.abs(poly[pidx]) * MIL_TO_MM;
                  var aRy = Math.abs(poly[pidx+1]) * MIL_TO_MM;
                  var aLargeArc = poly[pidx+3];
                  var aSweep = poly[pidx+4];
                  var aEndX2 = poly[pidx+5] * MIL_TO_MM;
                  var aEndY2 = poly[pidx+6] * MIL_TO_MM;
                  pidx += 7;
                  var arcPts2 = _approxArc(pCurX, pCurY, aEndX2, aEndY2, aRx, aRy, aLargeArc, aSweep, 18);
                  for (var api3 = 0; api3 < arcPts2.length; api3++) {
                    points.push(arcPts2[api3]);
                  }
                  pCurX = aEndX2; pCurY = aEndY2;
                }
              }
              continue;
            }
            continue;
          }
          if (typeof poly[pidx] === 'number' && pidx + 1 < poly.length && typeof poly[pidx+1] === 'number') {
            var ppx = poly[pidx] * MIL_TO_MM;
            var ppy = poly[pidx+1] * MIL_TO_MM;
            points.push({ x: ppx, y: ppy });
            pCurX = ppx; pCurY = ppy;
            pidx += 2;
          } else {
            pidx++;
          }
        }
      }

      return points.length >= 3 ? points : null;
    }

    // ── Extract board outline ──
    try {
      var boardOutlineLayerId = null;
      for (var blid in result.apiLayerNames) {
        var lname = result.apiLayerNames[blid].toLowerCase();
        if (lname.indexOf('boardoutline') !== -1 || lname.indexOf('board outline') !== -1 ||
            lname.indexOf('板框') !== -1 || lname.indexOf('边框') !== -1) {
          boardOutlineLayerId = Number(blid);
          break;
        }
      }
      if (boardOutlineLayerId !== null) {
        var boardOutlinePoints = [];

        // Strategy 1: Polylines on outline layer (with arc support)
        try {
          if (eda.pcb_PrimitivePolyline && typeof eda.pcb_PrimitivePolyline.getAll === 'function') {
            var allPl = await eda.pcb_PrimitivePolyline.getAll();
            for (var pli = 0; pli < allPl.length; pli++) {
              if (allPl[pli].layer !== boardOutlineLayerId) continue;
              var polyProp = allPl[pli].polygon;
              var polyObj = null;
              try {
                if (typeof polyProp === 'string') polyObj = JSON.parse(polyProp);
                else if (typeof polyProp === 'object') polyObj = polyProp;
              } catch(e) {}
              if (!polyObj || !polyObj.polygon || !Array.isArray(polyObj.polygon)) continue;
              var parsedOutline = _parseOutlinePolygon(polyObj);
              if (parsedOutline && parsedOutline.length >= 3) {
                boardOutlinePoints = parsedOutline;
              }
              if (boardOutlinePoints.length >= 3) break;
            }
          }
        } catch(e) {}

        // Strategy 2: Chain line segments + arcs on outline layer
        if (boardOutlinePoints.length === 0) {
          try {
            var allLn = await eda.pcb_PrimitiveLine.getAll();
            var olSegments = [];
            for (var lni = 0; lni < allLn.length; lni++) {
              if (allLn[lni].layer === boardOutlineLayerId) {
                olSegments.push({ x1: allLn[lni].startX * MIL_TO_MM, y1: allLn[lni].startY * MIL_TO_MM,
                  x2: allLn[lni].endX * MIL_TO_MM, y2: allLn[lni].endY * MIL_TO_MM });
              }
            }
            // Also collect arc segments on outline layer
            try {
              var allArcs = await eda.pcb_PrimitiveArc.getAll();
              for (var oai = 0; oai < allArcs.length; oai++) {
                if (allArcs[oai].layer !== boardOutlineLayerId) continue;
                var oa = allArcs[oai];
                var oaSx = oa.startX * MIL_TO_MM, oaSy = oa.startY * MIL_TO_MM;
                var oaEx = oa.endX * MIL_TO_MM, oaEy = oa.endY * MIL_TO_MM;
                var oaAngle = oa.arcAngle || 0;
                if (Math.abs(oaAngle) > 0.1) {
                  var oaSegs = _approxArcEda(oaSx, oaSy, oaEx, oaEy, oaAngle, 18);
                  if (oaSegs.length > 0) {
                    var prevPt = { x: oaSx, y: oaSy };
                    for (var oasi = 0; oasi < oaSegs.length; oasi++) {
                      olSegments.push({ x1: prevPt.x, y1: prevPt.y, x2: oaSegs[oasi].x, y2: oaSegs[oasi].y });
                      prevPt = oaSegs[oasi];
                    }
                  }
                } else {
                  olSegments.push({ x1: oaSx, y1: oaSy, x2: oaEx, y2: oaEy });
                }
              }
            } catch(e) {}
            if (olSegments.length >= 3) {
              var usedSegs = new Array(olSegments.length);
              var chain = [{ x: olSegments[0].x1, y: olSegments[0].y1 }, { x: olSegments[0].x2, y: olSegments[0].y2 }];
              usedSegs[0] = true;
              var EPS = 0.01;
              for (var iter = 0; iter < olSegments.length; iter++) {
                var lastPt = chain[chain.length - 1];
                var found = false;
                for (var si = 0; si < olSegments.length; si++) {
                  if (usedSegs[si]) continue;
                  var s = olSegments[si];
                  if (Math.abs(s.x1 - lastPt.x) + Math.abs(s.y1 - lastPt.y) < EPS) {
                    chain.push({ x: s.x2, y: s.y2 }); usedSegs[si] = true; found = true; break;
                  } else if (Math.abs(s.x2 - lastPt.x) + Math.abs(s.y2 - lastPt.y) < EPS) {
                    chain.push({ x: s.x1, y: s.y1 }); usedSegs[si] = true; found = true; break;
                  }
                }
                if (!found) break;
              }
              if (chain.length >= 3) {
                var fp = chain[0], lp = chain[chain.length - 1];
                if (Math.abs(fp.x - lp.x) + Math.abs(fp.y - lp.y) < EPS) chain.pop();
              }
              if (chain.length >= 3) boardOutlinePoints = chain;
            }
          } catch(e) {}
        }

        // Filter out any null/NaN points
        boardOutlinePoints = boardOutlinePoints.filter(function(p) {
          return p && typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y);
        });
        result.boardOutline = boardOutlinePoints.length >= 3 ? boardOutlinePoints : null;
      }
    } catch(e) {}

    return result;
  }

  return __toCommonJS(src_exports);
})();
