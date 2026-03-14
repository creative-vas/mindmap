/* ============================================
   MindMap — Canvas-based interactive mindmap
   ============================================ */

const API = '';
const canvas = document.getElementById('mindmapCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvasWrapper');

// State
let nodes = [];
let edges = [];
let camera = { x: 0, y: 0, zoom: 1 };
let dragging = null;      // node being dragged
let panning = false;
let panStart = { x: 0, y: 0 };
let hoveredNode = null;
let selectedNode = null;
let imageCache = {};
let animFrame = null;

// DPR
const dpr = window.devicePixelRatio || 1;

// ---- Sizing ----
function resize() {
  const rect = wrapper.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resize);

// ---- Data ----
async function loadData() {
  try {
    const res = await fetch(`${API}/api/mindmap`);
    const data = await res.json();
    nodes = data.nodes || [];
    edges = data.edges || [];
    // Preload images
    nodes.forEach(n => {
      if (n.image) loadImage(n.id, n.image);
    });
    draw();
  } catch (e) {
    console.warn('Could not load data, using defaults');
  }
}

async function saveData() {
  const el = document.getElementById('saveStatus');
  el.textContent = 'Saving...';
  el.className = 'save-status saving';
  try {
    await fetch(`${API}/api/mindmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges })
    });
    el.textContent = 'Saved';
    el.className = 'save-status';
  } catch {
    el.textContent = 'Offline';
    el.className = 'save-status saving';
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 800);
}

// ---- Image loading ----
function loadImage(nodeId, url) {
  if (imageCache[nodeId]) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { imageCache[nodeId] = img; draw(); };
  img.src = url;
}

// ---- Drawing ----
function draw() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(_draw);
}

function _draw() {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2 + camera.x, h / 2 + camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  // Draw edges
  edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from);
    const to = nodes.find(n => n.id === e.to);
    if (!from || !to) return;
    drawEdge(from, to);
  });

  // Draw nodes (items first, then categories, then root on top)
  const order = ['item', 'category', 'root'];
  const sorted = [...nodes].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  sorted.forEach(n => drawNode(n));

  ctx.restore();
}

function drawEdge(from, to) {
  const color = to.color || from.color || '#6C63FF';
  ctx.beginPath();

  // Curved bezier
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx1 = from.x + dx * 0.4;
  const cy1 = from.y;
  const cx2 = from.x + dx * 0.6;
  const cy2 = to.y;

  ctx.moveTo(from.x, from.y);
  ctx.bezierCurveTo(cx1, cy1, cx2, cy2, to.x, to.y);

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function getNodeRadius(node) {
  if (node.type === 'root') return 55;
  if (node.type === 'category') return 45;
  return 30;
}

function drawNode(node) {
  const r = getNodeRadius(node);
  const isHovered = hoveredNode === node;
  const isSelected = selectedNode === node;
  const color = node.color || '#6C63FF';

  ctx.save();

  // Glow
  if (isHovered || isSelected) {
    ctx.shadowColor = color;
    ctx.shadowBlur = isSelected ? 30 : 18;
  }

  // Circle background
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

  if (node.type === 'root') {
    const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r);
    grad.addColorStop(0, '#2a2a42');
    grad.addColorStop(1, '#16162a');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = hexToRgba(color, 0.12);
  }
  ctx.fill();

  // Border
  ctx.strokeStyle = hexToRgba(color, isHovered ? 0.8 : 0.4);
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Image
  const img = imageCache[node.id];
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, r - 3, 0, Math.PI * 2);
    ctx.clip();
    const size = (r - 3) * 2;
    ctx.drawImage(img, node.x - r + 3, node.y - r + 3, size, size);
    ctx.restore();

    // Overlay for readability
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  // Label
  const fontSize = node.type === 'root' ? 14 : node.type === 'category' ? 12 : 10;
  ctx.font = `${node.type === 'item' ? '500' : '600'} ${fontSize}px Inter, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for longer labels
  const maxWidth = r * 1.6;
  const words = node.label.split(' ');
  let lines = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = currentLine + ' ' + words[i];
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = test;
    }
  }
  lines.push(currentLine);

  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  const startY = node.y - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, node.x, startY + i * lineHeight);
  });

  // Type badge for categories
  if (node.type === 'category') {
    const badgeY = node.y + r + 12;
    ctx.font = '500 9px Inter, sans-serif';
    const tw = ctx.measureText(node.label).width + 12;
    ctx.fillStyle = hexToRgba(color, 0.15);
    roundRect(ctx, node.x - tw / 2, badgeY - 8, tw, 16, 8);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(node.label.toUpperCase().slice(0, 12), node.x, badgeY);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---- Hit testing ----
function screenToWorld(sx, sy) {
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  return {
    x: (sx - w / 2 - camera.x) / camera.zoom,
    y: (sy - h / 2 - camera.y) / camera.zoom
  };
}

function hitTest(sx, sy) {
  const p = screenToWorld(sx, sy);
  // Test in reverse draw order (top items first)
  const order = ['item', 'category', 'root'];
  const sorted = [...nodes].sort((a, b) => order.indexOf(b.type) - order.indexOf(a.type));
  for (const n of sorted) {
    const r = getNodeRadius(n);
    const dx = p.x - n.x;
    const dy = p.y - n.y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

// ---- Mouse interactions ----
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const node = hitTest(sx, sy);

  hideContextMenu();

  if (e.button === 2) { // Right click
    e.preventDefault();
    if (node) {
      selectedNode = node;
      showContextMenu(e.clientX, e.clientY, node);
    }
    draw();
    return;
  }

  if (node) {
    dragging = node;
    selectedNode = node;
    canvas.classList.add('grabbing');
  } else {
    panning = true;
    panStart = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    canvas.classList.add('grabbing');
  }
  draw();
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (dragging) {
    const p = screenToWorld(sx, sy);
    dragging.x = p.x;
    dragging.y = p.y;
    draw();
    return;
  }

  if (panning) {
    camera.x = e.clientX - panStart.x;
    camera.y = e.clientY - panStart.y;
    draw();
    return;
  }

  const node = hitTest(sx, sy);
  if (node !== hoveredNode) {
    hoveredNode = node;
    canvas.classList.toggle('pointer', !!node);
    draw();
  }
});

canvas.addEventListener('mouseup', () => {
  if (dragging) {
    scheduleSave();
    dragging = null;
  }
  panning = false;
  canvas.classList.remove('grabbing');
});

canvas.addEventListener('mouseleave', () => {
  dragging = null;
  panning = false;
  hoveredNode = null;
  canvas.classList.remove('grabbing');
  draw();
});

// Zoom
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.92 : 1.08;
  const newZoom = Math.max(0.2, Math.min(3, camera.zoom * delta));

  // Zoom toward cursor
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - canvas.width / dpr / 2;
  const my = e.clientY - rect.top - canvas.height / dpr / 2;

  camera.x = mx - (mx - camera.x) * (newZoom / camera.zoom);
  camera.y = my - (my - camera.y) * (newZoom / camera.zoom);
  camera.zoom = newZoom;
  draw();
}, { passive: false });

