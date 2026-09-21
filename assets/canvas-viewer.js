(function () {
	'use strict';

	// Bảng màu preset của Obsidian Canvas: field "color" trên node/edge là số
	// '1'..'6' hoặc mã hex tự chọn. Không có preset nào là chuẩn chính thức
	// trong JSON Canvas spec — đây là 6 màu mặc định thật của Obsidian
	// (đỏ/cam/vàng/lục/lam-cyan/tím), khớp với màu hiển thị khi mở cùng file
	// .canvas trực tiếp trong app Obsidian, thay cho bộ xấp xỉ thô trước đó.
	var PRESET_COLORS = {
		'1': '#fb464c',
		'2': '#e9973f',
		'3': '#e0de71',
		'4': '#44cf6e',
		'5': '#53dfdd',
		'6': '#a882ff'
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

	function escapeHtml(str) {
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// Inline markdown trên một dòng đã escape sẵn: code span trước (giữ
	// nguyên nội dung, tránh bị bold/italic ăn vào), rồi tới bold/italic/link.
	function renderInline(escapedLine) {
		var codeSpans = [];
		// Marker giữ chỗ cho code span khi xử lý bold/italic/link ở dưới —
		// dùng chuỗi ASCII in được ("@@...@@"), không dùng ký tự điều khiển
		// (NUL), để tránh việc file nguồn bị ghi lẫn byte NUL thật (từng xảy
		// ra), khiến git/công cụ khác coi file này là binary.
		var out = escapedLine.replace(/`([^`]+)`/g, function (m, code) {
			codeSpans.push(code);
			return '@@SOC_CODE' + (codeSpans.length - 1) + '@@';
		});

		out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
		out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
		out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
		out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
			return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
		});

		out = out.replace(/@@SOC_CODE(\d+)@@/g, function (m, idx) {
			return '<code>' + codeSpans[Number(idx)] + '</code>';
		});

		return out;
	}

	// Markdown -> HTML tối giản cho text node: heading, đoạn văn, danh sách,
	// blockquote, code fence — đủ để khớp cách Obsidian hiển thị text node
	// trong canvas (nó render markdown, không phải plain text).
	function renderMarkdown(raw) {
		var lines = escapeHtml(raw == null ? '' : String(raw)).split(/\r\n|\r|\n/);
		var html = '';
		var i = 0;
		var n = lines.length;
		var isBlank = /^\s*$/;
		var isFence = /^```/;
		var isHeading = /^#{1,6}\s+/;
		var isQuote = /^&gt;\s?/;
		var isUl = /^[-*+]\s+/;
		var isOl = /^\d+\.\s+/;

		while (i < n) {
			var line = lines[i];

			if (isBlank.test(line)) {
				i++;
				continue;
			}

			var fence = line.match(/^```(.*)$/);
			if (fence) {
				var codeLines = [];
				i++;
				while (i < n && !/^```\s*$/.test(lines[i])) {
					codeLines.push(lines[i]);
					i++;
				}
				i++;
				html += '<pre><code>' + codeLines.join('\n') + '</code></pre>';
				continue;
			}

			var heading = line.match(/^(#{1,6})\s+(.*)$/);
			if (heading) {
				var level = heading[1].length;
				html += '<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>';
				i++;
				continue;
			}

			if (isQuote.test(line)) {
				var quoteLines = [];
				while (i < n && isQuote.test(lines[i])) {
					quoteLines.push(lines[i].replace(isQuote, ''));
					i++;
				}
				html += '<blockquote><p>' + quoteLines.map(renderInline).join('<br>') + '</p></blockquote>';
				continue;
			}

			if (isUl.test(line)) {
				var uItems = [];
				while (i < n && isUl.test(lines[i])) {
					uItems.push(lines[i].replace(isUl, ''));
					i++;
				}
				html += '<ul>' + uItems.map(function (it) {
					return '<li>' + renderInline(it) + '</li>';
				}).join('') + '</ul>';
				continue;
			}

			if (isOl.test(line)) {
				var oItems = [];
				while (i < n && isOl.test(lines[i])) {
					oItems.push(lines[i].replace(isOl, ''));
					i++;
				}
				html += '<ol>' + oItems.map(function (it) {
					return '<li>' + renderInline(it) + '</li>';
				}).join('') + '</ol>';
				continue;
			}

			var paraLines = [];
			while (
				i < n &&
				!isBlank.test(lines[i]) &&
				!isFence.test(lines[i]) &&
				!isHeading.test(lines[i]) &&
				!isQuote.test(lines[i]) &&
				!isUl.test(lines[i]) &&
				!isOl.test(lines[i])
			) {
				paraLines.push(lines[i]);
				i++;
			}
			if (paraLines.length) {
				html += '<p>' + paraLines.map(renderInline).join('<br>') + '</p>';
			}
		}

		return html;
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

		// Tọa độ/zoom mặc định lấy từ tham số shortcode (PHP đã validate và
		// chỉ set data-attribute khi có giá trị hợp lệ). Thiếu tham số nào
		// thì tham số đó rơi về mặc định riêng: x/y -> tâm hình chữ nhật bao
		// toàn bộ node (rawCenterX/Y, tính trong render()), zoom -> scale
		// vừa khung (fitScale()).
		var attrX = root.getAttribute('data-soc-canvas-x');
		var attrY = root.getAttribute('data-soc-canvas-y');
		var attrZoom = root.getAttribute('data-soc-canvas-zoom');
		var hasX = attrX !== null && attrX !== '' && !isNaN(parseFloat(attrX));
		var hasY = attrY !== null && attrY !== '' && !isNaN(parseFloat(attrY));
		var hasZoom = attrZoom !== null && attrZoom !== '' && !isNaN(parseFloat(attrZoom));
		var xAttr = hasX ? parseFloat(attrX) : 0;
		var yAttr = hasY ? parseFloat(attrY) : 0;
		var zoomAttr = hasZoom ? parseFloat(attrZoom) : 1;

		var viewport = document.createElement('div');
		viewport.className = 'soc-canvas__viewport';

		// .soc-canvas__scaler là phần tử "trong luồng" (không
		// position: absolute) mà JS set kích thước = worldSize * scale — nhờ
		// đó trình duyệt tính đúng scrollWidth/scrollHeight của viewport và
		// tự vẽ scrollbar thật. world bên trong giữ kích thước KHÔNG scale
		// (đúng bằng worldSize) rồi scale bằng transform, khớp hình ảnh với
		// box của scaler.
		var scaler = document.createElement('div');
		scaler.className = 'soc-canvas__scaler';

		var world = document.createElement('div');
		world.className = 'soc-canvas__world';
		scaler.appendChild(world);
		viewport.appendChild(scaler);

		var loading = document.createElement('div');
		loading.className = 'soc-canvas__loading';
		loading.textContent = 'Đang tải canvas…';

		// Ô nhỏ ở góc trên-trái hiển thị tọa độ tâm khung nhìn hiện tại (theo
		// đúng hệ tọa độ trong file .canvas) và hệ số zoom — để người dùng
		// pan/zoom bằng tay tới vị trí ưng ý rồi đọc số này điền thẳng vào
		// tham số x/y/zoom của shortcode, không cần đoán.
		var coords = document.createElement('div');
		coords.className = 'soc-canvas__coords';

		root.innerHTML = '';
		root.appendChild(viewport);
		root.appendChild(loading);
		root.appendChild(coords);

		var state = { scale: 1 };
		var worldSize = { w: 0, h: 0 };
		var offsetX = 0, offsetY = 0;
		var rawCenterX = 0, rawCenterY = 0;

		function updateLayout() {
			scaler.style.width = (worldSize.w * state.scale) + 'px';
			scaler.style.height = (worldSize.h * state.scale) + 'px';
			world.style.transform = 'scale(' + state.scale + ')';
		}

		// Tâm khung nhìn hiện tại, quy đổi ngược về hệ tọa độ gốc trong file
		// .canvas (trừ offsetX/offsetY của lần render) — đúng giá trị cần
		// điền vào tham số x/y của shortcode để mở lại đúng vị trí này.
		function updateCoordsDisplay() {
			var rect = viewport.getBoundingClientRect();
			if (!rect.width || !rect.height) {
				return;
			}
			var rawX = (viewport.scrollLeft + rect.width / 2) / state.scale - offsetX;
			var rawY = (viewport.scrollTop + rect.height / 2) / state.scale - offsetY;
			coords.textContent = 'x: ' + Math.round(rawX) + '  y: ' + Math.round(rawY) + '  zoom: ' + state.scale.toFixed(2);
		}

		function fitScale() {
			var rect = viewport.getBoundingClientRect();
			if (!worldSize.w || !worldSize.h || !rect.width || !rect.height) {
				return 1;
			}
			return Math.min(rect.width / worldSize.w, rect.height / worldSize.h, 1);
		}

		// Đưa điểm (rawX, rawY) — tọa độ gốc trong file .canvas, chưa cộng
		// offsetX/offsetY của lần render hiện tại — vào giữa khung nhìn, ở
		// mức zoom cho trước.
		function goTo(rawX, rawY, scale) {
			state.scale = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
			updateLayout();
			var rect = viewport.getBoundingClientRect();
			viewport.scrollLeft = (rawX + offsetX) * state.scale - rect.width / 2;
			viewport.scrollTop = (rawY + offsetY) * state.scale - rect.height / 2;
			updateCoordsDisplay();
		}

		// Khung nhìn mặc định (lúc tải trang / khi resize cửa sổ): từng tham
		// số x/y/zoom dùng giá trị khai báo ở shortcode nếu có, thiếu tham số
		// nào thì dùng mặc định riêng của tham số đó — không phải
		// tất-cả-hoặc-không.
		function resetView() {
			goTo(hasX ? xAttr : rawCenterX, hasY ? yAttr : rawCenterY, hasZoom ? zoomAttr : fitScale());
		}

		// Nút "vừa khung" (icon 4 góc mở rộng — "xem tất cả"): LUÔN fit toàn
		// bộ node vào khung nhìn, bỏ qua x/y/zoom cấu hình ở shortcode —
		// khác resetView() ở trên. Nếu không tách riêng, trang có cấu hình
		// x/y/zoom cố định (để mở mặc định ở một góc cụ thể) sẽ khiến nút này
		// chỉ quay lại đúng góc đó thay vì thực sự hiện toàn cảnh canvas như
		// icon thể hiện.
		function fitAll() {
			goTo(rawCenterX, rawCenterY, fitScale());
		}

		function zoomBy(factor, centerX, centerY) {
			var rect = viewport.getBoundingClientRect();
			var cx = centerX == null ? rect.width / 2 : centerX;
			var cy = centerY == null ? rect.height / 2 : centerY;
			var newScale = Math.min(Math.max(state.scale * factor, MIN_SCALE), MAX_SCALE);
			// Toạ độ (trong world chưa scale) đang nằm dưới con trỏ — giữ
			// nguyên toạ độ này sau khi đổi scale để zoom đúng quanh con trỏ.
			var worldX = (viewport.scrollLeft + cx) / state.scale;
			var worldY = (viewport.scrollTop + cy) / state.scale;
			state.scale = newScale;
			updateLayout();
			viewport.scrollLeft = worldX * newScale - cx;
			viewport.scrollTop = worldY * newScale - cy;
			updateCoordsDisplay();
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

			rawCenterX = (minX + maxX) / 2;
			rawCenterY = (minY + maxY) / 2;

			var pad = 160;
			offsetX = -minX + pad;
			offsetY = -minY + pad;
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
					// Khớp theo ảnh mẫu người dùng gửi: viền dùng thẳng màu
					// preset gốc, KHÔNG pha xám nữa (các lần chỉnh trước theo
					// hướng giảm sắc độ đã đi ngược ảnh mẫu — viền trong ảnh
					// rõ ràng là màu rực, không xám).
					el.style.borderColor = color;
					// Nền: pha màu gốc với đen theo tỉ lệ đậm hơn hẳn trước
					// (20% màu, trước chỉ 5%) để ra đúng kiểu nền tối NHƯNG
					// rõ sắc màu (nền đỏ sẫm/lục sẫm...) như trong ảnh, thay
					// vì gần như đen/xám thuần như trước. Vẫn pha thêm một
					// chút var(--soc-bg) (10%) để nền node không hoàn toàn
					// tách rời tông nền chung của canvas.
					el.style.backgroundColor =
						'color-mix(in srgb, var(--soc-bg) 10%, color-mix(in srgb, ' + color + ' 20%, black 80%) 90%)';
					// Custom property để CSS (border-bottom của heading) đọc
					// đúng màu viền của node này — xem canvas-viewer.css.
					el.style.setProperty('--soc-node-accent', color);
				}

				var content = document.createElement('div');
				content.className = 'soc-canvas__node-content';
				content.innerHTML = renderMarkdown(n.text || '');
				el.appendChild(content);

				world.appendChild(el);
			});

			updateLayout();
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
				resetView();
				setupControls();
			})
			.catch(function (err) {
				loading.className = 'soc-canvas__error';
				loading.textContent = 'Không thể tải canvas: ' + err.message;
			});

		function setupControls() {
			var controls = document.createElement('div');
			controls.className = 'soc-canvas__controls';
			// Icon dạng SVG inline (stroke: currentColor) thay cho ký tự
			// Unicode trước đây (−/⤢/+) — kính lúp có dấu trừ/cộng cho
			// zoom out/in, 4 góc mở rộng cho "vừa khung" (chuẩn icon
			// "fit/maximize" quen thuộc), đều rõ ràng và nhất quán hơn.
			controls.innerHTML =
				'<button type="button" data-soc-action="zoom-out" aria-label="Thu nhỏ" title="Thu nhỏ">'
				+ '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
				+ '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line>'
				+ '</svg></button>'
				+ '<button type="button" data-soc-action="zoom-reset" aria-label="Vừa khung" title="Vừa khung">'
				+ '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
				+ '<path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>'
				+ '</svg></button>'
				+ '<button type="button" data-soc-action="zoom-in" aria-label="Phóng to" title="Phóng to">'
				+ '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
				+ '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line>'
				+ '</svg></button>';
			// Nút riêng để về đúng x/y/zoom mặc định khai báo ở shortcode —
			// khác nút "vừa khung" ở trên (luôn fit toàn bộ node, bỏ qua cấu
			// hình). Chỉ hiện khi trang thực sự có khai báo ít nhất 1 trong 3
			// tham số x/y/zoom, tránh thừa một nút làm y hệt nút "vừa khung".
			// Icon: crosshair/target — quen dùng cho "về đúng một điểm/khung
			// nhìn đã lưu", phân biệt rõ với icon "xem tất cả".
			if (hasX || hasY || hasZoom) {
				controls.innerHTML +=
					'<button type="button" data-soc-action="goto-default" aria-label="Về khung nhìn mặc định" title="Về khung nhìn mặc định">'
					+ '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
					+ '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line><circle cx="12" cy="12" r="2"></circle>'
					+ '</svg></button>';
			}
			controls.addEventListener('click', function (e) {
				var btn = e.target.closest('[data-soc-action]');
				if (!btn) {
					return;
				}
				var action = btn.getAttribute('data-soc-action');
				if (action === 'goto-default') {
					resetView();
				} else if (action === 'zoom-in') {
					zoomBy(1.25);
				} else if (action === 'zoom-out') {
					zoomBy(0.8);
				} else if (action === 'zoom-reset') {
					fitAll();
				}
			});
			root.appendChild(controls);
		}

		// Kéo để pan.
		var dragging = false, lastX = 0, lastY = 0, moved = false;
		viewport.addEventListener('mousedown', function (e) {
			// Bấm vào chính scrollbar thật (nằm ngoài clientWidth/clientHeight
			// của viewport, tức phần dải cuộn) thì để trình duyệt tự xử lý,
			// không khởi động pan bằng tay ở đây — nếu không sẽ bị "kéo đúp":
			// vừa kéo scrollbar vừa bị handler này ghi đè scrollLeft/scrollTop.
			var rect = viewport.getBoundingClientRect();
			if (e.clientX - rect.left > viewport.clientWidth || e.clientY - rect.top > viewport.clientHeight) {
				return;
			}
			// Chặn hành vi bôi đen text mặc định của trình duyệt khi bấm-kéo
			// (CSS user-select: none đã chặn phần lớn, preventDefault ở đây
			// chặn nốt việc bắt đầu drag-select mà vài trình duyệt vẫn kích
			// hoạt trên mousedown trước khi user-select kịp áp dụng).
			e.preventDefault();
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
			viewport.scrollLeft -= e.clientX - lastX;
			viewport.scrollTop -= e.clientY - lastY;
			lastX = e.clientX;
			lastY = e.clientY;
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
				viewport.scrollLeft -= t.clientX - touchLast.x;
				viewport.scrollTop -= t.clientY - touchLast.y;
				touchLast = { x: t.clientX, y: t.clientY };
				e.preventDefault();
			}
		}, { passive: false });
		viewport.addEventListener('touchend', function () {
			touchLast = null;
		});

		// Cuộn chuột để zoom quanh vị trí con trỏ — trừ khi con trỏ đang ở
		// trên một node có scrollbar dọc (nội dung dài hơn khung node) và
		// còn chỗ để cuộn theo hướng đó: khi đó để trình duyệt tự cuộn nội
		// dung node như bình thường, không zoom canvas.
		viewport.addEventListener('wheel', function (e) {
			var contentEl = e.target.closest && e.target.closest('.soc-canvas__node-content');
			if (contentEl && contentEl.scrollHeight > contentEl.clientHeight) {
				var atTop = contentEl.scrollTop <= 0;
				var atBottom = contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 1;
				if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
					return;
				}
			}
			e.preventDefault();
			var rect = viewport.getBoundingClientRect();
			var factor = e.deltaY < 0 ? 1.1 : 0.9;
			zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
		}, { passive: false });

		// Kéo chuột/chạm set scrollLeft/scrollTop trực tiếp (không đi qua
		// goTo()/zoomBy()) nên bắt bằng sự kiện scroll thay vì gọi tay ở từng
		// nơi — cũng tiện bắt luôn trường hợp người dùng cuộn bằng scrollbar
		// thật (đã thêm ở CSS) thay vì kéo/chạm.
		viewport.addEventListener('scroll', updateCoordsDisplay);

		window.addEventListener('resize', resetView);
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
