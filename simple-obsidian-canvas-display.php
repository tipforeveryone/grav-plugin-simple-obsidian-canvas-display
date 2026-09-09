<?php

namespace Grav\Plugin;

use Grav\Common\Plugin;

/**
 * Simple Obsidian Canvas Display
 *
 * Hiển thị file Obsidian Canvas (.canvas — JSON Canvas spec) đặt ngay trong
 * thư mục của trang, qua shortcode [canvas file="ten-file.canvas"]. Chỉ đọc
 * text + màu của node/edge — không xử lý các node type khác (file/link/group)
 * mà định dạng JSON Canvas hỗ trợ, theo đúng phạm vi đã chốt.
 *
 * Đăng ký shortcode qua registerAllShortcodes() — cùng cơ chế ShortcodeCore
 * dùng cho các shortcode có sẵn của nó (namespace Grav\Plugin\Shortcodes
 * dùng chung), nên nếu shortcode-core chưa cài/bật thì sự kiện
 * onShortcodeHandlers đơn giản là không bao giờ được bắn — không cần tự
 * kiểm tra thêm.
 */
class SimpleObsidianCanvasDisplayPlugin extends Plugin
{
    public static function getSubscribedEvents(): array
    {
        return [
            'onPluginsInitialized' => ['onPluginsInitialized', 0],
        ];
    }

    public function onPluginsInitialized(): void
    {
        if (!$this->config->get('plugins.simple-obsidian-canvas-display.enabled', true)) {
            return;
        }

        // Grav chỉ phục vụ trực tiếp (qua Grav::fallbackUrl(), không phải
        // nginx passthrough — page folder có prefix số nên URL không khớp
        // đường dẫn vật lý) các file nằm trong thư mục trang mà phần mở
        // rộng đã có trong media.types. ".canvas" là JSON thuần, chưa có
        // type riêng, nên đăng ký ở đây (giống hệt "json" có sẵn trong
        // system/config/media.yaml) để file .canvas trở thành page media
        // và được stream ra với đúng Content-Type.
        $this->config->set('media.types.canvas', [
            'type' => 'file',
            'mime' => 'application/json',
        ]);

        $this->enable([
            'onShortcodeHandlers' => ['onShortcodeHandlers', 0],
        ]);
    }

    public function onShortcodeHandlers(): void
    {
        $this->grav['shortcode']->registerAllShortcodes(__DIR__ . '/classes/shortcodes');
    }
}
