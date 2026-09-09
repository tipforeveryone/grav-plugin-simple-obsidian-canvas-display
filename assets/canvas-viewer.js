(function () {
	'use strict';

	// Bảng màu preset của Obsidian Canvas: field "color" trên node/edge là số
	// '1'..'6' hoặc mã hex tự chọn. Không có preset nào là chuẩn chính thức
	// trong JSON Canvas spec, đây là xấp xỉ theo màu mặc định của Obsidian.
	var PRESET_COLORS = {
		'1': '#e0432c',
		'2': '#e08a2c',
		'3': '#d4b91d',
		'4': '#4f9b3a',
		'5': '#2c9fe0',
		'6': '#a25ce0'
	};

	var MIN_SCALE = 0.1;
	var MAX_SCALE = 4;
	var SVG_NS = 'http://www.w3.org/2000/svg';

	function resolveColor(color) {
		if (!color) {
			return null;
		}
		var key = String(color);
		if (PRESET_COLORS[key]) {
			return PRESET_COLORS[key];
		}
		if (/^#[0-9a-fA-F]{3,8}$/.test(key)) {
			return key;
		}
		return null;
	}

	function sideAnchor(node, side) {
		switch (side) {
			case 'top':
				return { x: node.x + node.width / 2, y: node.y };
			case 'bottom':
				return { x: node.x + node.width / 2, y: node.y + node.height };
			case 'left':
				return { x: node.x, y: node.y + node.height / 2 };
			case 'right':
			default:
				return { x: node.x + node.width, y: node.y + node.height / 2 };
		}
	}

	// Điểm điều khiển bezier: đẩy ra khỏi anchor theo hướng của side, để
	// đường nối rời khỏi cạnh node một cách vuông góc trước khi uốn cong,
	// giống cách Obsidian tự vẽ edge.
	function controlPoint(anchor, side, amount) {
		switch (side) {
			case 'top':
				return { x: anchor.x, y: anchor.y - amount };
			case 'bottom':
				return { x: anchor.x, y: anchor.y + amount };
			case 'left':
				return { x: anchor.x - amount, y: anchor.y };
			case 'right':
			default:
				return { x: anchor.x + amount, y: anchor.y };
		}
	}

	function initCanvas(root) {
		var src = root.getAttribute('data-soc-canvas-src');
		if (!src || root.getAttribute('data-soc-canvas-ready')) {
			return;
		}
		root.setAttribute('data-soc-canvas-ready', '1');

		var viewport = document.createElement('div');
		viewport.className = 'soc-canvas__viewport';

		var world = document.createElement('div');
		world.className = 'soc-canvas__world';
		viewport.appendChild(world);

		var loading = document.createElement('div');
		loading.className = 'soc-canvas__loading';
		loading.textContent = 'Đang tải canvas…';

		root.innerHTML = '';
		root.appendChild(viewport);
		root.appendChild(loading);

		var state = { scale: 1, x: 0, y: 0 };
		var worldSize = { w: 0, h: 0 };

		function applyTransform() {
			world.style.transform = 'translate(' + state.x + 'px, ' + state.y + 'px) scale(' + state.scale + ')';
		}

		function fitToView() {
			var rect = viewport.getBoundingClientRect();
			if (!worldSize.w || !worldSize.h || !rect.width || !rect.height) {
				return;
			}
			var scale = Math.min(rect.width / worldSize.w, rect.height / worldSize.h, 1);
			state.scale = scale;
			state.x = (rect.width - worldSize.w * scale) / 2;
			state.y = (rect.height - worldSize.h * scale) / 2;
			applyTransform();
		}

		function zoomBy(factor, centerX, centerY) {
			var rect = viewport.getBoundingClientRect();
			var cx = centerX == null ? rect.width / 2 : centerX;
			var cy = centerY == null ? rect.height / 2 : centerY;
			var newScale = Math.min(Math.max(state.scale * factor, MIN_SCALE), MAX_SCALE);
			state.x = cx - (cx - state.x) * (newScale / state.scale);
			state.y = cy - (cy - state.y) * (newScale / state.scale);
			state.scale = newScale;
			applyTransform();
		}

		function render(data) {
			var nodes = Array.isArray(data.nodes) ? data.nodes : [];
			var edges = Array.isArray(data.edges) ? data.edges : [];
			var nodesById = {};
			var minX = 0, minY = 0, maxX = 0, maxY = 0;

			nodes.forEach(function (n, i) {
				nodesById[n.id] = n;
				if (i === 0) {
					minX = n.x; minY = n.y; maxX = n.x + n.width; maxY = n.y + n.height;
				} else {
					minX = Math.min(minX, n.x);
					minY = Math.min(minY, n.y);
					maxX = Math.max(maxX, n.x + n.width);
					maxY = Math.max(maxY, n.y + n.height);
				}
			});

			var pad = 160;
			var offsetX = -minX + pad;
			var offsetY = -minY + pad;
			worldSize.w = (maxX - minX) + pad * 2;
			worldSize.h = (maxY - minY) + pad * 2;

			world.style.width = worldSize.w + 'px';
			world.style.height = worldSize.h + 'px';

			var svg = document.createElementNS(SVG_NS, 'svg');
			svg.setAttribute('class', 'soc-canvas__edges');
			svg.setAttribute('width', worldSize.w);
			svg.setAttribute('height', worldSize.h);
			var defs = document.createElementNS(SVG_NS, 'defs');
			svg.appendChild(defs);
			world.appendChild(svg);

			edges.forEach(function (e, i) {
				var fromNode = nodesById[e.fromNode];
				var toNode = nodesById[e.toNode];
				if (!fromNode || !toNode) {
					return;
				}

				var color = resolveColor(e.color) || 'var(--soc-edge)';
				var fromSide = e.fromSide || 'right';
				var toSide = e.toSide || 'left';
				var from = sideAnchor(fromNode, fromSide);
				var to = sideAnchor(toNode, toSide);
				from.x += offsetX; from.y += offsetY;
				to.x += offsetX; to.y += offsetY;
				var c1 = controlPoint(from, fromSide, 60);
				var c2 = controlPoint(to, toSide, 60);

				var markerId = 'soc-arrow-' + root.id + '-' + i;
				var marker = document.createElementNS(SVG_NS, 'marker');
				marker.setAttribute('id', markerId);
				marker.setAttribute('markerWidth', '8');
				marker.setAttribute('markerHeight', '8');
				marker.setAttribute('refX', '6');
				marker.setAttribute('refY', '3');
				marker.setAttribute('orient', 'auto');
				marker.setAttribute('markerUnits', 'strokeWidth');
				var arrow = document.createElementNS(SVG_NS, 'path');
				arrow.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
				arrow.setAttribute('fill', color);
				marker.appendChild(arrow);
				defs.appendChild(marker);

				var path = document.createElementNS(SVG_NS, 'path');
				path.setAttribute(
					'd',
					'M ' + from.x + ' ' + from.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + to.x + ' ' + to.y
				);
				path.setAttribute('stroke', color);
				path.setAttribute('stroke-width', '2');
				path.setAttribute('fill', 'none');
				path.setAttribute('marker-end', 'url(#' + markerId + ')');
				svg.appendChild(path);

				if (e.label) {
					var mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
					var text = document.createElementNS(SVG_NS, 'text');
					text.setAttribute('class', 'soc-canvas__edge-label');
					text.setAttribute('x', mid.x);
					text.setAttribute('y', mid.y - 4);
					text.setAttribute('text-anchor', 'middle');
					text.textContent = e.label;
					svg.appendChild(text);
				}
			});

			nodes.forEach(function (n) {
				if (n.type && n.type !== 'text') {
					return;
				}

				var el = document.createElement('div');
				el.className = 'soc-canvas__node';
				el.style.left = (n.x + offsetX) + 'px';
				el.style.top = (n.y + offsetY) + 'px';
				el.style.width = n.width + 'px';
				el.style.height = n.height + 'px';

				var color = resolveColor(n.color);
				if (color) {
					el.style.borderColor = color;
				}

				var content = document.createElement('div');
				content.className = 'soc-canvas__node-content';
				content.textContent = n.text || '';
				el.appendChild(content);

				world.appendChild(el);
			});

			fitToView();
		}

		fetch(src, { credentials: 'same-origin' })
			.then(function (res) {
				if (!res.ok) {
					throw new Error('HTTP ' + res.status);
				}
				return res.json();
			})
			.then(function (data) {
				loading.remove();
				render(data);
				setupControls();
			})
			.catch(function (err) {
				loading.className = 'soc-canvas__error';
				loading.textContent = 'Không thể tải canvas: ' + err.message;
			});

		function setupControls() {
			var controls = document.createElement('div');
			controls.className = 'soc-canvas__controls';
			controls.innerHTML =
				'<button type="button" data-soc-action="zoom-out" aria-label="Thu nhỏ">−</button>' +
				'<button type="button" data-soc-action="zoom-reset" aria-label="Vừa khung">⤢</button>' +
				'<button type="button" data-soc-action="zoom-in" aria-label="Phóng to">+</button>';
			controls.addEventListener('click', function (e) {
				var btn = e.target.closest('[data-soc-action]');
				if (!btn) {
					return;
				}
				var action = btn.getAttribute('data-soc-action');
				if (action === 'zoom-in') {
					zoomBy(1.25);
				} else if (action === 'zoom-out') {
					zoomBy(0.8);
				} else if (action === 'zoom-reset') {
					fitToView();
				}
			});
			root.appendChild(controls);
		}

		// Kéo để pan.
		var dragging = false, lastX = 0, lastY = 0, moved = false;
		viewport.addEventListener('mousedown', function (e) {
			dragging = true;
			moved = false;
			lastX = e.clientX;
			lastY = e.clientY;
			viewport.classList.add('is-dragging');
		});
		window.addEventListener('mousemove', function (e) {
			if (!dragging) {
				return;
			}
			moved = true;
			state.x += e.clientX - lastX;
			state.y += e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
			applyTransform();
		});
		window.addEventListener('mouseup', function () {
			dragging = false;
			viewport.classList.remove('is-dragging');
		});

		// Chạm để pan (1 ngón).
		var touchLast = null;
		viewport.addEventListener('touchstart', function (e) {
			if (e.touches.length === 1) {
				touchLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			}
		}, { passive: true });
		viewport.addEventListener('touchmove', function (e) {
			if (e.touches.length === 1 && touchLast) {
				var t = e.touches[0];
				state.x += t.clientX - touchLast.x;
				state.y += t.clientY - touchLast.y;
				touchLast = { x: t.clientX, y: t.clientY };
				applyTransform();
				e.preventDefault();
			}
		}, { passive: false });
		viewport.addEventListener('touchend', function () {
			touchLast = null;
		});

		// Cuộn chuột để zoom quanh vị trí con trỏ.
		viewport.addEventListener('wheel', function (e) {
			e.preventDefault();
			var rect = viewport.getBoundingClientRect();
			var factor = e.deltaY < 0 ? 1.1 : 0.9;
			zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
		}, { passive: false });

		window.addEventListener('resize', fitToView);
	}

	function initAll() {
		var roots = document.querySelectorAll('.soc-canvas[data-soc-canvas-src]');
		for (var i = 0; i < roots.length; i++) {
			initCanvas(roots[i]);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initAll);
	} else {
		initAll();
	}
})();