// Prevent default context menu
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Double click to add child
canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const node = hitTest(sx, sy);
  if (node) {
    showModal('Add Child', '', label => {
      if (!label) return;
      addChild(node, label);
    });
  }
});

// ---- Context Menu ----
const ctxMenu = document.getElementById('contextMenu');

function showContextMenu(x, y, node) {
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.remove('hidden');

  // Only show "generate image" for root & category
  const genBtn = ctxMenu.querySelector('[data-action="generate-image"]');
  genBtn.style.display = (node.type === 'root' || node.type === 'category') ? 'flex' : 'none';

  // Don't allow deleting root
  const delBtn = ctxMenu.querySelector('[data-action="delete"]');
  delBtn.style.display = node.type === 'root' ? 'none' : 'flex';
}

function hideContextMenu() {
  ctxMenu.classList.add('hidden');
}

document.addEventListener('click', e => {
  if (!ctxMenu.contains(e.target)) hideContextMenu();
});

ctxMenu.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (!selectedNode) return;
    hideContextMenu();

    switch (action) {
      case 'add-child':
        showModal('Add Child', '', label => { if (label) addChild(selectedNode, label); });
        break;
      case 'edit-label':
        showModal('Edit Label', selectedNode.label, label => {
          if (label) { selectedNode.label = label; scheduleSave(); draw(); }
        });
        break;
      case 'change-color':
        showColorModal(selectedNode);
        break;
      case 'generate-image':
        generateImage(selectedNode);
        break;
      case 'delete':
        deleteNode(selectedNode.id);
        break;
    }
  });
});

// ---- Modal ----
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalInput = document.getElementById('modalInput');
const colorPicker = document.getElementById('colorPicker');
let modalCallback = null;

function showModal(title, value, callback, showColors = false) {
  modalTitle.textContent = title;
  modalInput.value = value || '';
  modalCallback = callback;
  colorPicker.classList.toggle('hidden', !showColors);
  modal.classList.remove('hidden');
  setTimeout(() => modalInput.focus(), 50);
}

function showColorModal(node) {
  showModal('Change Color', node.label, (label) => {
    if (label) node.label = label;
    const selected = colorPicker.querySelector('.selected');
    if (selected) {
      node.color = selected.dataset.color;
      // Also update children color hint
    }
    scheduleSave();
    draw();
  }, true);

  // Highlight current color
  colorPicker.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === node.color);
  });
}

colorPicker.querySelectorAll('.color-swatch').forEach(s => {
  s.addEventListener('click', () => {
    colorPicker.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('selected'));
    s.classList.add('selected');
  });
});

