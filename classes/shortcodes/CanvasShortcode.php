<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

/**
 * [canvas file="ten-file.canvas" height="480px" x="0" y="0" zoom="1"]
 *
 * `file` phải là tên file nằm ngay trong thư mục của trang đang chứa
 * shortcode (nơi bạn copy thẳng file .canvas xuất từ Obsidian vào) — không
 * chấp nhận "/" hay ".." trong tên để tránh trỏ ra ngoài thư mục trang.
 *
 * `x`/`y` (tùy chọn): tọa độ (theo đúng hệ tọa độ trong file .canvas, không
 * phải tọa độ pixel trên màn hình) sẽ được canh giữa khung nhìn khi tải
 * trang / bấm nút "vừa khung". Không khai báo thì mặc định là tâm hình chữ
 * nhật bao toàn bộ node (tâm hiển thị của canvas).
 *
 * `zoom` (tùy chọn): mức zoom mặc định (1 = 100%, phải là số dương). Không
 * khai báo thì mặc định là mức zoom vừa khít khung hiển thị.
 */
class CanvasShortcode extends Shortcode
{
    public function init()
    {
        $this->shortcode->getHandlers()->add('canvas', function (ShortcodeInterface $sc) {
            $file = trim((string) $sc->getParameter('file', ''));

            if (
                $file === ''
                || strpos($file, '/') !== false
                || strpos($file, '\\') !== false
                || strpos($file, '..') !== false
                || strtolower(substr($file, -7)) !== '.canvas'
            ) {
                return '<div class="soc-canvas__error">[canvas]: thiếu hoặc sai tham số <code>file</code> (phải là tên 1 file .canvas nằm trong thư mục trang).</div>';
            }

            $height = trim((string) $sc->getParameter('height', '480px'));
            if (preg_match('/^\d+$/', $height)) {
                $height .= 'px';
            }
            if (!preg_match('/^\d+(px|vh|%)$/', $height)) {
                $height = '480px';
            }

            // x/y/zoom là tùy chọn: chỉ phát ra data-attribute tương ứng khi
            // giá trị hợp lệ, để JS phân biệt được "không khai báo" (rơi về
            // mặc định riêng của từng tham số) với "khai báo bằng 0".
            $x = trim((string) $sc->getParameter('x', ''));
            $y = trim((string) $sc->getParameter('y', ''));
            $zoom = trim((string) $sc->getParameter('zoom', ''));

            $hasX = $x !== '' && preg_match('/^-?\d+(\.\d+)?$/', $x);
            $hasY = $y !== '' && preg_match('/^-?\d+(\.\d+)?$/', $y);
            $hasZoom = $zoom !== '' && preg_match('/^\d+(\.\d+)?$/', $zoom) && (float) $zoom > 0;

            // Phải lấy trang đang được xử lý shortcode (getPage()), KHÔNG dùng
            // $this->grav['page'] (trang đang được truy cập): khi trang khác
            // gọi .summary/.content của bài này (vd khối "Bài viết khác" và
            // danh sách blog), nội dung bài được xử lý và cache ngay lúc đó
            // với grav['page'] là trang gọi — src sai thư mục sẽ bị cache lại
            // và dùng luôn cả khi mở chính bài.
            $page = $this->shortcode->getPage() ?: $this->grav['page'];
            $src = rtrim($page->url(), '/') . '/' . rawurlencode($file);

            $this->shortcode->addAssets('css', 'plugin://simple-obsidian-canvas-display/assets/canvas-viewer.css');
            $this->shortcode->addAssets('js', 'plugin://simple-obsidian-canvas-display/assets/canvas-viewer.js');

            $id = 'soc-canvas-' . substr(md5($src . $sc->getContent()), 0, 8);

            $viewAttrs = '';
            if ($hasX) {
                $viewAttrs .= ' data-soc-canvas-x="' . self::escAttr($x) . '"';
            }
            if ($hasY) {
                $viewAttrs .= ' data-soc-canvas-y="' . self::escAttr($y) . '"';
            }
            if ($hasZoom) {
                $viewAttrs .= ' data-soc-canvas-zoom="' . self::escAttr($zoom) . '"';
            }

            return '<div class="soc-canvas" id="' . self::escAttr($id) . '" '
                . 'data-soc-canvas-src="' . self::escAttr($src) . '"' . $viewAttrs . ' '
                . 'style="height: ' . self::escAttr($height) . ';">'
                . '<div class="soc-canvas__loading">Đang tải canvas…</div>'
                . '</div>';
        });
    }
}
