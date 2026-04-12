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
  var version = "1.7.1";

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

        // Strategy 1: Polylines on outline layer
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
              var poly = polyObj.polygon;
              if (poly[0] === 'R' && poly.length >= 5) {
                var bx = poly[1] * MIL_TO_MM, by = poly[2] * MIL_TO_MM;
                var bw = poly[3] * MIL_TO_MM, bh = poly[4] * MIL_TO_MM;
                boardOutlinePoints = [
                  { x: bx, y: by - bh }, { x: bx + bw, y: by - bh },
                  { x: bx + bw, y: by }, { x: bx, y: by }
                ];
              } else {
                var bNums = [];
                for (var bni = 0; bni < poly.length; bni++) {
                  if (typeof poly[bni] === 'number') bNums.push(poly[bni]);
                }
                var bPts = [];
                for (var bni2 = 0; bni2 + 1 < bNums.length; bni2 += 2) {
                  bPts.push({ x: bNums[bni2] * MIL_TO_MM, y: bNums[bni2 + 1] * MIL_TO_MM });
                }
                if (bPts.length >= 3) boardOutlinePoints = bPts;
              }
              if (boardOutlinePoints.length >= 3) break;
            }
          }
        } catch(e) {}

        // Strategy 2: Chain line segments on outline layer
        if (boardOutlinePoints.length === 0) {
          try {
            var allLn = await eda.pcb_PrimitiveLine.getAll();
            var olLines = [];
            for (var lni = 0; lni < allLn.length; lni++) {
              if (allLn[lni].layer === boardOutlineLayerId) {
                olLines.push({ x1: allLn[lni].startX * MIL_TO_MM, y1: allLn[lni].startY * MIL_TO_MM,
                  x2: allLn[lni].endX * MIL_TO_MM, y2: allLn[lni].endY * MIL_TO_MM });
              }
            }
            if (olLines.length >= 3) {
              var usedSegs = new Array(olLines.length);
              var chain = [{ x: olLines[0].x1, y: olLines[0].y1 }, { x: olLines[0].x2, y: olLines[0].y2 }];
              usedSegs[0] = true;
              var EPS = 0.01;
              for (var iter = 0; iter < olLines.length; iter++) {
                var lastPt = chain[chain.length - 1];
                var found = false;
                for (var si = 0; si < olLines.length; si++) {
                  if (usedSegs[si]) continue;
                  var s = olLines[si];
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

        result.boardOutline = boardOutlinePoints.length >= 3 ? boardOutlinePoints : null;
      }
    } catch(e) {}

    return result;
  }

  return __toCommonJS(src_exports);
})();
