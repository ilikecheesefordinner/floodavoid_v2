# 🌊 ATLANTIS AI — TỔNG HỢP TOÀN BỘ NGUỒN DỮ LIỆU CỦA HỆ THỐNG

> **Dự án**: ATLANTIS — Bản đồ Cảnh báo Ngập lụt, Phân tích Camera Giao thông Thời gian thực & Dẫn đường Tránh ngập Thông minh (100% Miễn phí).  
> **Phạm vi dữ liệu**: Hà Nội & TP. Hồ Chí Minh.  
> **Cập nhật ngày**: 06/11/2026.

---

## 📑 MỤC LỤC
1. [Nguồn Dữ Liệu Camera Giao Thông Thực Tế (TP. Hồ Chí Minh)](#1-nguồn-dữ-liệu-camera-giao-thông-thực-tế-tp-hồ-chí-minh)
2. [Nguồn Dữ Liệu Trạm Giám Sát Úng Ngập & Đo Mưa (Hà Nội - HSDC)](#2-nguồn-dữ-liệu-trạm-giám-sát-úng-ngập--đo-mưa-hà-nội---hsdc)
3. [Nguồn Dữ Liệu Thời Tiết & Lượng Mưa Tức Thời (Open-Meteo)](#3-nguồn-dữ-liệu-thời-tiết--lượng-mưa-tức-thời-open-meteo)
4. [Nguồn Dữ Liệu Thủy Văn Sông Ngòi & Triều Cường](#4-nguồn-dữ-liệu-thủy-văn-sông-ngòi--triều-cường)
5. [Nguồn Dữ Liệu Bản Đồ Nền Toàn Cầu (Map Tiles)](#5-nguồn-dữ-liệu-bản-đồ-nền-toàn-cầu-map-tiles)
6. [Nguồn Dữ Liệu Tìm Kiếm Địa Điểm & Định Vị (Geocoding)](#6-nguồn-dữ-liệu-tìm-kiếm-địa-điểm--định-vị-geocoding)
7. [Nguồn Dữ Liệu Định Tuyến & Chỉ Đường Turn-by-Turn (OSRM)](#7-nguồn-dữ-liệu-định-tuyến--chỉ-đường-turn-by-turn-osrm)
8. [Mô Hình Dữ Liệu AI Thủy Lực & Computer Vision](#8-mô-hình-dữ-liệu-ai-thủy-lực--computer-vision)
9. [Dữ Liệu Điểm Trú Xe Cao Ráo, Cứu Hộ SOS & Thông Số Phương Tiện](#9-dữ-liệu-điểm-trú-xe-cao-ráo-cứu-hộ-sos--thông-số-phương-tiện)

---

## 1. Nguồn Dữ Liệu Camera Giao Thông Thực Tế (TP. Hồ Chí Minh)

Hệ thống kết nối trực tiếp với luồng ảnh snapshot camera ngoài hiện trường của **Trung tâm Quản lý Điều hành Giao thông Đô thị — Sở Giao thông Vận tải TP.HCM**.

| Thông số | Chi tiết kỹ thuật |
| :--- | :--- |
| **Cơ quan chủ quản** | Sở Giao thông Vận tải TP. Hồ Chí Minh |
| **Cổng thông tin chính thức** | `https://giaothong.hochiminhcity.gov.vn/map.aspx` |
| **Giao thức lấy ảnh** | HTTPS On-demand RTSP Frame Grabber qua cổng `:8007` |
| **Endpoint máy chủ ảnh** | `https://giaothong.hochiminhcity.gov.vn:8007/Render/CameraHandler.ashx?id={camId}&t={timestamp}` |
| **Độ phân giải ảnh gốc** | $518 \times 294$ pixels (JPEG nguyên bản, không chèn viền đen) |
| **Dung lượng ảnh thật** | $35.000\text{ bytes} - 60.000\text{ bytes}$ (khoảng 35KB – 60KB) |
| **Tần suất cập nhật** | $5\text{ giây / lần}$ tự động |
| **Cơ chế xử lý proxy (`server.js`)** | Duy trì kết nối **Keep-Alive**, đồng bộ Cookie phiên (`.VDMS`, `_frontend`, `TS01e7700a`), tự động **Pre-warm** và lọc bỏ frame chờ `"IMAGE NOT AVAILABLE"` ($< 12\text{KB}$) để luôn trả về ảnh đường phố thật. |

### Danh sách các mắt Camera trọng điểm tại các rốn ngập TP.HCM:
1. **Nguyễn Hữu Cảnh – Ngô Tất Tố (Cầu Thủ Thiêm 1)**: `camId: 587470c2b807da0011e33ce4` (Mã Cam: `TTH 40.2`)
2. **Dạ cầu Thủ Thiêm 1 (Ngô Tất Tố 2)**: `camId: 63b65ebebfd3d90017eaa3ae` (Mã Cam: `TTH 233.1`)
3. **Nguyễn Hữu Cảnh – Tôn Đức Thắng**: `camId: 58af994abd82540010390c37` (Mã Cam: `TTH 36.1`)
4. **Nguyễn Hữu Cảnh – Ung Văn Khiêm (Ngã tư D2)**: `camId: 66b1c3fa779f740018674146` (Mã Cam: `TTH 418`)
5. **Võ Nguyên Giáp – Thảo Điền (TP. Thủ Đức)**: `camId: 587c782db807da0011e33d3b` (Mã Cam: `TTH 33.3`)
6. **Cầu Sài Gòn 3 (Dạ cầu Bình Thạnh)**: `camId: 58abc0cbbd82540010390ba6` (Mã Cam: `TTH 49.3`)
7. **Khánh Hội – Cầu Kênh Tẻ (Trần Xuân Soạn, Q.7)**: `camId: 63ae7669bfd3d90017e8f0d9` (Mã Cam: `TTH 183.1`)
8. **Nguyễn Hữu Thọ – Đường số 15 (Quận 7)**: `camId: 662a8f3a1afb9c00172d2b31` (Mã Cam: `TTH 326`)
9. **Huỳnh Tấn Phát – Nguyễn Thị Thập (Quận 7)**: `camId: 63bd1f48bfd3d90017ec3d19` (Mã Cam: `TTH 246`)
10. **Huỳnh Tấn Phát – Phú Thuận (Quận 7)**: `camId: 662a8cc51afb9c00172d2938` (Mã Cam: `TTH 320`)
11. **QL1 – Hồ Học Lãm (Bình Tân)**: `camId: 59ca31d602eb490011a0a40b` (Mã Cam: `IDICO-QL1 33`)
12. **Võ Văn Kiệt – An Dương Vương 2 (Bình Tân)**: `camId: 56de42f611f398ec0c481299` (Mã Cam: `TTH 18.2`)

---

## 2. Nguồn Dữ Liệu Trạm Giám Sát Úng Ngập & Đo Mưa (Hà Nội - HSDC & iHanoi)

Hệ thống kết nối trực tiếp với máy chủ của **Công ty TNHH MTV Thoát nước Hà Nội (HSDC)** và đồng bộ liên kết Cổng điều hành giao thông thành phố (**iHanoi - Công dân Thủ đô số**).

| Thông số | Chi tiết kỹ thuật |
| :--- | :--- |
| **Cơ quan chủ quản úng ngập** | Công ty TNHH Một thành viên Thoát nước Hà Nội (HSDC) |
| **Cổng thông tin HSDC** | `https://thoatnuochanoi.vn/ungngap` |
| **Cổng camera giao thông Hà Nội** | `https://ihanoi.hanoi.gov.vn` (Ứng dụng Công dân Thủ đô số - UBND TP. Hà Nội) |
| **API dữ liệu 45 trạm ngập** | `https://thoatnuochanoi.vn/ungngap/api/flood/getflood` |
| **Định dạng dữ liệu trả về** | JSON thời gian thực gồm mã trạm (`Id`), tên nút giao (`Name`), độ sâu ngập (`MucNgap` cm), trạng thái ngập (`TrangThai`), tọa độ GPS (`Lat`, `Lng`). |
| **API Telemetry Trạm đo mưa** | `https://thoatnuochanoi.vn/rain/images/{rainStationId}.png` (Ảnh biểu đồ đo lượng mưa tích lũy dạng số động, cập nhật liên tục) |
| **API Telemetry Trạm đo mực nước hồ** | `https://thoatnuochanoi.vn/wt/images/{waterStationId}.png` (Ảnh biểu đồ đo mực nước hồ chứa điều hòa thời gian thực) |
| **Cơ chế hiển thị trong app** | Tại Hà Nội, hệ thống hiển thị chính xác bảng quan trắc thời gian thực gồm Trạm đo mưa trực tiếp + Trạm đo mực nước hồ/sông HSDC + Mô phỏng nút giao và AI đo mực nước, tuyệt đối không chèn nhầm ảnh camera TP.HCM. |

### Danh sách các trạm giám sát trọng điểm tại Hà Nội:
* **Trạm #87**: Ngã tư Tây Sơn – Thái Hà (165 Thái Hà)  
  * Trạm đo mưa: Trạm #55 Thái Hà (`rain/images/55.png`)  
  * Trạm đo mực nước: Hồ Đống Đa (`wt/images/2_18.png`)
* **Trạm #1414**: Phố Vương Thừa Vũ – Trường Chinh  
  * Trạm đo mưa: Trạm #56 Lương Đình Của – Kim Liên (`rain/images/56.png`)  
  * Trạm đo mực nước: Hồ Xã Đàn (`wt/images/2_27.png`)
* **Trạm #131**: Nguyễn Xiển (Ngã ba Nguyễn Trãi – Ngõ 214)  
  * Trạm đo mưa: Trạm #57 Nguyễn Trãi – Thanh Xuân (`rain/images/57.png`)  
  * Trạm đo mực nước: Sông Tô Lịch (`wt/images/1_63.png`)
* **Trạm #72**: Hoa Bằng – Cầu Giấy  
  * Trạm đo mưa: Trạm #59 Dịch Vọng – Cầu Giấy (`rain/images/59.png`)  
  * Trạm đo mực nước: Hồ Nghĩa Tân (`wt/images/2_30.png`)
* **Trạm #64**: Bến xe Giáp Bát – Giải Phóng  
  * Trạm đo mưa: Trạm #60 Giáp Bát – Hoàng Mai (`rain/images/60.png`)  
  * Trạm đo mực nước: Hồ Linh Đàm (`wt/images/2_15.png`)
* **Trạm #18**: Ngã tư Phan Bội Châu – Lý Thường Kiệt  
  * Trạm đo mưa: Trạm #58 Vân Hồ – Hoàn Kiếm (`rain/images/58.png`)  
  * Trạm đo mực nước: Hồ Hoàn Kiếm – Đền Ngọc Sơn (`wt/images/2_26.png`)

---

## 3. Nguồn Dữ Liệu Thời Tiết & Lượng Mưa Tức Thời (Open-Meteo)

Hệ thống sử dụng dữ liệu thời tiết thực tế từ tổ chức khí tượng quốc tế **Open-Meteo API** (chuẩn WMO - Tổ chức Khí tượng Thế giới).

| Thông số | Chi tiết kỹ thuật |
| :--- | :--- |
| **Nhà cung cấp** | Open-Meteo (Non-commercial Open Data License) |
| **Chi phí** | 100% Miễn phí, không giới hạn Key |
| **API Endpoint** | `https://api.open-meteo.com/v1/forecast` |
| **Các tham số truy vấn** | `latitude`, `longitude`, `current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m`, `hourly=precipitation,rain` |
| **Dữ liệu trích xuất** | Cường độ mưa tức thời ($I$ đơn vị $\text{mm/h}$), lượng mưa tích lũy, nhiệt độ ngoài trời ($^\circ\text{C}$), mã trạng thái thời tiết WMO (Trời trong, nhiều mây, mưa rào, dông bão). |
| **Độ trễ cập nhật** | Cập nhật theo thời gian thực mỗi 15 phút. |

---

## 4. Nguồn Dữ Liệu Thủy Văn Sông Ngòi & Triều Cường

Mô hình mực nước sông ngòi được tích hợp từ số liệu trắc địa thực tế của các trạm thủy văn quốc gia:

### Tại Hà Nội (Lưu vực Sông Tô Lịch & Sông Nhuệ):
* **Trạm Thủy văn Cầu Lủ (Sông Tô Lịch)** & **Trạm Đồng Bông I (Sông Nhuệ)**:
  * Mực nước bình thường ($H_{\text{normal}}$): $3.50\text{ m}$
  * Báo động cấp I ($H_{\text{warn}}$): $4.50\text{ m}$ (nước bắt đầu đầy miệng cống thoát)
  * Báo động cấp II - Nguy cấp ($H_{\text{crit}}$): $5.30\text{ m}$ (nước sông tràn ngược vào hệ thống cống nội đô)
  * Dữ liệu mô phỏng / thực tế trích xuất qua `js/hydro-ai.js` và `js/data.js`.

### Tại TP. Hồ Chí Minh (Lưu vực Sông Sài Gòn & Triều Cường):
* **Trạm Thủy văn Phú An (Sông Sài Gòn)** & **Trạm Nhà Bè (Sông Đồng Điền)**:
  * Mực nước chuẩn trung bình: $1.10\text{ m}$
  * Báo động I: $1.40\text{ m}$
  * Báo động II: $1.50\text{ m}$
  * Báo động III (Đỉnh triều gây ngập diện rộng): $1.60\text{ m} - 1.72\text{ m}$

---

## 5. Nguồn Dữ Liệu Bản Đồ Nền Toàn Cầu (Map Tiles)

Giao diện hiển thị bản đồ mượt mà 60fps trên Leaflet.js sử dụng các nguồn Tile Server chuẩn quốc tế:

1. **Google Maps Mặc Định (Google Streets)**:
   * URL: `https://mt1.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}`
   * Đặc điểm: Giao diện chuẩn thân thuộc với người dùng Việt Nam, đầy đủ tên đường tiếng Việt, số nhà, ngõ ngách.
2. **Google Maps Vệ Tinh (Google Satellite Hybrid)**:
   * URL: `https://mt1.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}`
   * Đặc điểm: Ảnh chụp quang cảnh thực tế từ vệ tinh độ nét cao kết hợp lớp nhãn tên đường.
3. **Bản Đồ Thủy Văn Đêm (CARTO Dark Matter)**:
   * URL: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
   * Đặc điểm: Bản đồ tương phản cao ban đêm, làm nổi bật các vệt nước ngập đỏ/vàng và đèn đường giao thông khi trời mưa bão tối trời.
4. **Bản Đồ Đô Thị Hiện Đại (CARTO Voyager)**:
   * URL: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`
   * Đặc điểm: Bản đồ vector raster chi tiết cao, hiển thị rõ từng ngõ phố, tòa nhà và cầu đường đô thị.
5. **Bản Đồ Tối Giản Siêu Nhẹ (CARTO Positron)**:
   * URL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
   * Miễn phí công khai từ CARTO & OpenStreetMap Contributors.

---

## 6. Nguồn Dữ Liệu Tìm Kiếm Địa Điểm & Định Vị (Geocoding)

Hệ thống kết hợp 2 nguồn dữ liệu để đảm bảo tìm kiếm siêu nhạy, gõ không dấu/có dấu ra ngay:

### A. Dữ liệu Danh bạ Địa phương Nội Bộ (`js/data.js`):
* Chứa hơn 50+ địa danh, nút giao, bệnh viện, trường đại học, bến xe, khu đô thị lớn tại Hà Nội và TP.HCM.
* Thuật toán [`normalizeViText`](./js/app.js) khử toàn bộ dấu tiếng Việt (`normalize('NFD')`, thay thế `đ/Đ` $\rightarrow$ `d/D`), cho phép gõ tắt (`"thai ha"`, `"ben thanh"`, `"bach khoa"`) phản hồi ngay sau **$0\text{ms}$**.

### B. Dữ liệu Geocoding Bản Đồ Mở (OpenStreetMap Nominatim):
* **Endpoint tìm kiếm**: `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&addressdetails=1&limit=8&q={query}`
* **Endpoint dịch ngược GPS (Reverse Geocoding)**: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}`
* Tích hợp bộ đệm `geocodeSearchCache` trên `server.js` để tìm kiếm tức thì và tiết kiệm băng thông.
* Tích hợp W3C Geolocation API (`navigator.geolocation`) để bắt tọa độ GPS từ chip phần cứng điện thoại / máy tính.

---

## 7. Nguồn Dữ Liệu Định Tuyến & Chỉ Đường Turn-by-Turn (OSRM)

| Thông số | Chi tiết kỹ thuật |
| :--- | :--- |
| **Công nghệ định tuyến** | OSRM (Open Source Routing Machine) Driving Engine v5 |
| **Nền tảng mạng đường bộ** | Toàn bộ mạng lưới giao thông đường bộ Việt Nam từ OpenStreetMap |
| **Endpoint API** | `https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true&alternatives=true` |
| **Thông tin cung cấp** | Tọa độ đa giác tuyến đường (`geometry.coordinates`), tổng quãng đường ($km$), tổng thời gian di chuyển ($phút$), từng bước chuyển hướng (`steps`) gồm tên đường, khoảng cách tới khúc cua, mã rẽ (`turn`, `new name`, `roundabout`, `uturn`). |
| **Thuật toán Né Ngập của ATLANTIS** | Khi lộ trình OSRM cắt qua bán kính điểm ngập vượt giới hạn gầm xe, thuật toán tự động tính **Vector pháp tuyến vuông góc (Perpendicular Offsets)** cách tâm ngập $850\text{m} - 1.300\text{m}$ để tạo điểm uốn né ngập tự động mà không làm lộ trình bị đi vòng quá xa. |

---

## 8. Mô Hình Dữ Liệu AI Thủy Lực & Computer Vision

1. **Thuật toán Dự báo Ngập Đô thị (HydroAI)**:
   * Dựa trên phương trình Thủy văn Đô thị cải tiến (Modified Rational Method):
     $$Q_{\text{in}} = C_{\text{basin}} \times I \times A$$
     $$Q_{\text{out}} = Q_{\text{pipe}} \times \left(1 - \frac{H_{\text{river}} - H_{\text{normal}}}{H_{\text{crit}} - H_{\text{normal}}}\right)$$
     $$H_{\text{flood}} = f\left(\frac{Q_{\text{in}} - Q_{\text{out}}}{\text{Diện tích lưu vực}}\right)$$
   * Trong đó:
     * $I$: Cường độ mưa thực tế từ Open-Meteo ($\text{mm/h}$).
     * $t$: Thời gian mưa kéo dài ($\text{phút}$).
     * $H_{\text{river}}$: Mực nước sông hiện tại ($\text{m}$).
     * $C_{\text{basin}}$: Hệ số trũng lòng chảo và bê tông hóa của từng nút giao.
2. **Thuật toán AI Computer Vision Phân Tích Ảnh Camera (CameraAI)**:
   * Phân tích ảnh đường phố từ Camera Giao thông và Camera máy điện thoại người dùng.
   * Quét ma trận điểm ảnh (Single-Pass Pixel Analysis), nhận diện:
     * Tỷ lệ phản xạ mặt nước (Water Specular Reflection Index).
     * Mức độ biến dạng gợn sóng (Ripple Surface Variance).
     * Điểm mốc chuẩn từ mép vỉa hè ($15\text{cm} - 25\text{cm}$) và tâm bánh xe máy/ô tô ($25\text{cm} - 35\text{cm}$) để xuất ra độ sâu ngập ước tính ($\text{cm}$) cùng độ tin cậy ($\%$).

---

## 9. Dữ Liệu Điểm Trú Xe Cao Ráo, Cứu Hộ SOS & Thông Số Phương Tiện

### A. Điểm đỗ xe tầng nổi & Gara Cứu hộ 24/7:
* **Hà Nội**:
  * Bãi đỗ xe nổi Royal City (Nguyễn Trãi, Đống Đa) — Cốt nền cao $+9.5\text{m}$.
  * Gara Cứu hộ Thủy kích 24/7 Láng Hạ (Hotline: `0904 116 116`).
* **TP. Hồ Chí Minh**:
  * Bãi đỗ xe tầng nổi Pearl Plaza (Điện Biên Phủ, Bình Thạnh).
  * Đội cứu hộ Ô tô - Xe máy Sài Gòn SOS 24/7 (Hotline: `0938 118 118`).
  * Đường dây nóng Cứu nạn khẩn cấp: `114`.

### B. Bảng Giới Hạn Ngập An Toàn Cho 9 Chủng Loại Phương Tiện:
| Nhóm xe | Chủng loại xe | Giới hạn an toàn | Ngưỡng chết máy | Cảnh báo kỹ thuật |
| :--- | :--- | :---: | :---: | :--- |
| **Xe máy** | Xe tay ga (AirBlade, Lead, Vision, SH) | **16 cm** | **22 cm** | Cổ hút gió nồi thấp ($18\text{cm}$), rất dễ thủy kích bộ nồi. |
| **Xe máy** | Xe số phổ thông (Wave, Sirius, Future) | **22 cm** | **30 cm** | Cổ hút gió cao ($25\text{cm}$), đi số 1-2 đều ga. |
| **Xe máy** | Xe côn tay / Mô tô gầm cao (Exciter, Winner) | **25 cm** | **35 cm** | Gầm thoáng, cần rà côn tránh nước văng vào bugi. |
| **Ô tô con** | Hatchback cỡ A (Morning, i10, Fadil, VF3) | **18 cm** | **25 cm** | Gầm rất thấp ($15\text{cm}$), tuyệt đối không đi cạnh xe tải. |
| **Ô tô con** | Sedan hạng B/C (Vios, Accent, City, Mazda3) | **20 cm** | **28 cm** | Tâm trục bánh xe $\approx 25\text{cm}$, tắt A/C và đi số thấp. |
| **Ô tô con** | Sedan hạng D / Xe điện (Camry, VF8) | **24 cm** | **32 cm** | Cần bật chế độ lội nước, di chuyển đều ga. |
| **SUV/Bán tải** | CUV đô thị 5 chỗ (CX-5, Tucson, Seltos, VF7) | **30 cm** | **40 cm** | Khoảng sáng gầm $20\text{cm}$, lội nước tối đa $35\text{cm}$. |
| **SUV/Bán tải** | SUV 7 chỗ gầm rời (Fortuner, Everest, Pajero) | **42 cm** | **55 cm** | Khung gầm rời cao, lội an toàn $50\text{cm}$. |
| **SUV/Bán tải** | Bán tải chuyên dụng (Ranger, Hilux, Triton) | **55 cm** | **75 cm** | Họng hút gió nóc gầm, khả năng lội nước tới $80\text{cm}$. |

---

*Tài liệu này được tạo tự động để lưu trữ vĩnh viễn cấu trúc kỹ thuật và nguồn cấp dữ liệu cho đề tài ATLANTIS AI.*
