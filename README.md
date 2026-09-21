# Simple Obsidian Canvas Display

Plugin [Grav CMS](https://getgrav.org) hiển thị file **Obsidian Canvas** (`.canvas`, định dạng [JSON Canvas](https://jsoncanvas.org)) ngay trên trang web, qua một shortcode duy nhất. Chỉ đọc đúng những gì cần thiết — **node dạng text** cùng **màu của node và đường nối** — rồi vẽ ra một khung canvas có thể kéo, zoom, cuộn.

## Cách hoạt động

1. Xuất/copy file `.canvas` từ Obsidian **thẳng vào thư mục của trang** (cùng cấp với file `.md`).
2. Chèn shortcode `[canvas file="ten-file.canvas"]` vào nội dung trang.
3. Trình duyệt tải file `.canvas` (JSON) và tự vẽ bằng JavaScript thuần — không cần build, không thư viện ngoài.

## Yêu cầu

- Grav `>= 1.7.0`
- Plugin [`shortcode-core`](https://github.com/getgrav/grav-plugin-shortcode-core) (đã bật)

## Cài đặt

Đặt plugin vào `user/plugins/simple-obsidian-canvas-display/` (clone trực tiếp hoặc thêm làm git submodule), rồi xoá cache:

```bash
git clone git@github.com:tipforeveryone/grav-plugin-simple-obsidian-canvas-display.git \
  user/plugins/simple-obsidian-canvas-display
bin/grav clearcache
```

Cấu hình (`simple-obsidian-canvas-display.yaml`) chỉ có một công tắc:

```yaml
enabled: true
```

## Sử dụng

```
[canvas file="ten-file.canvas" height="480px" x="0" y="0" zoom="1"]
```

| Tham số  | Bắt buộc | Mặc định | Mô tả |
|----------|----------|----------|-------|
| `file`   | Có       | —        | Tên file `.canvas` nằm **ngay trong thư mục của trang** chứa shortcode. Không chấp nhận `/`, `\` hay `..`, và phải kết thúc bằng `.canvas`. |
| `height` | Không    | `480px`  | Chiều cao khung. Nhận số nguyên kèm đơn vị `px`, `vh` hoặc `%`; số trần (vd `600`) được hiểu là `px`; giá trị không hợp lệ rơi về mặc định. |
| `x`      | Không    | Tâm canvas | Toạ độ X được canh vào **giữa khung nhìn** khi tải trang. Theo đúng hệ toạ độ trong file `.canvas` (không phải pixel màn hình). Số nguyên/thập phân, có thể âm. |
| `y`      | Không    | Tâm canvas | Toạ độ Y tương tự `x`. |
| `zoom`   | Không    | Vừa khung | Mức zoom mặc định (`1` = 100%, số dương; giới hạn hiển thị 0.1–4). |

"Tâm canvas" là tâm hình chữ nhật bao toàn bộ node. `x`, `y`, `zoom` độc lập với nhau — khai báo tham số nào thì tham số đó được dùng, thiếu tham số nào thì tham số đó rơi về mặc định.

### Lấy giá trị `x` / `y` / `zoom` thế nào?

Góc trên-trái của khung luôn hiển thị **toạ độ tâm khung nhìn hiện tại và hệ số zoom** (ví dụ `x: 809  y: 342  zoom: 0.78`). Kéo/zoom tới khung nhìn ưng ý rồi đọc số đó điền thẳng vào shortcode.

## Tính năng hiển thị

- **Node text** render Markdown tối giản: heading `#`–`######`, đoạn văn, danh sách (`-`/`*`/`1.`), blockquote, code inline và code fence, **đậm**, *nghiêng*, liên kết `http(s)`.
- **Màu node và đường nối**: hỗ trợ 6 màu preset của Obsidian (`"1"` đỏ, `"2"` cam, `"3"` vàng, `"4"` lục, `"5"` cyan, `"6"` tím) và mã hex tự chọn. Viền node dùng màu gốc, nền node là bản tối của cùng màu; đường nối (bezier + mũi tên) và nhãn cạnh (`label`) được vẽ bằng SVG.
- **Điều hướng**: kéo chuột / chạm 1 ngón để pan, cuộn chuột để zoom quanh con trỏ, scrollbar thật trên khung. Khi con trỏ đang ở trên node có nội dung dài và còn chỗ cuộn, con lăn sẽ cuộn nội dung node thay vì zoom canvas.
- **Nút điều khiển** (góc dưới-phải):
  - kính lúp `−` / `+`: thu nhỏ / phóng to;
  - 4 góc mở rộng: **xem tất cả** — luôn fit toàn bộ node vào khung, bất kể `x`/`y`/`zoom`;
  - crosshair: **về khung nhìn mặc định** đã khai báo bằng `x`/`y`/`zoom` (chỉ hiện khi shortcode có khai báo ít nhất một trong ba tham số).
- Tự đổi theo theme sáng/tối (`prefers-color-scheme`), nền dạng lưới chấm.

## Phạm vi (cố ý giới hạn)

Chỉ render node `text`. Các loại node khác trong JSON Canvas (`file`, `link`, `group`) **bị bỏ qua**, không hiển thị. Edge chỉ dùng `fromNode`/`toNode`, `fromSide`/`toSide`, `color`, `label`.

## Cơ chế kỹ thuật

- **Shortcode**: đăng ký qua `ShortcodeManager::registerAllShortcodes()` của `shortcode-core`; class `Grav\Plugin\Shortcodes\CanvasShortcode`. CSS/JS chỉ được nạp trên trang thực sự có shortcode.
- **Phục vụ file `.canvas`**: thư mục trang của Grav có tiền tố số (`01.home/`) nên nginx không truyền thẳng file tĩnh được; Grav tự phục vụ file trong thư mục trang qua `Grav::fallbackUrl()` nhưng **chỉ với phần mở rộng có trong `media.types`**. Plugin đăng ký `media.types.canvas` (`application/json`) lúc `onPluginsInitialized` để file `.canvas` được stream ra đúng `Content-Type`.
- **Cuộn thật**: khung là `overflow: auto` chứa một phần tử `scaler` có kích thước = kích thước world × zoom, world bên trong scale bằng `transform`, nên `scrollWidth/scrollHeight` (và scrollbar) phản ánh đúng vùng cuộn được.

## Bảo mật

- Giá trị tham số shortcode được escape (`Shortcode::escAttr()`) trước khi đưa vào thuộc tính HTML; `height`, `x`, `y`, `zoom` được kiểm tra bằng regex nghiêm ngặt.
- `file` bị chặn path traversal (`/`, `\`, `..`) và chỉ nhận đuôi `.canvas`.
- Nội dung node được escape HTML trước khi render Markdown; liên kết chỉ nhận `http(s)://`.

## Cấu trúc thư mục

```
simple-obsidian-canvas-display/
├── simple-obsidian-canvas-display.php     # class plugin, đăng ký media type + shortcode
├── simple-obsidian-canvas-display.yaml    # cấu hình (enabled)
├── blueprints.yaml                        # metadata cho Grav Admin
├── classes/shortcodes/CanvasShortcode.php # shortcode [canvas ...]
└── assets/
    ├── canvas-viewer.js                   # parse + render + pan/zoom
    └── canvas-viewer.css                  # giao diện, theme sáng/tối
```

## Giấy phép

MIT — © tipforeveryone