document.getElementById('modalOk').addEventListener('click', () => {
  if (modalCallback) modalCallback(modalInput.value.trim());
  modal.classList.add('hidden');
  modalCallback = null;
});

document.getElementById('modalCancel').addEventListener('click', () => {
  modal.classList.add('hidden');
  modalCallback = null;
});

modalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('modalOk').click();
  if (e.key === 'Escape') document.getElementById('modalCancel').click();
});

// ---- Node operations ----
function addChild(parent, label) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 120 + Math.random() * 60;
  const id = 'node_' + Math.random().toString(36).slice(2, 10);
  const newNode = {
    id,
    label,
    type: 'item',
    x: parent.x + Math.cos(angle) * dist,
    y: parent.y + Math.sin(angle) * dist,
    image: null,
    parent: parent.id,
    color: parent.color || '#6C63FF'
  };
  nodes.push(newNode);
  edges.push({ from: parent.id, to: id });
  scheduleSave();
  draw();
}

function deleteNode(nodeId) {
  const idsToRemove = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach(e => {
      if (idsToRemove.has(e.from) && !idsToRemove.has(e.to)) {
        idsToRemove.add(e.to);
        changed = true;
      }
    });
  }
  nodes = nodes.filter(n => !idsToRemove.has(n.id));
  edges = edges.filter(e => !idsToRemove.has(e.from) && !idsToRemove.has(e.to));
  selectedNode = null;
  scheduleSave();
  draw();
}

// ---- Add Category Button ----
document.getElementById('btnAddCategory').addEventListener('click', () => {
  showModal('New Category', '', (label) => {
    if (!label) return;
    const colors = ['#6C63FF', '#FF6584', '#00C9A7', '#FFC75F', '#845EC2', '#FF9671', '#00D2FC'];
    const color = colors[nodes.filter(n => n.type === 'category').length % colors.length];
    const angle = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 80;
    const root = nodes.find(n => n.type === 'root');
    const cx = root ? root.x : 0;
    const cy = root ? root.y : 0;

    const id = 'cat_' + Math.random().toString(36).slice(2, 10);
    const newNode = {
      id, label, type: 'category',
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      image: null, parent: 'root', color
    };
    nodes.push(newNode);
    edges.push({ from: 'root', to: id });
    scheduleSave();
    draw();
  }, true);
});

// ---- Fit to view ----
document.getElementById('btnZoomFit').addEventListener('click', () => {
  if (!nodes.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const r = getNodeRadius(n);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  });
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const padding = 80;
  const scaleX = (w - padding * 2) / (maxX - minX);
  const scaleY = (h - padding * 2) / (maxY - minY);
  camera.zoom = Math.min(scaleX, scaleY, 2);
  camera.x = -(minX + maxX) / 2 * camera.zoom;
  camera.y = -(minY + maxY) / 2 * camera.zoom;
  draw();
});

// ---- Gemini Image Generation ----
async function generateImage(node) {
  const overlay = document.getElementById('imageGenOverlay');
  overlay.classList.remove('hidden');

  try {
    const res = await fetch(`${API}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: node.id })
    });

    if (!res.ok) {
      const err = await res.json();
      alert('Image generation failed: ' + (err.detail || 'Unknown error'));
      overlay.classList.add('hidden');
      return;
    }

    const data = await res.json();
    node.image = data.image_url;

    // Load into cache
    if (data.image_base64) {
      const img = new Image();
      img.onload = () => { imageCache[node.id] = img; draw(); };
      img.src = 'data:image/png;base64,' + data.image_base64;
    } else if (data.image_url) {
      loadImage(node.id, data.image_url);
    }

    scheduleSave();
  } catch (e) {
    alert('Failed to connect to backend. Is the server running?');
  }
  overlay.classList.add('hidden');
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', e => {
  if (modal.classList.contains('hidden') === false) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedNode && selectedNode.type !== 'root') {
      deleteNode(selectedNode.id);
    }
  }
  if (e.key === 'Escape') {
    selectedNode = null;
    hideContextMenu();
    draw();
  }
});

// ---- Touch support ----
let touchStart = null;
let touchDragging = null;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const sx = touch.clientX - rect.left;
  const sy = touch.clientY - rect.top;
  const node = hitTest(sx, sy);

  if (node) {
    touchDragging = node;
    selectedNode = node;
  } else {
    touchStart = { x: touch.clientX - camera.x, y: touch.clientY - camera.y };
  }
  draw();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();

  if (touchDragging) {
    const p = screenToWorld(touch.clientX - rect.left, touch.clientY - rect.top);
    touchDragging.x = p.x;
    touchDragging.y = p.y;
  } else if (touchStart) {
    camera.x = touch.clientX - touchStart.x;
    camera.y = touch.clientY - touchStart.y;
  }
  draw();
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (touchDragging) scheduleSave();
  touchDragging = null;
  touchStart = null;
});

// ---- Init ----
resize();
loadData();
