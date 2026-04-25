/**
 * impedance-calc.js
 * PCB trace impedance calculation engine.
 *
 * Models: Microstrip, Stripline, Coplanar Waveguide (CPWG), Differential.
 * References: IPC-2141A, Hammerstad & Jensen (1980), Wadell.
 */

var ImpedanceCalc = (function (exports) {
  'use strict';

  // ═══════════════════════════════════════
  // Constants and defaults
  // ═══════════════════════════════════════

  var DEFAULT_STACKUP = {
    er: 4.5,
    copperThickness: 0.035,
    boardThickness: 1.6,
    layers: {}
  };

  // Common PCB stackup presets (from JLCPCB EasyEDA layer export data)
  var STACKUP_PRESETS = {
    '2L-1.6mm-jlcpcb': {
      label: '2-Layer 1.6mm (JLCPCB)',
      layers: 2,
      boardThickness: 1.6,
      copperThickness: 0.04064,
      innerCopperThickness: 0.04064,
      er: 4.581,
      gaps: null,
      // Z0 correction vs JLCPCB Si9000: factor(u) = c0+c1*u+c2*u², u=w/h clamped to [uMin,uMax]
      z0CorrMs: [1.013436, -0.013826, 0.002564, 1.2, 3.2],
      // Zdiff correction vs JLCPCB Si9000 (s=0.2mm): Zdiff_corr = Zdiff_raw * (c0+c1*u+c2*u²)
      diffCorrMs: [0.645454, 0.050667, 0.098814, 0.11, 0.87]
    },

    // ── 4-Layer ───────────────────────────────────
    '4L-1.6mm-jlcpcb-7628': {
      label: '4-Layer 1.6mm (JLCPCB 7628) JLC04161H',
      layers: 4,
      boardThickness: 1.6,
      copperThickness: 0.04064,
      innerCopperThickness: 0.0152,
      er: 4.578,
      // εr calibrated vs JLCPCB Polar Si9000: PP 7628 Dk = 4.578, Core Dk = 5.155
      // L1→L2: PP 7628 RC49% 8.6mil 0.2104mm
      // L2→L3: Core 1.1mm H/HOZ 1.065mm
      // L3→L4: PP 7628 RC49% 8.6mil 0.2104mm
      gaps: [0.2104, 1.065, 0.2104],
      gapEr: [4.578, 5.155, 4.578],
      z0CorrMs: [1.014314, -0.015167, 0.003221, 1.0, 3.0],
      z0CorrSl: [
        [0.958744, 0.118261, -0.049965, 0.85, 2.4],
        [0.958744, 0.118261, -0.049965, 0.85, 2.4]
      ],
      diffCorrMs: [0.868144, 0.081869, -0.012123, 0.48, 2.11],
      diffCorrSl: [
        [1.037535, -0.025572, 0.031314, 0.37, 1.65],
        [1.037535, -0.025572, 0.031314, 0.37, 1.65]
      ]
    },

    // ── 6-Layer ───────────────────────────────────
    '6L-1.6mm-jlcpcb-3313': {
      label: '6-Layer 1.6mm (JLCPCB 3313) JLC06161H',
      layers: 6,
      boardThickness: 1.6,
      copperThickness: 0.04064,
      innerCopperThickness: 0.0152,
      er: 4.1,
      // εr calibrated vs JLCPCB Polar Si9000: 3313 Dk = 4.1, 2116 Dk = 4.16, Core Dk = 4.716
      // L1→L2: PP 3313 RC57% 4.2mil 0.0994mm
      // L2→L3: Core 0.55mm H/H 0.55mm
      // L3→L4: PP 2116 RC54% 4.9mil 0.1088mm
      // L4→L5: Core 0.55mm H/H 0.55mm
      // L5→L6: PP 3313 RC57% 4.2mil 0.0994mm
      gaps: [0.0994, 0.55, 0.1088, 0.55, 0.0994],
      gapEr: [4.1, 4.716, 4.16, 4.716, 4.1],
      z0CorrMs: [0.999023, -0.002007, 0.000840, 1.0, 4.0],
      z0CorrSl: [
        [1.003019, -0.010567, 0.003639, 0.8, 3.5],
        [1.001246, -0.009527, 0.003406, 0.8, 3.5],
        [1.001246, -0.009527, 0.003406, 0.8, 3.5],
        [1.003019, -0.010567, 0.003639, 0.8, 3.5]
      ],
      diffCorrMs: [0.922783, 0.012039, 0.002727, 0.6, 2.43],
      diffCorrSl: [
        [1.064745, -0.032717, 0.018293, 0.53, 2.08],
        [1.048268, -0.020277, 0.014497, 0.51, 2.03],
        [1.048268, -0.020277, 0.014497, 0.51, 2.03],
        [1.064745, -0.032717, 0.018293, 0.53, 2.08]
      ]
    },

    // ── 8-Layer ───────────────────────────────────
    '8L-1.6mm-jlcpcb-2116': {
      label: '8-Layer 1.6mm (JLCPCB 2116) JLC08161H',
      layers: 8,
      boardThickness: 1.6,
      copperThickness: 0.04064,
      innerCopperThickness: 0.0152,
      er: 4.16,
      // εr calibrated vs JLCPCB Polar Si9000: 2116 Dk = 4.16, 1080 Dk = 3.91, Core Dk = 4.388
      // L1→L2: PP 2116 RC54% 4.9mil 0.1164mm
      // L2→L3: Core 0.3mm H/HOZ 0.3mm
      // L3→L4: 2×PP 1080 RC67% 3.3mil = 0.0764+0.0764 = 0.1528mm
      // L4→L5: Core 0.3mm H/HOZ 0.3mm
      // L5→L6: 2×PP 1080 RC67% 3.3mil = 0.0764+0.0764 = 0.1528mm
      // L6→L7: Core 0.3mm H/HOZ 0.3mm
      // L7→L8: PP 2116 RC54% 4.9mil 0.1164mm
      gaps: [0.1164, 0.3, 0.1528, 0.3, 0.1528, 0.3, 0.1164],
      gapEr: [4.16, 4.388, 3.91, 4.388, 3.91, 4.388, 4.16],
      z0CorrMs: [0.998190, -0.000577, 0.000528, 1.0, 4.0],
      z0CorrSl: [
        [1.012955, -0.017940, 0.004619, 0.7, 3.0],
        [1.012713, -0.017679, 0.004222, 0.7, 3.0],
        [1.012713, -0.017679, 0.004222, 0.7, 3.0],
        [1.012713, -0.017679, 0.004222, 0.7, 3.0],
        [1.012713, -0.017679, 0.004222, 0.7, 3.0],
        [1.012955, -0.017940, 0.004619, 0.7, 3.0]
      ],
      diffCorrMs: [0.912298, 0.023137, 0.000473, 0.59, 2.38],
      diffCorrSl: [
        [1.004171, -0.013122, 0.012364, 0.48, 1.9],
        [0.978841, 0.007228, 0.007443, 0.45, 1.79],
        [0.978841, 0.007228, 0.007443, 0.45, 1.79],
        [0.978841, 0.007228, 0.007443, 0.45, 1.79],
        [0.978841, 0.007228, 0.007443, 0.45, 1.79],
        [1.004171, -0.013122, 0.012364, 0.48, 1.9]
      ]
    }
  };

  // EasyEDA Pro layer ID mapping (discovered from actual API data)
  // Copper layers: 1 (TopLayer), 2 (BottomLayer), 15-46 (Inner1-Inner32)
  // Everything else is non-copper (silkscreen, solder mask, mechanical, etc.)
  //
  // Since EasyEDA Pro does not expose a stackup API, we detect copper layers
  // dynamically from the primitives present in the board.

  // Well-known layer IDs (only Top/Bottom are guaranteed)
  var KNOWN_LAYERS = {
    1:  { name: 'TopLayer',    type: 'microstrip', h: 0.2, er: 4.5 },
    2:  { name: 'BottomLayer', type: 'microstrip', h: 0.2, er: 4.5 }
  };

  /**
   * Determine if a layer ID is a copper layer.
   * Copper layers in EasyEDA Pro: 1 (Top), 2 (Bottom), 15-46 (Inner1-Inner32).
   * All other IDs (silkscreen, solder mask, paste, mechanical, multi-layer,
   * hole, pin floating, 3D shell, drill, stiffener, custom, dielectric, etc.)
   * are NOT copper.
   */
  function isCopperLayer(layerId) {
    if (layerId === 1 || layerId === 2) return true;
    if (layerId >= 15 && layerId <= 46) return true;
    return false;
  }

  // JLCPCB manufacturing parameters (from impedance calculator user guide)
  // NOTE: Soldermask (εr=3.8, 0.6mil over Cu) and etch taper (top = base − 0.7mil)
  // partially cancel each other in practice (~+2Ω etch vs ~−0.5Ω SM for typical traces).
  // Analytical approximations for these effects are too aggressive and produce worse
  // results than the raw formulas.
  //
  // Calibration vs JLCPCB Polar Si9000 field solver (8L JLC08161H-2116):
  //   Microstrip: Schneider εr_eff + H&J Z0_air + Wheeler thickness → max 0.6% error
  //   Stripline Method A (weighted-avg εr): extreme offset (h2/h1>2.2) → max 0.95%
  //   Stripline Method B (per-gap εr, C/C0): moderate offset → max 0.67%
  //   Overall hybrid: <1% error across all layers at 30/50/60Ω

  /**
   * Apply empirical Z0 correction polynomial.
   * factor(u) = c[0] + c[1]*u + c[2]*u², u = w/h clamped to [c[3], c[4]].
   * Calibrated per preset vs JLCPCB Polar Si9000 field solver.
   */
  function applyZ0Corr(z0, w, h1, corr) {
    if (!corr) return z0;
    var u = w / h1;
    if (corr.length >= 5) u = Math.max(corr[3], Math.min(corr[4], u));
    return z0 * (corr[0] + corr[1] * u + corr[2] * u * u);
  }

  /**
   * Build stackup automatically from PCB data.
   * Detects copper layers dynamically from traces and copper pours.
   * Infers physical order: Top(1) → inner layers (sorted) → Bottom(2).
   * Calculates dielectric height to nearest reference plane.
   *
   * @param {object} pcbData - Extracted PCB data with lines, arcs, zones
   * @param {number} boardThickness - Total board thickness in mm (default 1.6)
   * @returns {object} Stackup configuration
   */
  function buildStackup(pcbData, boardThickness, presetGaps, presetEr, outerCuThickness, innerCuThickness, presetGapEr, presetZ0CorrMs, presetZ0CorrSl, presetDiffCorrMs, presetDiffCorrSl) {
    if (!boardThickness) boardThickness = 1.6;
    if (!presetEr) presetEr = 4.6;
    if (!outerCuThickness) outerCuThickness = 0.04064;
    if (!innerCuThickness) innerCuThickness = 0.0152;

    // API-provided data (from pcb_Layer.getTheNumberOfCopperLayers / getAllLayers)
    var apiCopperCount = pcbData.copperLayerCount || null;
    var apiNames = pcbData.apiLayerNames || {};

    // Collect all layers with traces (signal layers)
    var signalLayers = {};
    pcbData.lines.forEach(function(l) { signalLayers[l.layer] = true; });
    pcbData.arcs.forEach(function(a) { signalLayers[a.layer] = true; });

    // Collect all layers with copper pours/zones (reference planes)
    var planeLayers = {};
    if (pcbData.zones) {
      pcbData.zones.forEach(function(z) {
        if (isCopperLayer(z.layer)) {
          planeLayers[z.layer] = z.net || 'GND';
        }
      });
    }

    // Merge into a set of ALL copper layers present on the board
    var allCopperLayers = {};
    for (var k in signalLayers) {
      if (isCopperLayer(Number(k))) allCopperLayers[k] = true;
    }
    for (var k in planeLayers) {
      allCopperLayers[k] = true;
    }

    // Determine physical order: Top(1) first, Bottom(2) last, inner sorted between
    var innerLayers = [];
    var hasTop = false, hasBottom = false;
    for (var id in allCopperLayers) {
      var n = Number(id);
      if (n === 1) { hasTop = true; }
      else if (n === 2) { hasBottom = true; }
      else { innerLayers.push(n); }
    }
    // Sort inner layers by their ID (physical order in EasyEDA)
    innerLayers.sort(function(a, b) { return a - b; });

    // Build ordered layer list: Top → inner... → Bottom
    var layerOrder = [];
    if (hasTop) layerOrder.push(1);
    layerOrder = layerOrder.concat(innerLayers);
    if (hasBottom) layerOrder.push(2);

    var numLayers = layerOrder.length;

    // Calculate spacing between adjacent copper layers
    var spacings = {}; // spacings[i] = gap between layerOrder[i] and layerOrder[i+1]
    var gapErValues = {}; // gapErValues[i] = εr for gap i
    if (numLayers >= 2) {
      var numGaps = numLayers - 1;

      if (presetGaps && presetGaps.length === numGaps) {
        // Preset gaps match exactly — use them directly
        for (var pg = 0; pg < numGaps; pg++) {
          spacings[pg] = presetGaps[pg];
          gapErValues[pg] = (presetGapEr && presetGapEr[pg] !== undefined) ? presetGapEr[pg] : presetEr;
        }
      } else if (presetGaps && presetGaps.length > numGaps) {
        // Preset expects MORE layers than detected (e.g. 4-layer preset, 3 detected)
        // Build expected full layer order for the preset
        var expectedLayerCount = presetGaps.length + 1;
        var expectedInnerCount = expectedLayerCount - 2; // minus Top and Bottom
        var expectedInnerIds = [];
        // Expected inner layer IDs: 15, 16, 17... (EasyEDA convention)
        for (var ei = 0; ei < expectedInnerCount; ei++) {
          expectedInnerIds.push(15 + ei);
        }
        // Expected full order: Top(1) → [15, 16, ...] → Bottom(2)
        var expectedOrder = [1].concat(expectedInnerIds).concat([2]);

        // Map detected layers to their position in the expected order
        // For each detected gap (between consecutive detected layers),
        // sum all preset gaps between those two expected positions
        for (var dg = 0; dg < numGaps; dg++) {
          var fromLayer = layerOrder[dg];
          var toLayer = layerOrder[dg + 1];
          var fromPos = expectedOrder.indexOf(fromLayer);
          var toPos = expectedOrder.indexOf(toLayer);

          // If a layer ID isn't in expected order, find nearest position
          if (fromPos === -1) {
            // Unknown inner layer — estimate position by ID
            if (fromLayer === 1) fromPos = 0;
            else if (fromLayer === 2) fromPos = expectedOrder.length - 1;
            else fromPos = Math.min(fromLayer - 14, expectedOrder.length - 2);
          }
          if (toPos === -1) {
            if (toLayer === 1) toPos = 0;
            else if (toLayer === 2) toPos = expectedOrder.length - 1;
            else toPos = Math.min(toLayer - 14, expectedOrder.length - 2);
          }

          // Sum all preset gaps between fromPos and toPos
          var gapSum = 0;
          var erWeightedSum = 0;
          for (var gs = Math.min(fromPos, toPos); gs < Math.max(fromPos, toPos); gs++) {
            var gd = presetGaps[gs] || 0;
            gapSum += gd;
            erWeightedSum += gd * ((presetGapEr && presetGapEr[gs] !== undefined) ? presetGapEr[gs] : presetEr);
          }
          spacings[dg] = gapSum > 0 ? gapSum : boardThickness / numGaps;
          gapErValues[dg] = gapSum > 0 ? erWeightedSum / gapSum : presetEr;
        }
      } else if (numGaps === 1) {
        // 2L: dielectric gap = board thickness minus both copper layers
        spacings[0] = boardThickness - 2 * outerCuThickness;
        gapErValues[0] = presetEr;
      } else {
        // No preset or preset has fewer gaps — distribute evenly
        var evenGap = boardThickness / numGaps;
        for (var g = 0; g < numGaps; g++) {
          spacings[g] = evenGap;
          gapErValues[g] = presetEr;
        }
      }
    }

    // Build stackup config for each copper layer
    var stackupLayers = {};
    for (var si = 0; si < layerOrder.length; si++) {
      var layerNum = layerOrder[si];

      // Name the layer — prefer API name if available
      var layerName;
      if (apiNames[layerNum]) {
        layerName = apiNames[layerNum];
      } else if (layerNum === 1) layerName = 'TopLayer';
      else if (layerNum === 2) layerName = 'BottomLayer';
      else {
        var innerIdx = innerLayers.indexOf(layerNum);
        layerName = 'InnerLayer' + (innerIdx + 1) + ' (id:' + layerNum + ')';
      }

      // Find nearest reference plane
      var hToPlane = null;
      var hasPlaneAbove = false;
      var hasPlaneBelow = false;

      // Search upward (toward top)
      var distUp = 0;
      var erGapsUp = [];
      for (var u = si - 1; u >= 0; u--) {
        var gapD = spacings[u] || 0.2;
        distUp += gapD;
        erGapsUp.push({ dist: gapD, er: gapErValues[u] || presetEr });
        if (planeLayers[layerOrder[u]]) {
          hasPlaneAbove = true;
          if (hToPlane === null || distUp < hToPlane) hToPlane = distUp;
          break;
        }
      }

      // Search downward (toward bottom)
      var distDown = 0;
      var erGapsDown = [];
      for (var d = si; d < layerOrder.length - 1; d++) {
        var gapD = spacings[d] || 0.2;
        distDown += gapD;
        erGapsDown.push({ dist: gapD, er: gapErValues[d] || presetEr });
        if (planeLayers[layerOrder[d + 1]]) {
          hasPlaneBelow = true;
          if (hToPlane === null || distDown < hToPlane) hToPlane = distDown;
          break;
        }
      }

      // Determine model based on reference plane positions
      var type;
      var bStripline = null; // total distance between planes (for stripline)
      var classReason = '';
      if (planeLayers[layerNum] && !signalLayers[layerNum]) {
        type = null; // Pure reference plane — no signal traces to analyze
        classReason = 'pure_plane (has pour "' + planeLayers[layerNum] + '", no traces)';
      } else if (hasPlaneAbove && hasPlaneBelow) {
        type = 'stripline';
        bStripline = distUp + distDown; // total plane-to-plane separation
        classReason = 'stripline (plane above at ' + r3(distUp) + 'mm, plane below at ' + r3(distDown) + 'mm, b=' + r3(bStripline) + 'mm)';
        if (planeLayers[layerNum] && signalLayers[layerNum]) {
          classReason += ' [NOTE: also has pour "' + planeLayers[layerNum] + '" but has traces too]';
        }
      } else if (hasPlaneAbove || hasPlaneBelow) {
        type = 'microstrip';
        classReason = 'microstrip (plane ' + (hasPlaneAbove ? 'above at ' + r3(distUp) + 'mm' : 'below at ' + r3(distDown) + 'mm') + ')';
        if (planeLayers[layerNum] && signalLayers[layerNum]) {
          classReason += ' [NOTE: also has pour "' + planeLayers[layerNum] + '" but has traces too]';
        }
      } else {
        type = 'microstrip';
        hToPlane = boardThickness;
        classReason = 'microstrip_fallback (no ref planes found, using boardThickness=' + boardThickness + 'mm)';
      }

      if (hToPlane === null) hToPlane = 0.2;

      // Compute per-layer εr from gap dielectric constants
      var layerEr = presetEr;
      if (type === 'microstrip') {
        // Use εr from the gap(s) to the reference plane
        var erGaps = (hasPlaneAbove && erGapsUp.length > 0) ? erGapsUp :
                     (hasPlaneBelow && erGapsDown.length > 0) ? erGapsDown : [];
        if (erGaps.length === 1) {
          layerEr = erGaps[0].er;
        } else if (erGaps.length > 1) {
          var totalD = 0, erW = 0;
          for (var eg = 0; eg < erGaps.length; eg++) { totalD += erGaps[eg].dist; erW += erGaps[eg].er * erGaps[eg].dist; }
          layerEr = totalD > 0 ? erW / totalD : presetEr;
        }
      } else if (type === 'stripline') {
        // Weighted average of all gaps (above and below) to reference planes
        var allGaps = erGapsUp.concat(erGapsDown);
        if (allGaps.length > 0) {
          var totalD = 0, erW = 0;
          for (var eg = 0; eg < allGaps.length; eg++) { totalD += allGaps[eg].dist; erW += allGaps[eg].er * allGaps[eg].dist; }
          layerEr = totalD > 0 ? erW / totalD : presetEr;
        }
        // Per-gap εr for conformal mapping Method B
        var erUp = presetEr, erDown = presetEr;
        if (erGapsUp.length > 0) {
          var tU = 0, wU = 0;
          for (var eu = 0; eu < erGapsUp.length; eu++) { tU += erGapsUp[eu].dist; wU += erGapsUp[eu].er * erGapsUp[eu].dist; }
          erUp = tU > 0 ? wU / tU : presetEr;
        }
        if (erGapsDown.length > 0) {
          var tD = 0, wD = 0;
          for (var ed = 0; ed < erGapsDown.length; ed++) { tD += erGapsDown[ed].dist; wD += erGapsDown[ed].er * erGapsDown[ed].dist; }
          erDown = tD > 0 ? wD / tD : presetEr;
        }
      }

      // Copper thickness: outer layers 1oz (finished), inner layers 0.5oz
      var isOuterLayer = (layerNum === 1 || layerNum === 2);
      var layerCuT = isOuterLayer ? outerCuThickness : innerCuThickness;

      // Z0 correction polynomial (calibrated vs JLCPCB Polar Si9000)
      var layerZ0Corr = null;
      if (isOuterLayer && presetZ0CorrMs) {
        layerZ0Corr = presetZ0CorrMs;
      } else if (!isOuterLayer && presetZ0CorrSl) {
        var innerIdx = innerLayers.indexOf(layerNum);
        if (innerIdx >= 0 && innerIdx < presetZ0CorrSl.length) {
          layerZ0Corr = presetZ0CorrSl[innerIdx];
        }
      }

      // Zdiff correction polynomial (calibrated vs JLCPCB Polar Si9000)
      var layerDiffCorr = null;
      if (isOuterLayer && presetDiffCorrMs) {
        layerDiffCorr = presetDiffCorrMs;
      } else if (!isOuterLayer && presetDiffCorrSl) {
        var innerIdx2 = innerLayers.indexOf(layerNum);
        if (innerIdx2 >= 0 && innerIdx2 < presetDiffCorrSl.length) {
          layerDiffCorr = presetDiffCorrSl[innerIdx2];
        }
      }

      stackupLayers[layerNum] = {
        name: layerName,
        type: type,
        h: r3(hToPlane),
        b: bStripline ? r3(bStripline) : null,
        er: r3(layerEr),
        erNear: (type === 'stripline') ? r3(distUp <= distDown ? erUp : erDown) : null,
        erFar:  (type === 'stripline') ? r3(distUp <= distDown ? erDown : erUp) : null,
        copperT: layerCuT,
        z0Corr: layerZ0Corr,
        diffCorr: layerDiffCorr,
        isPlane: !!planeLayers[layerNum],
        planeNet: planeLayers[layerNum] || null,
        hasTraces: !!signalLayers[layerNum],
        isOuter: isOuterLayer,
        _classReason: classReason
      };
    }

    return {
      er: presetEr,
      copperThickness: outerCuThickness,
      innerCopperThickness: innerCuThickness,
      boardThickness: boardThickness,
      layers: stackupLayers,
      detectedPlanes: planeLayers,
      layerOrder: layerOrder,
      spacings: spacings,
      gapErValues: gapErValues,
      _debug: {
        signalLayers: Object.keys(signalLayers).map(Number),
        planeLayers: Object.keys(planeLayers).map(function(k) { return { layer: Number(k), net: planeLayers[k] }; }),
        allCopperLayers: Object.keys(allCopperLayers).map(Number),
        numLayers: numLayers,
        apiCopperCount: apiCopperCount,
        presetGapsUsed: presetGaps || null,
        presetGapsCount: presetGaps ? presetGaps.length : 0,
        detectedGapsCount: numLayers > 1 ? numLayers - 1 : 0,
        gapMergeUsed: presetGaps ? (presetGaps.length > (numLayers > 1 ? numLayers - 1 : 0)) : false
      }
    };
  }

  // ═══════════════════════════════════════
  // Impedance calculations
  // ═══════════════════════════════════════

  /**
   * Microstrip — outer layer trace.
   * Hammerstad & Jensen Z0 (1980) with Schneider εr_eff.
   *
   * @param {number} w  - Trace width (mm)
   * @param {number} h  - Dielectric height (mm)
   * @param {number} t  - Copper thickness (mm)
   * @param {number} er - Relative dielectric constant
   * @returns {{ z0: number, erEff: number, model: string }}
   */
  function microstrip(w, h, t, er) {
    var wEff = w;
    if (t > 0 && h > 0) {
      var dw = (t / Math.PI) * Math.log(4 * Math.E / Math.sqrt(
        Math.pow(t / h, 2) + Math.pow(t / (w * Math.PI + 1.1 * t * Math.PI), 2)
      ));
      wEff = w + dw;
    }

    var u = wEff / h;
    var erEff = ((er + 1) / 2) + ((er - 1) / 2) * Math.pow(1 + 10 / u, -0.5);

    var z0Free;
    if (u <= 1) {
      z0Free = 60 * Math.log((8 / u) + (u / 4));
    } else {
      z0Free = 120 * Math.PI / (u + 1.393 + 0.667 * Math.log(u + 1.444));
    }

    var z0 = z0Free / Math.sqrt(erEff);
    return { z0: r2(z0), erEff: r2(erEff), model: 'Microstrip' };
  }

  // ─── AGM-based complete elliptic integral K(k) ──────────────────
  function agm_(a, b) {
    for (var i = 0; i < 30; i++) {
      var an = (a + b) / 2;
      var bn = Math.sqrt(a * b);
      if (Math.abs(an - bn) < 1e-15) break;
      a = an; b = bn;
    }
    return a;
  }
  function ellipK(k) {
    if (k >= 1) return 1e10;
    if (k <= 0) return Math.PI / 2;
    return Math.PI / (2 * agm_(1, Math.sqrt(1 - k * k)));
  }

  /**
   * Stripline — trace embedded between two planes.
   * Conformal mapping (Cohn) with Wheeler thickness correction.
   * Hybrid A/B: uses per-gap εr (Method B, C/C0) for moderate offsets
   * and weighted-avg εr (Method A) for extreme offsets (h2/h1 > 2.2).
   *
   * @param {number} w      - Trace width (mm)
   * @param {number} b      - Total distance between planes (mm)
   * @param {number} t      - Copper thickness (mm)
   * @param {number} er     - Weighted-average dielectric constant
   * @param {number} hNear  - (optional) Distance to nearest plane (mm). If omitted, centered.
   * @param {number} erNear - (optional) εr of the gap on the near side
   * @param {number} erFar  - (optional) εr of the gap on the far side
   * @returns {{ z0: number, erEff: number, model: string }}
   */
  function stripline(w, b, t, er, hNear, erNear, erFar) {
    if (!b || b <= 0) return { z0: 0, erEff: r2(er), model: 'Stripline' };

    // Determine h1 (near plane) and h2 (far plane) from b and hNear
    var h1, h2;
    if (hNear && hNear > 0 && hNear < b) {
      h1 = Math.min(hNear, b - hNear);
      h2 = b - h1;
    } else {
      h1 = b / 2;
      h2 = b / 2;
    }

    // Wheeler thickness correction → effective width for zero-thickness model
    var wEff = w;
    if (t > 0 && h1 > 0) {
      var dw = (t / Math.PI) * Math.log(4 * Math.E / Math.sqrt(
        Math.pow(t / h1, 2) + Math.pow(t / (Math.PI * w + 1.1 * Math.PI * t), 2)
      ));
      wEff = w + dw;
    }

    // Conformal mapping: K(k_i)/K(k'_i) for each ground plane
    var k1 = Math.tanh(Math.PI * wEff / (4 * h1));
    var k2 = Math.tanh(Math.PI * wEff / (4 * h2));
    var kp1 = Math.sqrt(Math.max(1e-30, 1 - k1 * k1));
    var kp2 = Math.sqrt(Math.max(1e-30, 1 - k2 * k2));

    var f1 = ellipK(k1) / ellipK(kp1);
    var f2 = ellipK(k2) / ellipK(kp2);
    var fTotal = f1 + f2;

    var z0;
    var ratio = h2 / h1;
    if (erNear && erFar && ratio < 2.2) {
      // Method B (per-gap εr, C/C0 approach) — better for moderate offsets
      var er1 = (hNear <= b - hNear) ? erNear : erFar;
      var er2 = (hNear <= b - hNear) ? erFar : erNear;
      var fEr = er1 * f1 + er2 * f2;
      z0 = 377 / (2 * Math.sqrt(fTotal * fEr));
    } else {
      // Method A (weighted-avg εr) — better for extreme offsets or fallback
      z0 = 377 / (2 * Math.sqrt(er)) / fTotal;
    }

    // Detect offset for model label
    var model = 'Stripline';
    if (ratio > 2.0) model = 'Offset Stripline';

    return { z0: r2(z0), erEff: r2(er), model: model };
  }

  /**
   * Differential Microstrip.
   * @param {number} w  - Width of each trace (mm)
   * @param {number} h  - Dielectric height (mm)
   * @param {number} t  - Copper thickness (mm)
   * @param {number} s  - Spacing between traces (mm)
   * @param {number} er - Dielectric constant
   * @returns {{ zDiff: number, zOdd: number, zEven: number, z0Single: number, model: string }}
   */
  function differentialMicrostrip(w, h, t, s, er) {
    var single = microstrip(w, h, t, er);
    var u = w / h;
    var g = s / h;
    var kOdd = Math.exp(-0.627 * Math.pow(er, 0.327) * g * Math.pow(u, -0.11));
    var zOdd = single.z0 * (1 - 0.347 * kOdd);
    var zEven = single.z0 * (1 + 0.347 * kOdd);
    var zDiff = 2 * zOdd;

    return {
      zDiff: r2(zDiff), zOdd: r2(zOdd), zEven: r2(zEven),
      z0Single: single.z0, model: 'Differential Microstrip'
    };
  }

  /**
   * Differential Stripline (edge-coupled).
   * @param {number} w  - Width of each trace (mm)
   * @param {number} b  - Total plane-to-plane distance (mm)
   * @param {number} t  - Copper thickness (mm)
   * @param {number} s  - Spacing between traces (mm)
   * @param {number} er - Dielectric constant
   * @param {number} hNear - Distance to nearest plane (mm, optional)
   * @param {number} erNear - εr of the gap on the near side (optional)
   * @param {number} erFar  - εr of the gap on the far side (optional)
   * @returns {{ zDiff: number, zOdd: number, z0Single: number, model: string }}
   */
  function differentialStripline(w, b, t, s, er, hNear, erNear, erFar) {
    var single = stripline(w, b, t, er, hNear, erNear, erFar);
    // Edge-coupled stripline coupling factor (IPC-2141A / Wadell)
    var k = Math.exp(-2.9 * s / b);
    var zOdd = single.z0 * (1 - 0.347 * k);
    var zDiff = 2 * zOdd;

    return {
      zDiff: r2(zDiff), zOdd: r2(zOdd),
      z0Single: single.z0, model: 'Differential Stripline'
    };
  }

  /**
   * Advanced width-for-Z₀ solver supporting single-ended and differential,
   * microstrip and stripline, with explicit top/bottom reference planes.
   *
   * @param {object} opts
   * @param {number} opts.targetZ0  - Target impedance (Ω)
   * @param {string} opts.type      - 'single' or 'differential'
   * @param {string} opts.model     - 'microstrip' or 'stripline'
   * @param {number} opts.h         - Dielectric height to nearest ref plane (mm)
   * @param {number} opts.b         - Total plane-to-plane distance (mm, stripline)
   * @param {number} opts.t         - Copper thickness (mm)
   * @param {number} opts.er        - Dielectric constant
   * @param {number} opts.spacing   - Trace spacing (mm, differential only)
   * @returns {{ width: number|null, z0: number, model: string, error: string? }}
   */
  function calcWidthForZ0Adv(opts) {
    var targetZ0 = opts.targetZ0;
    var type = opts.type || 'single';
    var model = opts.model || 'microstrip';
    var h = opts.h;
    var b = opts.b;
    var t = opts.t;
    var er = opts.er;
    var spacing = opts.spacing;
    var erNear = opts.erNear;
    var erFar = opts.erFar;
    var z0Corr = opts.z0Corr || null;
    var diffCorr = opts.diffCorr || null;

    if (!targetZ0 || targetZ0 <= 0) return { width: null, error: 'Invalid target Z₀' };
    if (!h || h <= 0) return { width: null, error: 'Invalid dielectric height' };
    if (type === 'differential' && (!spacing || spacing <= 0)) return { width: null, error: 'Invalid spacing for differential' };

    var wMin = 0.005;
    var wMax = 15.0;

    var calcZ0 = function(w) {
      var rawZ0;
      if (type === 'differential') {
        if (model === 'stripline') {
          rawZ0 = differentialStripline(w, b || h * 2, t, spacing, er, h, erNear, erFar).zDiff;
        } else {
          rawZ0 = differentialMicrostrip(w, h, t, spacing, er).zDiff;
        }
        if (diffCorr) rawZ0 = applyZ0Corr(rawZ0, w, h, diffCorr);
      } else {
        if (model === 'stripline') {
          rawZ0 = stripline(w, b || h * 2, t, er, h, erNear, erFar).z0;
        } else {
          rawZ0 = microstrip(w, h, t, er).z0;
        }
        if (z0Corr) rawZ0 = applyZ0Corr(rawZ0, w, h, z0Corr);
      }
      return rawZ0;
    };

    var z0AtMin = calcZ0(wMin);
    var z0AtMax = calcZ0(wMax);

    if (targetZ0 > z0AtMin) return { width: null, error: 'Target too high (max ~' + r2(z0AtMin) + 'Ω at ' + wMin + 'mm)' };
    if (targetZ0 < z0AtMax) return { width: null, error: 'Target too low (min ~' + r2(z0AtMax) + 'Ω at ' + wMax + 'mm)' };

    for (var iter = 0; iter < 100; iter++) {
      var wMid = (wMin + wMax) / 2;
      var z0Mid = calcZ0(wMid);

      if (Math.abs(z0Mid - targetZ0) < 0.01) {
        var resultModel = (type === 'differential' ? 'Diff. ' : '') + (model === 'stripline' ? 'Stripline' : 'Microstrip');
        return { width: r3(wMid), z0: r2(z0Mid), model: resultModel };
      }

      if (z0Mid > targetZ0) {
        wMin = wMid;
      } else {
        wMax = wMid;
      }
    }

    var wResult = (wMin + wMax) / 2;
    var resultModel = (type === 'differential' ? 'Diff. ' : '') + (model === 'stripline' ? 'Stripline' : 'Microstrip');
    return { width: r3(wResult), z0: r2(calcZ0(wResult)), model: resultModel };
  }

  // ═══════════════════════════════════════
  // PCB data analysis
  // ═══════════════════════════════════════

  /**
   * Analyze all PCB data and calculate impedance per segment.
   * @param {object} pcbData - Data extracted from EasyEDA Pro
   * @param {object} stackup - Stackup configuration
   * @returns {object} Analysis results
   */
  function analyzeAll(pcbData, stackup) {
    var results = [];
    var netStats = {};

    // Straight traces
    for (var i = 0; i < pcbData.lines.length; i++) {
      var line = pcbData.lines[i];
      var layerCfg = getLayerConfig(line.layer, stackup);
      if (!layerCfg || !layerCfg.type) continue;

      var width = line.width;
      var dx = line.endX - line.startX;
      var dy = line.endY - line.startY;
      var length = Math.sqrt(dx * dx + dy * dy);

      var imp = calcImpedance(width, layerCfg, stackup.copperThickness);
      var delay = Math.sqrt(imp.erEff) * 3.336; // ps/mm

      var entry = {
        id: line.id,
        type: 'Trace',
        net: line.net || '(no net)',
        layer: line.layer,
        layerName: layerCfg.name,
        width: r3(width),
        h: r3(layerCfg.h),
        b: layerCfg.b ? r3(layerCfg.b) : null,
        length: r3(length),
        model: imp.model,
        z0: imp.z0,
        erEff: imp.erEff,
        delay: r2(delay),
        formulaInputs: imp._inputs || null
      };
      results.push(entry);

      // Stats per net
      var netKey = entry.net;
      if (!netStats[netKey]) {
        netStats[netKey] = { count: 0, z0s: [], totalLength: 0 };
      }
      netStats[netKey].count++;
      netStats[netKey].z0s.push(imp.z0);
      netStats[netKey].totalLength += length;
    }

    // Arcs
    for (var i = 0; i < pcbData.arcs.length; i++) {
      var arc = pcbData.arcs[i];
      var layerCfg = getLayerConfig(arc.layer, stackup);
      if (!layerCfg || !layerCfg.type) continue;

      var width = arc.width;
      // Approximate arc length
      var dx = arc.endX - arc.startX;
      var dy = arc.endY - arc.startY;
      var chord = Math.sqrt(dx * dx + dy * dy);
      var angle = Math.abs(arc.arcAngle || 0) * Math.PI / 180;
      var arcLen = angle > 0.001 ? (chord / (2 * Math.sin(angle / 2))) * angle : chord;

      var imp = calcImpedance(width, layerCfg, stackup.copperThickness);
      var delay = Math.sqrt(imp.erEff) * 3.336;

      var entry = {
        id: arc.id,
        type: 'Arc',
        net: arc.net || '(no net)',
        layer: arc.layer,
        layerName: layerCfg.name,
        width: r3(width),
        h: r3(layerCfg.h),
        b: layerCfg.b ? r3(layerCfg.b) : null,
        length: r3(arcLen),
        model: imp.model,
        z0: imp.z0,
        erEff: imp.erEff,
        delay: r2(delay),
        formulaInputs: imp._inputs || null
      };
      results.push(entry);

      var netKey = entry.net;
      if (!netStats[netKey]) {
        netStats[netKey] = { count: 0, z0s: [], totalLength: 0 };
      }
      netStats[netKey].count++;
      netStats[netKey].z0s.push(imp.z0);
      netStats[netKey].totalLength += arcLen;
    }

    // Calculate overall statistics
    var allZ0 = results.map(function(r) { return r.z0; });
    var summary = {
      totalSegments: results.length,
      totalNets: Object.keys(netStats).length,
      z0Min: allZ0.length ? Math.min.apply(null, allZ0) : 0,
      z0Max: allZ0.length ? Math.max.apply(null, allZ0) : 0,
      z0Avg: allZ0.length ? r2(allZ0.reduce(function(a, b) { return a + b; }, 0) / allZ0.length) : 0
    };

    // Stats per net
    var netSummary = {};
    for (var key in netStats) {
      var ns = netStats[key];
      var z0s = ns.z0s;
      netSummary[key] = {
        count: ns.count,
        totalLength: r3(ns.totalLength),
        z0Min: r2(Math.min.apply(null, z0s)),
        z0Max: r2(Math.max.apply(null, z0s)),
        z0Avg: r2(z0s.reduce(function(a, b) { return a + b; }, 0) / z0s.length),
        uniform: (Math.max.apply(null, z0s) - Math.min.apply(null, z0s)) < 1
      };
    }

    return {
      results: results,
      summary: summary,
      netSummary: netSummary,
      stackup: stackup
    };
  }

  // ═══════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════

  function getLayerConfig(layerNum, stackup) {
    if (stackup.layers && stackup.layers[layerNum]) {
      return stackup.layers[layerNum];
    }
    if (KNOWN_LAYERS[layerNum]) {
      return KNOWN_LAYERS[layerNum];
    }
    // Unknown copper layer — treat as microstrip by default
    if (isCopperLayer(layerNum)) {
      return { name: 'Layer ' + layerNum, type: 'microstrip', h: 0.2, er: 4.5 };
    }
    return null; // Non-copper layer
  }

  function calcImpedance(width, layerCfg, copperThickness) {
    var t = layerCfg.copperT || copperThickness || 0.04064;
    if (layerCfg.type === 'stripline') {
      var b = layerCfg.b || (layerCfg.h * 2); // b = total plane-to-plane distance
      var result = stripline(width, b, t, layerCfg.er, layerCfg.h, layerCfg.erNear, layerCfg.erFar);
      if (layerCfg.z0Corr) {
        result.z0 = r2(applyZ0Corr(result.z0, width, layerCfg.h, layerCfg.z0Corr));
      }
      result._inputs = { w: r3(width), b: r3(b), h: r3(layerCfg.h), t: t, er: layerCfg.er, erNear: layerCfg.erNear, erFar: layerCfg.erFar };
      return result;
    } else {
      var result = microstrip(width, layerCfg.h, t, layerCfg.er);
      if (layerCfg.z0Corr) {
        result.z0 = r2(applyZ0Corr(result.z0, width, layerCfg.h, layerCfg.z0Corr));
      }
      result._inputs = { w: r3(width), h: r3(layerCfg.h), t: t, er: layerCfg.er };
      return result;
    }
  }

  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 10000) / 10000; }

  // ═══════════════════════════════════════
  // Cross-layer interference detection
  // ═══════════════════════════════════════

  /**
   * Check if all layers between two layers in the stackup are reference planes.
   * If so, the traces are shielded and cross-layer interference is suppressed.
   *
   * @param {number} layerA - First layer ID
   * @param {number} layerB - Second layer ID
   * @param {Array} layerOrder - Physical layer order [1, 15, 16, 2, ...]
   * @param {object} planeLayers - Map of layer ID → net for pure reference planes
   * @param {object} signalLayers - Map of layer ID → true for layers with traces
   * @returns {boolean} true if shielded by at least one plane between them
   */
  function isShieldedByPlane(layerA, layerB, layerOrder, planeLayers, signalLayers) {
    var posA = layerOrder.indexOf(layerA);
    var posB = layerOrder.indexOf(layerB);
    if (posA === -1 || posB === -1) return false;

    var lo = Math.min(posA, posB);
    var hi = Math.max(posA, posB);

    // If adjacent layers, no plane can be between them
    if (hi - lo <= 1) return false;

    // Check every layer between them — need at least one pure plane
    for (var k = lo + 1; k < hi; k++) {
      var midLayer = layerOrder[k];
      // A pure plane = has pour but no signal traces
      if (planeLayers[midLayer] && !signalLayers[midLayer]) {
        return true; // at least one shielding plane exists
      }
    }
    return false;
  }

  /**
   * Detect traces on different layers that cross or run parallel nearby.
   * These crossings can alter impedance due to capacitive coupling.
   * Crossings shielded by a reference plane between the two layers are excluded.
   *
   * @param {object} pcbData - Extracted PCB data
   * @param {object} stackup - Stackup from buildStackup (needs layerOrder, detectedPlanes)
   * @returns {Array} Array of crossing warnings
   */
  function detectCrossings(pcbData, stackup) {
    var crossings = [];
    var allSegs = [];

    // Collect all trace segments with layer info
    pcbData.lines.forEach(function(l) {
      allSegs.push({
        id: l.id, net: l.net, layer: l.layer,
        x1: l.startX, y1: l.startY, x2: l.endX, y2: l.endY,
        width: l.width
      });
    });

    // Build plane/signal maps from stackup for shielding check
    var layerOrder = (stackup && stackup.layerOrder) ? stackup.layerOrder : [];
    var planeLayers = {};
    var signalLayers = {};
    if (stackup && stackup.layers) {
      for (var lid in stackup.layers) {
        var sl = stackup.layers[lid];
        if (sl.isPlane) planeLayers[lid] = sl.planeNet || 'GND';
        if (sl.hasTraces) signalLayers[lid] = true;
      }
    }

    // Check each pair on different layers
    for (var i = 0; i < allSegs.length; i++) {
      for (var j = i + 1; j < allSegs.length; j++) {
        var a = allSegs[i];
        var b = allSegs[j];
        if (a.layer === b.layer) continue; // same layer — skip
        if (a.net === b.net) continue; // same net — expected

        // Skip if a reference plane exists between the two layers (shielded)
        if (layerOrder.length > 0 && isShieldedByPlane(a.layer, b.layer, layerOrder, planeLayers, signalLayers)) {
          continue;
        }

        // Check if segments cross or run close (within coupling distance)
        var crossing = segmentProximity(a, b);
        if (crossing) {
          crossings.push({
            segA: { id: a.id, net: a.net, layer: a.layer },
            segB: { id: b.id, net: b.net, layer: b.layer },
            crossType: crossing.type, // 'crossing' or 'parallel'
            point: crossing.point,     // { x, y }
            distance: crossing.distance,
            overlapLength: crossing.overlapLength || 0
          });
        }
      }
    }

    return crossings;
  }

  // Check if two segments on different layers are close enough to affect impedance
  function segmentProximity(a, b) {
    // Threshold: segments within 3x max width are considered coupling risk
    var threshold = Math.max(a.width, b.width) * 3;
    if (threshold < 0.5) threshold = 0.5; // minimum 0.5mm

    // Check for crossing (intersection in X/Y projection)
    var cross = lineIntersection(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2);
    if (cross) {
      return { type: 'crossing', point: cross, distance: 0 };
    }

    // Check parallel proximity — sample points along shorter segment
    var lenA = Math.sqrt((a.x2 - a.x1) * (a.x2 - a.x1) + (a.y2 - a.y1) * (a.y2 - a.y1));
    var lenB = Math.sqrt((b.x2 - b.x1) * (b.x2 - b.x1) + (b.y2 - b.y1) * (b.y2 - b.y1));

    var overlapLen = 0;
    var closestDist = Infinity;
    var closestPt = null;
    var steps = Math.max(10, Math.floor(Math.max(lenA, lenB) / 0.5));
    if (steps > 200) steps = 200;

    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var px = a.x1 + t * (a.x2 - a.x1);
      var py = a.y1 + t * (a.y2 - a.y1);
      var dist = pointToSegmentDist(px, py, b.x1, b.y1, b.x2, b.y2);
      if (dist < closestDist) {
        closestDist = dist;
        // Find the closest point on segment B to this point on A
        var bx1 = b.x1, by1 = b.y1, bx2 = b.x2, by2 = b.y2;
        var bdx = bx2 - bx1, bdy = by2 - by1;
        var bLen2 = bdx * bdx + bdy * bdy;
        var tb = bLen2 > 0 ? Math.max(0, Math.min(1, ((px - bx1) * bdx + (py - by1) * bdy) / bLen2)) : 0;
        var cpBx = bx1 + tb * bdx;
        var cpBy = by1 + tb * bdy;
        // Midpoint between closest points on A and B
        closestPt = { x: Math.round((px + cpBx) * 50) / 100, y: Math.round((py + cpBy) * 50) / 100 };
      }
      if (dist < threshold) {
        overlapLen += lenA / steps;
      }
    }

    if (overlapLen > 0.1) {
      return {
        type: 'parallel',
        point: closestPt,
        distance: Math.round(closestDist * 1000) / 1000,
        overlapLength: Math.round(overlapLen * 100) / 100
      };
    }

    return null;
  }

  // Line segment intersection (2D)
  function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null;
    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: Math.round((x1 + t * (x2 - x1)) * 100) / 100,
        y: Math.round((y1 + t * (y2 - y1)) * 100) / 100
      };
    }
    return null;
  }

  // Point to segment distance
  function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    var projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
  }

  // ═══════════════════════════════════════
  // Reverse solver — width for target Z₀
  // ═══════════════════════════════════════

  /**
   * Calculate the trace width required to achieve a target impedance.
   * Uses bisection (Z₀ is monotonically decreasing with width).
   *
   * @param {number} targetZ0 - Desired impedance (Ω)
   * @param {number} h        - Dielectric height to nearest plane (mm)
   * @param {number} b        - Total plane-to-plane distance (mm, stripline only)
   * @param {number} t        - Copper thickness (mm)
   * @param {number} er       - Dielectric constant
   * @param {string} model    - 'microstrip' or 'stripline'
   * @returns {{ width: number|null, z0: number, model: string, error: string? }}
   */
  function calcWidthForZ0(targetZ0, h, b, t, er, model) {
    if (!targetZ0 || targetZ0 <= 0) return { width: null, error: 'Invalid target Z₀' };
    if (!h || h <= 0) return { width: null, error: 'Invalid dielectric height' };

    var wMin = 0.005; // 5 µm
    var wMax = 15.0;  // 15 mm

    var calcZ0 = function(w) {
      if (model === 'stripline') {
        return stripline(w, b || h * 2, t, er, h).z0;
      } else {
        return microstrip(w, h, t, er).z0;
      }
    };

    var z0AtMin = calcZ0(wMin);
    var z0AtMax = calcZ0(wMax);

    if (targetZ0 > z0AtMin) return { width: null, error: 'Target too high (max ~' + r2(z0AtMin) + 'Ω at ' + wMin + 'mm width)' };
    if (targetZ0 < z0AtMax) return { width: null, error: 'Target too low (min ~' + r2(z0AtMax) + 'Ω at ' + wMax + 'mm width)' };

    for (var iter = 0; iter < 100; iter++) {
      var wMid = (wMin + wMax) / 2;
      var z0Mid = calcZ0(wMid);

      if (Math.abs(z0Mid - targetZ0) < 0.01) {
        return { width: r3(wMid), z0: r2(z0Mid), model: model };
      }

      if (z0Mid > targetZ0) {
        wMin = wMid; // wider trace → lower Z₀
      } else {
        wMax = wMid;
      }
    }

    var wResult = (wMin + wMax) / 2;
    return { width: r3(wResult), z0: r2(calcZ0(wResult)), model: model };
  }

  /**
   * Auto-select the best matching stackup preset for a given copper layer count.
   * @param {number} copperCount - Number of copper layers detected
   * @returns {string|null} Preset key or null if no match
   */
  function autoSelectPreset(copperCount) {
    if (!copperCount || copperCount <= 0) return null;
    for (var key in STACKUP_PRESETS) {
      if (STACKUP_PRESETS[key].layers === copperCount) return key;
    }
    return null;
  }

  // ═══════════════════════════════════════
  // Exports
  // ═══════════════════════════════════════

  exports.microstrip = microstrip;
  exports.stripline = stripline;
  exports.differentialMicrostrip = differentialMicrostrip;
  exports.differentialStripline = differentialStripline;
  exports.analyzeAll = analyzeAll;
  exports.buildStackup = buildStackup;
  exports.detectCrossings = detectCrossings;
  exports.calcWidthForZ0 = calcWidthForZ0;
  exports.calcWidthForZ0Adv = calcWidthForZ0Adv;
  exports.applyZ0Corr = applyZ0Corr;
  exports.autoSelectPreset = autoSelectPreset;
  exports.DEFAULT_STACKUP = DEFAULT_STACKUP;
  exports.KNOWN_LAYERS = KNOWN_LAYERS;
  exports.STACKUP_PRESETS = STACKUP_PRESETS;

  return exports;

})({});
