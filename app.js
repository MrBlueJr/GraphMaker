/* ============================================================
   Draw Math Graph Creator — Application Logic
   ============================================================ */

(() => {
  'use strict';

  // ─── State ──────────────────────────────────────────────
  const state = {
    functions: [],
    freehandStrokes: [],
    view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    showGrid: true,
    showAxisLabels: true,
    drawingEnabled: false,
    isDrawing: false,
    isPanning: false,
    panStart: null,
    viewOnPanStart: null,
    currentStroke: null,
    nextId: 1,
  };

  // ─── DOM Refs ───────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const graphCanvas  = $('#graphCanvas');
  const drawCanvas   = $('#drawCanvas');
  const graphCtx     = graphCanvas.getContext('2d');
  const drawCtx      = drawCanvas.getContext('2d');
  const tooltip      = $('#coordTooltip');
  const cursorCoords = $('#cursorCoords');
  const funcInput    = $('#funcInput');
  const colorInput   = $('#colorInput');
  const lineWidthSel = $('#lineWidth');
  const lineStyleSel = $('#lineStyle');
  const addFuncBtn   = $('#addFuncBtn');
  const funcError    = $('#funcError');
  const funcListEl   = $('#funcList');
  const clearAllBtn  = $('#clearAllBtn');
  const drawToggle   = $('#drawToggle');
  const drawColorIn  = $('#drawColor');
  const drawWidthSel = $('#drawWidth');
  const undoDrawBtn  = $('#undoDrawBtn');
  const clearDrawBtn = $('#clearDrawBtn');
  const xMinIn       = $('#xMin');
  const xMaxIn       = $('#xMax');
  const yMinIn       = $('#yMin');
  const yMaxIn       = $('#yMax');
  const gridToggle   = $('#gridToggle');
  const axisLabelsEl = $('#axisLabels');
  const resetViewBtn = $('#resetViewBtn');
  const downloadBtn  = $('#downloadBtn');
  const wrapper      = $('#canvasWrapper');

  // ─── Math Parser ────────────────────────────────────────
  function compileMathExpr(expr) {
    let normalized = expr
      .replace(/\s+/g, '')
      .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
      .replace(/\)(\d)/g, ')*$1')
      .replace(/\)([a-zA-Z(])/g, ')*$1')
      .replace(/\^/g, '**')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\basin\b/g, 'Math.asin')
      .replace(/\bacos\b/g, 'Math.acos')
      .replace(/\batan\b/g, 'Math.atan')
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\blog\b/g, 'Math.log')
      .replace(/\bln\b/g, 'Math.log')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\bfloor\b/g, 'Math.floor')
      .replace(/\bceil\b/g, 'Math.ceil')
      .replace(/\bround\b/g, 'Math.round')
      .replace(/\bPI\b/gi, 'Math.PI')
      .replace(/(?<![a-zA-Z.])e(?![a-zA-Z])/g, 'Math.E');

    try {
      const fn = new Function('x', `"use strict"; return (${normalized});`);
      const testVal = fn(1);
      if (typeof testVal !== 'number') throw new Error('Not a number');
      return fn;
    } catch (e) {
      throw new Error(`Invalid expression: ${expr}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────
  function logW() { return wrapper.getBoundingClientRect().width; }
  function logH() { return wrapper.getBoundingClientRect().height; }

  function niceStep(range) {
    const rough = range / 10;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3.5) step = 2;
    else if (norm < 7.5) step = 5;
    else step = 10;
    return step * pow;
  }

  function formatNum(n) {
    if (Number.isInteger(n)) return n.toString();
    return parseFloat(n.toFixed(4)).toString();
  }

  function canvasToX(px) {
    const { xMin, xMax } = state.view;
    return xMin + (px / logW()) * (xMax - xMin);
  }

  function canvasToY(py) {
    const { yMin, yMax } = state.view;
    return yMax - (py / logH()) * (yMax - yMin);
  }

  // ─── Render Engine ──────────────────────────────────────
  function renderAll() {
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    for (const canvas of [graphCanvas, drawCanvas]) {
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const w = rect.width;
    const h = rect.height;
    const { xMin, xMax, yMin, yMax } = state.view;
    const x2c = (x) => ((x - xMin) / (xMax - xMin)) * w;
    const y2c = (y) => ((yMax - y) / (yMax - yMin)) * h;

    const ctx = graphCtx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, w, h);

    // Grid
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    const xStep = niceStep(xRange);
    const yStep = niceStep(yRange);

    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
        ctx.beginPath(); ctx.moveTo(x2c(x), 0); ctx.lineTo(x2c(x), h); ctx.stroke();
      }
      for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
        ctx.beginPath(); ctx.moveTo(0, y2c(y)); ctx.lineTo(w, y2c(y)); ctx.stroke();
      }
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    if (yMin <= 0 && yMax >= 0) {
      ctx.beginPath(); ctx.moveTo(0, y2c(0)); ctx.lineTo(w, y2c(0)); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      ctx.beginPath(); ctx.moveTo(x2c(0), 0); ctx.lineTo(x2c(0), h); ctx.stroke();
    }

    // Axis labels
    if (state.showAxisLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      const axisCy = (yMin <= 0 && yMax >= 0) ? y2c(0) : h - 5;
      const axisCx = (xMin <= 0 && xMax >= 0) ? x2c(0) : 5;

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
        if (Math.abs(x) < xStep * 0.01) continue;
        ctx.fillText(formatNum(x), x2c(x), axisCy + 4);
      }

      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
        if (Math.abs(y) < yStep * 0.01) continue;
        ctx.fillText(formatNum(y), axisCx - 6, y2c(y));
      }

      if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('0', x2c(0) - 6, y2c(0) + 4);
      }
    }

    // Functions
    const fStep = xRange / (w * 2);
    for (const fn of state.functions) {
      if (!fn.visible) continue;
      ctx.save();
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = fn.lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (fn.lineStyle === 'dashed') ctx.setLineDash([8, 6]);
      else if (fn.lineStyle === 'dotted') ctx.setLineDash([2, 4]);

      ctx.beginPath();
      let moved = false, prevY = null;
      for (let x = xMin; x <= xMax; x += fStep) {
        let y;
        try { y = fn.compiledFn(x); } catch { moved = false; continue; }
        if (!isFinite(y) || isNaN(y)) { moved = false; prevY = null; continue; }
        if (prevY !== null && Math.abs(y - prevY) > yRange * 2) moved = false;
        if (!moved) { ctx.moveTo(x2c(x), y2c(y)); moved = true; }
        else { ctx.lineTo(x2c(x), y2c(y)); }
        prevY = y;
      }
      ctx.stroke();
      ctx.restore();
    }

    // Freehand strokes
    for (const stroke of state.freehandStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const pts = stroke.points;
      ctx.moveTo(x2c(pts[0].x), y2c(pts[0].y));
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (x2c(pts[i].x) + x2c(pts[i + 1].x)) / 2;
        const my = (y2c(pts[i].y) + y2c(pts[i + 1].y)) / 2;
        ctx.quadraticCurveTo(x2c(pts[i].x), y2c(pts[i].y), mx, my);
      }
      ctx.lineTo(x2c(pts[pts.length - 1].x), y2c(pts[pts.length - 1].y));
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Clear draw canvas overlay
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

  // ─── Function List UI ──────────────────────────────────
  function updateFuncList() {
    if (state.functions.length === 0) {
      funcListEl.innerHTML = '<p class="empty-msg">No functions added yet.</p>';
      return;
    }
    funcListEl.innerHTML = '';
    for (const fn of state.functions) {
      const item = document.createElement('div');
      item.className = 'func-item';
      item.innerHTML = `
        <span class="func-color-dot" style="background:${fn.color}"></span>
        <span class="func-expr" title="f(x) = ${fn.expr}">f(x) = ${fn.expr}</span>
        <input type="checkbox" class="func-toggle" ${fn.visible ? 'checked' : ''} data-id="${fn.id}" title="Toggle visibility">
        <button class="btn-remove" data-id="${fn.id}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      funcListEl.appendChild(item);
    }
  }

  function addFunction(expr, color, lineWidth, lineStyle) {
    funcError.textContent = '';
    if (!expr.trim()) { funcError.textContent = 'Please enter a function expression.'; return false; }
    try {
      const compiledFn = compileMathExpr(expr.trim());
      state.functions.push({
        id: state.nextId++, expr: expr.trim(), compiledFn,
        color: color || colorInput.value,
        lineWidth: parseFloat(lineWidth || lineWidthSel.value),
        lineStyle: lineStyle || lineStyleSel.value,
        visible: true,
      });
      updateFuncList();
      renderAll();
      return true;
    } catch (e) { funcError.textContent = e.message; return false; }
  }

  // ─── Event Listeners ───────────────────────────────────
  addFuncBtn.addEventListener('click', () => {
    if (addFunction(funcInput.value)) {
      funcInput.value = '';
      const colors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#ec4899','#06b6d4','#a78bfa','#f97316'];
      colorInput.value = colors[state.functions.length % colors.length];
    }
  });

  funcInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addFuncBtn.click(); });

  funcListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove');
    if (btn) {
      state.functions = state.functions.filter(f => f.id !== parseInt(btn.dataset.id));
      updateFuncList(); renderAll();
    }
  });

  funcListEl.addEventListener('change', (e) => {
    if (e.target.classList.contains('func-toggle')) {
      const fn = state.functions.find(f => f.id === parseInt(e.target.dataset.id));
      if (fn) { fn.visible = e.target.checked; renderAll(); }
    }
  });

  clearAllBtn.addEventListener('click', () => { state.functions = []; updateFuncList(); renderAll(); });

  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const colors = ['#6366f1','#22c55e','#f59e0b','#ef4444','#ec4899','#06b6d4','#a78bfa','#f97316'];
      addFunction(btn.dataset.func, colors[state.functions.length % colors.length], 2.5, 'solid');
    });
  });

  // Graph settings
  function updateViewFromInputs() {
    const xMin = parseFloat(xMinIn.value), xMax = parseFloat(xMaxIn.value);
    const yMin = parseFloat(yMinIn.value), yMax = parseFloat(yMaxIn.value);
    if (isNaN(xMin) || isNaN(xMax) || isNaN(yMin) || isNaN(yMax)) return;
    if (xMin >= xMax || yMin >= yMax) return;
    state.view = { xMin, xMax, yMin, yMax };
    renderAll();
  }

  [xMinIn, xMaxIn, yMinIn, yMaxIn].forEach(el => el.addEventListener('change', updateViewFromInputs));
  gridToggle.addEventListener('change', () => { state.showGrid = gridToggle.checked; renderAll(); });
  axisLabelsEl.addEventListener('change', () => { state.showAxisLabels = axisLabelsEl.checked; renderAll(); });

  resetViewBtn.addEventListener('click', () => {
    state.view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    xMinIn.value = -10; xMaxIn.value = 10; yMinIn.value = -10; yMaxIn.value = 10;
    renderAll();
  });

  // Freehand drawing
  drawToggle.addEventListener('change', () => {
    state.drawingEnabled = drawToggle.checked;
    drawCanvas.style.cursor = state.drawingEnabled ? 'crosshair' : '';
  });
  undoDrawBtn.addEventListener('click', () => { state.freehandStrokes.pop(); renderAll(); });
  clearDrawBtn.addEventListener('click', () => { state.freehandStrokes = []; renderAll(); });

  // Mouse interaction
  function getMousePos(e) {
    const rect = wrapper.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  drawCanvas.addEventListener('mousedown', (e) => {
    const { px, py } = getMousePos(e);
    if (state.drawingEnabled && e.button === 0) {
      state.isDrawing = true;
      state.currentStroke = {
        points: [{ x: canvasToX(px), y: canvasToY(py) }],
        color: drawColorIn.value,
        width: parseFloat(drawWidthSel.value),
      };
    } else if (!state.drawingEnabled && e.button === 0) {
      state.isPanning = true;
      state.panStart = { px, py };
      state.viewOnPanStart = { ...state.view };
      drawCanvas.style.cursor = 'grabbing';
    }
  });

  drawCanvas.addEventListener('mousemove', (e) => {
    const { px, py } = getMousePos(e);
    const mx = canvasToX(px), my = canvasToY(py);
    cursorCoords.textContent = `x: ${mx.toFixed(3)}, y: ${my.toFixed(3)}`;
    tooltip.textContent = `(${mx.toFixed(2)}, ${my.toFixed(2)})`;
    tooltip.style.opacity = '1';
    tooltip.style.left = (px + 14) + 'px';
    tooltip.style.top = (py - 30) + 'px';

    if (state.isDrawing && state.currentStroke) {
      state.currentStroke.points.push({ x: mx, y: my });
      // Live preview
      const dpr = window.devicePixelRatio || 1;
      const dctx = drawCtx;
      dctx.save();
      dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      dctx.scale(dpr, dpr);
      dctx.strokeStyle = state.currentStroke.color;
      dctx.lineWidth = state.currentStroke.width;
      dctx.lineJoin = 'round'; dctx.lineCap = 'round';
      dctx.beginPath();
      const pts = state.currentStroke.points;
      const { xMin, xMax, yMin, yMax } = state.view;
      const cw = logW(), ch = logH();
      const x2c = (x) => ((x - xMin) / (xMax - xMin)) * cw;
      const y2c = (y) => ((yMax - y) / (yMax - yMin)) * ch;
      dctx.moveTo(x2c(pts[0].x), y2c(pts[0].y));
      for (let i = 1; i < pts.length - 1; i++) {
        dctx.quadraticCurveTo(x2c(pts[i].x), y2c(pts[i].y),
          (x2c(pts[i].x) + x2c(pts[i+1].x)) / 2, (y2c(pts[i].y) + y2c(pts[i+1].y)) / 2);
      }
      dctx.lineTo(x2c(pts[pts.length-1].x), y2c(pts[pts.length-1].y));
      dctx.stroke();
      dctx.restore();
    }

    if (state.isPanning) {
      const dx = px - state.panStart.px, dy = py - state.panStart.py;
      const { xMin, xMax, yMin, yMax } = state.viewOnPanStart;
      const xRange = xMax - xMin, yRange = yMax - yMin;
      state.view.xMin = xMin - (dx / logW()) * xRange;
      state.view.xMax = xMax - (dx / logW()) * xRange;
      state.view.yMin = yMin + (dy / logH()) * yRange;
      state.view.yMax = yMax + (dy / logH()) * yRange;
      updateInputsFromView();
      renderAll();
    }
  });

  function finishStroke() {
    if (state.isDrawing && state.currentStroke) {
      if (state.currentStroke.points.length >= 2) state.freehandStrokes.push(state.currentStroke);
      state.currentStroke = null;
      state.isDrawing = false;
      renderAll();
    }
    if (state.isPanning) {
      state.isPanning = false;
      drawCanvas.style.cursor = state.drawingEnabled ? 'crosshair' : '';
    }
  }

  drawCanvas.addEventListener('mouseup', finishStroke);
  drawCanvas.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
    cursorCoords.textContent = 'Move cursor over graph';
    finishStroke();
  });

  // Zoom
  drawCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { px, py } = getMousePos(e);
    const { xMin, xMax, yMin, yMax } = state.view;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const mouseX = xMin + (px / logW()) * (xMax - xMin);
    const mouseY = yMax - (py / logH()) * (yMax - yMin);
    state.view.xMin = mouseX - (mouseX - xMin) * factor;
    state.view.xMax = mouseX + (xMax - mouseX) * factor;
    state.view.yMin = mouseY - (mouseY - yMin) * factor;
    state.view.yMax = mouseY + (yMax - mouseY) * factor;
    updateInputsFromView();
    renderAll();
  }, { passive: false });

  function updateInputsFromView() {
    xMinIn.value = parseFloat(state.view.xMin.toFixed(4));
    xMaxIn.value = parseFloat(state.view.xMax.toFixed(4));
    yMinIn.value = parseFloat(state.view.yMin.toFixed(4));
    yMaxIn.value = parseFloat(state.view.yMax.toFixed(4));
  }

  // ─── Download ──────────────────────────────────────────
  downloadBtn.addEventListener('click', () => {
    const w = logW(), h = logH(), scale = 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = w * scale;
    offscreen.height = h * scale;
    const ctx = offscreen.getContext('2d');
    ctx.scale(scale, scale);

    const { xMin, xMax, yMin, yMax } = state.view;
    const xRange = xMax - xMin, yRange = yMax - yMin;
    const x2c = (x) => ((x - xMin) / xRange) * w;
    const y2c = (y) => ((yMax - y) / yRange) * h;

    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, w, h);

    const xStep = niceStep(xRange), yStep = niceStep(yRange);
    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let x = Math.ceil(xMin/xStep)*xStep; x <= xMax; x += xStep) {
        ctx.beginPath(); ctx.moveTo(x2c(x),0); ctx.lineTo(x2c(x),h); ctx.stroke();
      }
      for (let y = Math.ceil(yMin/yStep)*yStep; y <= yMax; y += yStep) {
        ctx.beginPath(); ctx.moveTo(0,y2c(y)); ctx.lineTo(w,y2c(y)); ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    if (yMin<=0&&yMax>=0) { ctx.beginPath(); ctx.moveTo(0,y2c(0)); ctx.lineTo(w,y2c(0)); ctx.stroke(); }
    if (xMin<=0&&xMax>=0) { ctx.beginPath(); ctx.moveTo(x2c(0),0); ctx.lineTo(x2c(0),h); ctx.stroke(); }

    if (state.showAxisLabels) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      const axisCy = (yMin<=0&&yMax>=0)?y2c(0):h-5;
      const axisCx = (xMin<=0&&xMax>=0)?x2c(0):5;
      ctx.textAlign='center'; ctx.textBaseline='top';
      for (let x=Math.ceil(xMin/xStep)*xStep;x<=xMax;x+=xStep) { if(Math.abs(x)<xStep*0.01) continue; ctx.fillText(formatNum(x),x2c(x),axisCy+4); }
      ctx.textAlign='right'; ctx.textBaseline='middle';
      for (let y=Math.ceil(yMin/yStep)*yStep;y<=yMax;y+=yStep) { if(Math.abs(y)<yStep*0.01) continue; ctx.fillText(formatNum(y),axisCx-6,y2c(y)); }
      if(xMin<=0&&xMax>=0&&yMin<=0&&yMax>=0) { ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillText('0',x2c(0)-6,y2c(0)+4); }
    }

    const fStep = xRange/(w*2);
    for (const fn of state.functions) {
      if (!fn.visible) continue;
      ctx.save();
      ctx.strokeStyle=fn.color; ctx.lineWidth=fn.lineWidth; ctx.lineJoin='round'; ctx.lineCap='round';
      if (fn.lineStyle==='dashed') ctx.setLineDash([8,6]);
      else if (fn.lineStyle==='dotted') ctx.setLineDash([2,4]);
      ctx.beginPath();
      let moved=false, prevY=null;
      for (let x=xMin;x<=xMax;x+=fStep) {
        let y; try{y=fn.compiledFn(x);}catch{moved=false;continue;}
        if(!isFinite(y)||isNaN(y)){moved=false;prevY=null;continue;}
        if(prevY!==null&&Math.abs(y-prevY)>yRange*2) moved=false;
        if(!moved){ctx.moveTo(x2c(x),y2c(y));moved=true;}else{ctx.lineTo(x2c(x),y2c(y));}
        prevY=y;
      }
      ctx.stroke(); ctx.restore();
    }

    for (const stroke of state.freehandStrokes) {
      if(stroke.points.length<2) continue;
      ctx.save();
      ctx.strokeStyle=stroke.color; ctx.lineWidth=stroke.width; ctx.lineJoin='round'; ctx.lineCap='round';
      ctx.beginPath();
      const pts=stroke.points;
      ctx.moveTo(x2c(pts[0].x),y2c(pts[0].y));
      for(let i=1;i<pts.length-1;i++){
        ctx.quadraticCurveTo(x2c(pts[i].x),y2c(pts[i].y),(x2c(pts[i].x)+x2c(pts[i+1].x))/2,(y2c(pts[i].y)+y2c(pts[i+1].y))/2);
      }
      ctx.lineTo(x2c(pts[pts.length-1].x),y2c(pts[pts.length-1].y));
      ctx.stroke(); ctx.restore();
    }

    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.font='12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign='right'; ctx.textBaseline='bottom';
    ctx.fillText('Draw Math Graph Creator', w-10, h-8);

    const link = document.createElement('a');
    link.download = 'math-graph.png';
    link.href = offscreen.toDataURL('image/png');
    link.click();
  });

  // ─── Resize & Init ─────────────────────────────────────
  new ResizeObserver(() => renderAll()).observe(wrapper);
  renderAll();
})();
