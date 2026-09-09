<?php

namespace Grav\Plugin\Shortcodes;

use Thunder\Shortcode\Shortcode\ShortcodeInterface;

/**
 * [canvas file="ten-file.canvas" height="480px"]
 *
 * `file` phải là tên file nằm ngay trong thư mục của trang đang chứa
 * shortcode (nơi bạn copy thẳng file .canvas xuất từ Obsidian vào) — không
 * chấp nhận "/" hay ".." trong tên để tránh trỏ ra ngoài thư mục trang.
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
            if (!preg_match('/^\d+(px|vh|%)$/', $height)) {
                $height = '480px';
            }

            $page = $this->grav['page'];
            $src = rtrim($page->url(), '/') . '/' . rawurlencode($file);

            $this->shortcode->addAssets('css', 'plugin://simple-obsidian-canvas-display/assets/canvas-viewer.css');
            $this->shortcode->addAssets('js', 'plugin://simple-obsidian-canvas-display/assets/canvas-viewer.js');

            $id = 'soc-canvas-' . substr(md5($src . $sc->getContent()), 0, 8);

            return '<div class="soc-canvas" id="' . self::escAttr($id) . '" '
                . 'data-soc-canvas-src="' . self::escAttr($src) . '" '
                . 'style="height: ' . self::escAttr($height) . ';">'
                . '<div class="soc-canvas__loading">Đang tải canvas…</div>'
                . '</div>';
        });
    }
}
