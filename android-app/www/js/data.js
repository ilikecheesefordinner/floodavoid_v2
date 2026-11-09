/**
 * ATLANTIS - Cơ sở dữ liệu Thủy văn, Điểm đen Ngập lụt & Camera Giao thông Thực tế
 * Nguồn dữ liệu thực tế:
 * 1. TP. Hồ Chí Minh: Cổng Thông tin Giao thông TP.HCM (https://giaothong.hochiminhcity.gov.vn:8007/Render/CameraHandler.ashx)
 * 2. Hà Nội: Công ty TNHH MTV Thoát nước Hà Nội - HSDC Maps (https://thoatnuochanoi.vn/ungngap/api/flood/getflood, /rain/images, /wt/images)
 */

window.ATLANTIS_DATA = {
  cities: {
    hanoi: {
      id: 'hanoi',
      name: 'Hà Nội',
      center: [21.009461, 105.815000],
      zoom: 13,
      riverStation: {
        name: 'Sông Tô Lịch (Trạm Cầu Lủ) & Sông Nhuệ (Trạm Đồng Bông I)',
        normalLevelM: 3.5,
        warningLevelM: 4.5,
        criticalLevelM: 5.3,
        currentRealLevelM: 3.85,
        minSliderM: 2.5,
        maxSliderM: 6.5
      },
      defaultOrigin: {
        name: 'Ngã tư Sở (Đầu phố Tây Sơn, Đống Đa)',
        lat: 21.0052,
        lng: 105.8226
      },
      defaultDestination: {
        name: 'Hồ Hoàn Kiếm (Bờ Hồ)',
        lat: 21.0318,
        lng: 105.8515
      },
      viewbox: '105.70,21.12,105.95,20.92',
      // Mạng lưới các nút giao đại lộ lớn 4-6 làn xe (Chỉ dùng khi cần đường vòng tránh ngập, tuyệt đối không đi ngõ)
      arterialBypassNodes: [
        { name: 'Ngã tư Láng - Láng Hạ (Vành Đai 2, mặt cắt 50m)', coords: [21.015271, 105.814155] },
        { name: 'Ngã tư Cầu Giấy - Đường Láng (Vành Đai 2, mặt cắt 50m)', coords: [21.031091, 105.802439] },
        { name: 'Trục Huỳnh Thúc Kháng - Láng Hạ (mặt cắt 30m)', coords: [21.01733, 105.81341] },
        { name: 'Ngã tư Xã Đàn - Phạm Ngọc Thạch (Vành Đai 1, mặt cắt 50m)', coords: [21.011311, 105.836767] },
        { name: 'Ngã tư Trường Chinh - Giải Phóng (Vành Đai 2, mặt cắt 60m)', coords: [21.0005, 105.84145] },
        { name: 'Ngã tư Lê Duẩn - Đại Cồ Việt (Vành Đai 1, mặt cắt 50m)', coords: [21.008054, 105.841443] },
        { name: 'Ngã tư Nguyễn Trãi - Khuất Duy Tiến (Vành Đai 3, mặt cắt 70m)', coords: [20.994472, 105.80116] },
        { name: 'Ngã tư Giảng Võ - Cát Linh - Hào Nam (mặt cắt 35m)', coords: [21.02842, 105.827536] },
        { name: 'Đại lộ Nguyễn Chí Thanh - Huỳnh Thúc Kháng (mặt cắt 50m)', coords: [21.023498, 105.810204] }
      ],
      // Danh sách lịch sử & địa điểm phổ biến khi người dùng bấm vào thanh tìm kiếm
      searchHistory: [
        {
          title: 'Hồ Hoàn Kiếm (Bờ Hồ)',
          subtitle: 'Quận Hoàn Kiếm, Hà Nội • Đi qua trục Tây Sơn - Thái Hà - Nguyễn Lương Bằng',
          lat: 21.0318,
          lng: 105.8515
        },
        {
          title: 'Văn Miếu - Quốc Tử Giám (Đống Đa)',
          subtitle: '58 Quốc Tử Giám, Đống Đa • Đi qua Ngã tư Tây Sơn - Thái Hà',
          lat: 21.0278,
          lng: 105.8355
        },
        {
          title: 'Bến xe Mỹ Đình (Nam Từ Liêm)',
          subtitle: '20 Phạm Hùng, Mỹ Đình, Hà Nội • Đi qua Nguyễn Xiển / Phạm Hùng',
          lat: 21.0285,
          lng: 105.7783
        },
        {
          title: 'Tòa nhà Keangnam Landmark 72',
          subtitle: 'Phạm Hùng - Cầu Giấy • Đi qua nút giao Dương Đình Nghệ - Phạm Hùng',
          lat: 21.0225,
          lng: 105.7812
        },
        {
          title: 'Khu đô thị Dương Nội (Aeon Mall Hà Đông)',
          subtitle: 'Đi dọc trục Tố Hữu - Lương Thế Vinh • Lưu vực Sông Nhuệ',
          lat: 20.9835,
          lng: 105.7460
        }
      ],
      popularPlaces: [
        { name: 'Ngã tư Sở (Royal City)', subtitle: 'Đường Nguyễn Trãi - Tây Sơn - Đường Láng, Đống Đa', lat: 21.0029, lng: 105.8206 },
        { name: 'Phố Thái Hà (Ngã tư Chùa Bộc - Tây Sơn)', subtitle: 'Quận Đống Đa, Hà Nội', lat: 21.009461, lng: 105.824682 },
        { name: 'Đường Láng (Ngã tư Láng Hạ - Lê Văn Lương)', subtitle: 'Quận Đống Đa / Cầu Giấy, Hà Nội', lat: 21.0162, lng: 105.8105 },
        { name: 'Láng Hạ (Rạp chiếu phim Quốc Gia)', subtitle: '87 Láng Hạ, Thành Công, Ba Đình', lat: 21.0168, lng: 105.8165 },
        { name: 'Đại học Bách Khoa Hà Nội', subtitle: 'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội', lat: 21.0051, lng: 105.8433 },
        { name: 'Đại học Quốc Gia Hà Nội (Cầu Giấy)', subtitle: '144 Xuân Thủy, Dịch Vọng Hậu, Cầu Giấy', lat: 21.0368, lng: 105.7826 },
        { name: 'Bệnh viện Bạch Mai', subtitle: '78 Giải Phóng, Phương Mai, Đống Đa, Hà Nội', lat: 21.0022, lng: 105.8407 },
        { name: 'Bến xe Giáp Bát', subtitle: 'Đường Giải Phóng, Hoàng Mai, Hà Nội', lat: 20.9801, lng: 105.8416 },
        { name: 'Times City Minh Khai', subtitle: '458 Minh Khai, Vĩnh Tuy, Hai Bà Trưng, Hà Nội', lat: 20.9958, lng: 105.8675 },
        { name: 'Lotte Center Hà Nội (Liễu Giai)', subtitle: '54 Liễu Giai, Cống Vị, Ba Đình, Hà Nội', lat: 21.0319, lng: 105.8124 },
        { name: 'Hồ Tây (Phủ Tây Hồ)', subtitle: 'Quận Tây Hồ, Hà Nội', lat: 21.0583, lng: 105.8211 },
        { name: 'Lăng Chủ tịch Hồ Chí Minh (Quảng trường Ba Đình)', subtitle: 'Số 2 Hùng Vương, Ba Đình, Hà Nội', lat: 21.0369, lng: 105.8347 },
        { name: 'Cầu Chương Dương', subtitle: 'Hoàn Kiếm - Long Biên, Hà Nội', lat: 21.0378, lng: 105.8611 },
        { name: 'Cầu Vĩnh Tuy', subtitle: 'Hai Bà Trưng - Long Biên, Hà Nội', lat: 21.0047, lng: 105.8758 },
        { name: 'Sân vận động Quốc gia Mỹ Đình', subtitle: 'Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội', lat: 21.0205, lng: 105.7639 },
        { name: 'Big C Thăng Long (Trần Duy Hưng)', subtitle: '222 Trần Duy Hưng, Trung Hòa, Cầu Giấy', lat: 21.0074, lng: 105.7929 },
        { name: 'Sân bay Quốc tế Nội Bài', subtitle: 'Phú Minh, Sóc Sơn, Hà Nội', lat: 21.2187, lng: 105.8042 }
      ],
      // Tọa độ WGS84 và Mã Trạm Thực Tế từ Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps & thoatnuochanoi.vn)
      hotspots: [
        {
          id: 'spot-hn-1',
          hsdcTramId: '87',
          name: 'Ngã tư Tây Sơn - Thái Hà',
          district: 'Đống Đa',
          lat: 21.009461,
          lng: 105.824682,
          elevationM: 5.2,
          drainageCapacityMmH: 38,
          basinFactor: 1.32,
          riverProximityWeight: 0.72,
          maxRadiusM: 280,
          detectedBy: 'AI + Trạm HSDC #87',
          reportCount: 19,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #87: Ngã tư Tây Sơn - Thái Hà (165 Thái Hà)',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '55',
          rainStationName: 'Trạm đo mưa 165 Thái Hà (Đống Đa)',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/55.png',
          waterStationId: '2_18',
          waterStationName: 'Trạm đo mực nước Hồ Đống Đa (Hoàng Cầu)',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/2_18.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 28,
          hazards: ['Sóng nước từ xe buýt', 'Vỉa hè thấp khó phân biệt']
        },
        {
          id: 'spot-hn-2',
          hsdcTramId: '1414',
          name: 'Phố Vương Thừa Vũ - Trường Chinh',
          district: 'Thanh Xuân',
          lat: 20.999527,
          lng: 105.821941,
          elevationM: 4.8,
          drainageCapacityMmH: 32,
          basinFactor: 1.42,
          riverProximityWeight: 0.85,
          maxRadiusM: 260,
          detectedBy: 'Trạm HSDC #1414 + Cộng đồng',
          reportCount: 24,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #1414: Vương Thừa Vũ - Trường Chinh',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '56',
          rainStationName: 'Trạm đo mưa Lương Đình Của - Kim Liên',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/56.png',
          waterStationId: '2_27',
          waterStationName: 'Trạm đo mực nước Hồ Xã Đàn',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/2_27.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 25,
          hazards: ['Rốn trũng lòng chảo', 'Nước rút chậm khi sông Tô Lịch dâng']
        },
        {
          id: 'spot-hn-3',
          hsdcTramId: '131',
          name: 'Nguyễn Xiển (Ngã ba Nguyễn Trãi - Ngõ 214)',
          district: 'Thanh Xuân',
          lat: 20.987856,
          lng: 105.805592,
          elevationM: 4.9,
          drainageCapacityMmH: 35,
          basinFactor: 1.38,
          riverProximityWeight: 0.90,
          maxRadiusM: 340,
          detectedBy: 'AI + Trạm HSDC #131',
          reportCount: 31,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #131: Nguyễn Xiển - Ngã tư Nguyễn Trãi',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '57',
          rainStationName: 'Trạm đo mưa 336 Nguyễn Trãi (Thanh Xuân)',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/57.png',
          waterStationId: '1_63',
          waterStationName: 'Trạm đo mực nước Sông Tô Lịch - Cầu Lủ',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/1_63.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 30,
          hazards: ['Xe tải lớn tạo sóng mạnh', 'Hố ga thoát nước dọc vành đai 3']
        },
        {
          id: 'spot-hn-4',
          hsdcTramId: '164',
          name: 'Tố Hữu - Đình Phùng Khoang (Lương Thế Vinh)',
          district: 'Nam Từ Liêm',
          lat: 20.989479,
          lng: 105.793000,
          elevationM: 4.6,
          drainageCapacityMmH: 30,
          basinFactor: 1.48,
          riverProximityWeight: 0.95,
          maxRadiusM: 320,
          detectedBy: 'AI + Trạm HSDC #164',
          reportCount: 28,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #164: Tố Hữu - Đình Phùng Khoang',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '22',
          rainStationName: 'Trạm đo mưa Thanh Bình - Mỗ Lao',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/22.png',
          waterStationId: '1_34',
          waterStationName: 'Trạm đo mực nước Kênh La Khê - Yên Nghĩa',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/1_34.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 28,
          hazards: ['Sát lưu vực Sông Nhuệ', 'Ngập sâu làn BRT khi sông Nhuệ > 4.8m']
        },
        {
          id: 'spot-hn-5',
          hsdcTramId: '193',
          name: 'Dương Đình Nghệ - Keangnam - Đỗ Đức Dục',
          district: 'Cầu Giấy',
          lat: 21.022737,
          lng: 105.783104,
          elevationM: 5.0,
          drainageCapacityMmH: 36,
          basinFactor: 1.35,
          riverProximityWeight: 0.82,
          maxRadiusM: 310,
          detectedBy: 'AI + Trạm HSDC #193',
          reportCount: 16,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #61: Dương Đình Nghệ - Hồ CV1 Keangnam',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '61',
          rainStationName: 'Trạm đo mưa Hồ điều hòa CV1 Keangnam',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/61.png',
          waterStationId: '1_20',
          waterStationName: 'Trạm đo mực nước Sông Nhuệ - Trạm bơm Đồng Bông I',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/1_20.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 26,
          hazards: ['Hầm để xe chung cư xung quanh', 'Nước tràn qua dải phân cách']
        },
        {
          id: 'spot-hn-6',
          hsdcTramId: '10',
          name: 'Ngã tư Phan Bội Châu - Lý Thường Kiệt',
          district: 'Hoàn Kiếm',
          lat: 21.025475,
          lng: 105.843262,
          elevationM: 5.4,
          drainageCapacityMmH: 34,
          basinFactor: 1.36,
          riverProximityWeight: 0.65,
          maxRadiusM: 230,
          detectedBy: 'Trạm HSDC #10',
          reportCount: 21,
          lastUpdatedText: 'Cập nhật trực tiếp',
          cameraTitle: 'Trạm HSDC #10: Ngã tư Phan Bội Châu - Lý Thường Kiệt',
          officialPortalName: 'Cổng Giám Sát Úng Ngập Hà Nội (HSDC Maps)',
          officialPortalUrl: 'https://thoatnuochanoi.vn/ungngap',
          trafficPortalName: 'Camera Giao thông Hà Nội (iHanoi)',
          trafficPortalUrl: 'https://ihanoi.hanoi.gov.vn',
          liveFeedType: 'hanoi_hsdc',
          rainStationId: '51',
          rainStationName: 'Trạm đo mưa 29 Quang Trung (Hoàn Kiếm)',
          rainImgUrl: 'https://thoatnuochanoi.vn/rain/images/51.png',
          waterStationId: '2_26',
          waterStationName: 'Trạm đo mực nước Hồ Hoàn Kiếm - Đền Ngọc Sơn',
          waterImgUrl: 'https://thoatnuochanoi.vn/wt/images/2_26.png',
          hsdcIconUrl: 'https://hsdc.thoatnuochanoi.vn/images/display/202608311105287262087_Flood_level1.png',
          curbReferenceCm: 26,
          hazards: ['Cây xanh cổ thụ dọc tuyến phố', 'Ngập nhanh khi mưa lớn cục bộ']
        }
      ],
      safeZones: [
        {
          id: 'safe-hn-1',
          type: 'parking',
          name: 'Bãi đỗ xe nổi Royal City (Đường Nguyễn Trãi)',
          lat: 21.0038,
          lng: 105.8152,
          elevationText: 'Cốt nền cao +9.5m • An toàn 100%',
          phone: '024 6664 9999'
        },
        {
          id: 'safe-hn-2',
          type: 'garage',
          name: 'Gara Cứu Hộ Thủy Kích 24/7 Láng Hạ',
          lat: 21.0162,
          lng: 105.8165,
          elevationText: 'Hỗ trợ cẩu kéo sàn trượt & Xử lý bugi/thủy kích',
          phone: '0904 116 116'
        }
      ],
      bypassWaypoints: {
        highGround: [21.0085, 105.8045],
        ringRoadElevated: [21.0145, 105.8162]
      }
    },

    hcmc: {
      id: 'hcmc',
      name: 'TP. Hồ Chí Minh',
      center: [10.789203, 106.715097],
      zoom: 13,
      riverStation: {
        name: 'Sông Sài Gòn (Trạm Phú An - Triều cường)',
        normalLevelM: 1.1,
        warningLevelM: 1.5,
        criticalLevelM: 1.72,
        currentRealLevelM: 1.32,
        minSliderM: 0.8,
        maxSliderM: 2.1
      },
      defaultOrigin: {
        name: 'Vinhomes Tân Cảng - Cầu Sài Gòn (Bình Thạnh)',
        lat: 10.7975,
        lng: 106.7222
      },
      defaultDestination: {
        name: 'Chợ Bến Thành (Quận 1)',
        lat: 10.7725,
        lng: 106.6980
      },
      viewbox: '106.55,10.90,106.85,10.68',
      // Mạng lưới các nút giao đại lộ lớn 4-8 làn xe TP.HCM (Chỉ dùng khi cần né ngập, giữ xe chạy trên trục đại lộ)
      arterialBypassNodes: [
        { name: 'Vòng xoay Hàng Xanh (Điện Biên Phủ - XVNT, mặt cắt 60m)', coords: [10.801481, 106.7115] },
        { name: 'Đại lộ Điện Biên Phủ - Đinh Tiên Hoàng (mặt cắt 40m)', coords: [10.792065, 106.698944] },
        { name: 'Cầu Ba Son (Thủ Thiêm 2 - Tôn Đức Thắng, mặt cắt 45m)', coords: [10.77691, 106.70697] },
        { name: 'Đại lộ Mai Chí Thọ - Lương Định Của (mặt cắt 100m)', coords: [10.777493, 106.722447] },
        { name: 'Đại lộ Võ Văn Kiệt - Trần Hưng Đạo (mặt cắt 60m)', coords: [10.758223, 106.691483] },
        { name: 'Đại lộ Phạm Văn Đồng - Phan Văn Trị (mặt cắt 60m)', coords: [10.820497, 106.689497] },
        { name: 'Vòng xoay Phù Đổng Thiên Vương (CMT8 - NTMK)', coords: [10.770902, 106.691668] },
        { name: 'Ngã tư Nguyễn Thị Minh Khai - Hai Bà Trưng', coords: [10.781232, 106.696565] }
      ],
      searchHistory: [
        {
          title: 'Chợ Bến Thành (Quận 1)',
          subtitle: 'Đi qua Nguyễn Hữu Cảnh - Cầu Thủ Thiêm 1 / Điện Biên Phủ',
          lat: 10.7725,
          lng: 106.6980
        },
        {
          title: 'Khu Thảo Điền - Xuân Thủy (TP. Thủ Đức)',
          subtitle: 'Quốc Hương - Võ Nguyên Giáp • Điểm trũng sát sông Sài Gòn',
          lat: 10.8068,
          lng: 106.7335
        },
        {
          title: 'Khu đô thị Phú Mỹ Hưng - Tân Thuận (Quận 7)',
          subtitle: 'Đi qua Cầu Kênh Tẻ - Trần Xuân Soạn / Huỳnh Tấn Phát',
          lat: 10.7289,
          lng: 106.7185
        }
      ],
      popularPlaces: [
        { name: 'Vòng xoay Hàng Xanh (Bình Thạnh)', subtitle: 'Điện Biên Phủ - Xô Viết Nghệ Tĩnh, Bình Thạnh', lat: 10.801228, lng: 106.712324 },
        { name: 'Landmark 81 (Vinhomes Central Park)', subtitle: '208 Nguyễn Hữu Cảnh, Phường 22, Bình Thạnh', lat: 10.7950, lng: 106.7218 },
        { name: 'Nhà thờ Đức Bà Sài Gòn (Quận 1)', subtitle: 'Công xã Paris, Bến Nghé, Quận 1', lat: 10.7798, lng: 106.6990 },
        { name: 'Phố đi bộ Nguyễn Huệ (Bến Bạch Đằng)', subtitle: 'Quận 1, TP. Hồ Chí Minh', lat: 10.7738, lng: 106.7041 },
        { name: 'Bến Nhà Rồng (Cầu Khánh Hội)', subtitle: 'Nguyễn Tất Thành, Quận 4, TP. Hồ Chí Minh', lat: 10.7683, lng: 106.7068 },
        { name: 'Sân bay Quốc tế Tân Sơn Nhất', subtitle: 'Trường Sơn, Phường 2, Tân Bình, TP.HCM', lat: 10.8185, lng: 106.6588 },
        { name: 'Khu đô thị Phú Mỹ Hưng (Crescent Mall)', subtitle: 'Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh', lat: 10.7289, lng: 106.7185 },
        { name: 'Cầu Sài Gòn', subtitle: 'Bình Thạnh - TP. Thủ Đức (Võ Nguyên Giáp)', lat: 10.7990, lng: 106.7273 },
        { name: 'Hầm Thủ Thiêm (Mai Chí Thọ)', subtitle: 'Quận 1 - TP. Thủ Đức', lat: 10.7712, lng: 106.7108 },
        { name: 'Bến xe Miền Đông (Bình Thạnh)', subtitle: '292 Đinh Bộ Lĩnh, Phường 26, Bình Thạnh', lat: 10.8142, lng: 106.7113 },
        { name: 'Bến xe Miền Tây (Bình Tân)', subtitle: '395 Kinh Dương Vương, An Lạc, Bình Tân', lat: 10.7410, lng: 106.6186 },
        { name: 'Đại lộ Võ Văn Kiệt (Cầu Ông Lãnh)', subtitle: 'Quận 1 - Quận 4, TP. Hồ Chí Minh', lat: 10.7642, lng: 106.6975 },
        { name: 'Ngã tư Bảy Hiền (Tân Bình)', subtitle: 'Cách Mạng Tháng Tám - Hoàng Văn Thụ - Lý Thường Kiệt', lat: 10.7928, lng: 106.6529 }
      ],
      // Tọa độ WGS84 và Mã Camera Thực Tế từ Cổng Thông tin Giao thông TP.HCM (:8007/Render/CameraHandler.ashx)
      hotspots: [
        {
          id: 'spot-hcm-1',
          hcmcCamCode: 'TTH 40.2',
          hcmcCamId: '587470c2b807da0011e33ce4',
          secondaryCams: [
            { code: 'TTH 233.1', id: '63b65ebebfd3d90017eaa3ae', name: 'Dạ cầu Thủ Thiêm 1 (Ngô Tất Tố 2)' },
            { code: 'TTH 36.1', id: '58af994abd82540010390c37', name: 'Nguyễn Hữu Cảnh - Tôn Đức Thắng' }
          ],
          name: 'Nguyễn Hữu Cảnh - Ngô Tất Tố (Cầu Thủ Thiêm 1)',
          district: 'Bình Thạnh',
          lat: 10.789203,
          lng: 106.715097,
          elevationM: 1.35,
          drainageCapacityMmH: 34,
          basinFactor: 1.45,
          riverProximityWeight: 0.95,
          maxRadiusM: 340,
          detectedBy: 'Camera TTH 40.2 + Triều cường',
          reportCount: 33,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam TTH 40.2: Nguyễn Hữu Cảnh - Ngô Tất Tố (Cầu Thủ Thiêm 1)',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=587470c2b807da0011e33ce4&camLocation=Nguy%E1%BB%85n%20H%E1%BB%AFu%20C%E1%BA%A3nh%20-%20Ng%C3%B4%20T%E1%BA%A5t%20T%E1%BB%91&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 30,
          hazards: ['Triều cường sông Sài Gòn dâng', 'Sóng nước mạnh dưới dạ cầu']
        },
        {
          id: 'spot-hcm-2',
          hcmcCamCode: 'TTH 33.3',
          hcmcCamId: '587c782db807da0011e33d3b',
          secondaryCams: [
            { code: 'TTH 49.3', id: '58abc0cbbd82540010390ba6', name: 'Cầu Sài Gòn 3 (Dạ cầu Bình Thạnh)' }
          ],
          name: 'Võ Nguyên Giáp - Thảo Điền - Quốc Hương',
          district: 'TP. Thủ Đức',
          lat: 10.801012,
          lng: 106.738277,
          elevationM: 1.2,
          drainageCapacityMmH: 28,
          basinFactor: 1.52,
          riverProximityWeight: 0.98,
          maxRadiusM: 320,
          detectedBy: 'Camera TTH 33.3 + Cộng đồng',
          reportCount: 25,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam TTH 33.3: Võ Nguyên Giáp - Thảo Điền',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=587c782db807da0011e33d3b&camLocation=V%C3%B5%20Nguy%C3%AAn%20Gi%C3%A1p%20-%20Th%E1%BA%A3o%20%C4%90i%E1%BB%81n&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 28,
          hazards: ['Nước triều cường tràn bờ', 'Nhiều ổ gà bị che khuất']
        },
        {
          id: 'spot-hcm-3',
          hcmcCamCode: 'TTH 418',
          hcmcCamId: '66b1c3fa779f740018674146',
          secondaryCams: [
            { code: 'TTH 40.1', id: '586e2995f9fab7001111b0b5', name: 'Ung Văn Khiêm - Nguyễn Gia Trí (D2)' },
            { code: 'TTH 40.4', id: '5a606dbc8576340017d0662b', name: 'Điện Biên Phủ - Nguyễn Hữu Cảnh' }
          ],
          name: 'Nguyễn Hữu Cảnh - Ung Văn Khiêm (Ngã tư D2)',
          district: 'Bình Thạnh',
          lat: 10.799131,
          lng: 106.723707,
          elevationM: 1.30,
          drainageCapacityMmH: 30,
          basinFactor: 1.42,
          riverProximityWeight: 0.92,
          maxRadiusM: 290,
          detectedBy: 'Camera TTH 418 & TTH 40.1',
          reportCount: 27,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam TTH 418: Nguyễn Hữu Cảnh - Ung Văn Khiêm',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=66b1c3fa779f740018674146&camLocation=Nguy%E1%BB%85n%20H%E1%BB%AFu%20C%E1%BA%A3nh%20-%20Ung%20V%C4%83n%20Khi%C3%AAm&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 26,
          hazards: ['Mật độ xe container & xe buýt dày', 'Ngập sâu giờ tan tầm']
        },
        {
          id: 'spot-hcm-4',
          hcmcCamCode: 'TTH 183.1',
          hcmcCamId: '63ae7669bfd3d90017e8f0d9',
          secondaryCams: [
            { code: 'TTH 326', id: '662a8f3a1afb9c00172d2b31', name: 'Nguyễn Hữu Thọ - Đường số 15 (Gần Kênh Tẻ)' }
          ],
          name: 'Trần Xuân Soạn - Cầu Kênh Tẻ',
          district: 'Quận 7',
          lat: 10.752872,
          lng: 106.702180,
          elevationM: 1.15,
          drainageCapacityMmH: 28,
          basinFactor: 1.50,
          riverProximityWeight: 0.99,
          maxRadiusM: 310,
          detectedBy: 'Camera TTH 183.1 + Triều cường',
          reportCount: 38,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam TTH 183.1: Khánh Hội - Cầu Kênh Tẻ (Trần Xuân Soạn)',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=63ae7669bfd3d90017e8f0d9&camLocation=Kh%C3%A1nh%20H%E1%BB%99i%20-%20C%E1%BA%A7u%20K%C3%AAnh%20T%E1%BA%BB&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 25,
          hazards: ['Nước Kênh Tẻ tràn bờ khi đỉnh triều', 'Mặt đường trơn trượt']
        },
        {
          id: 'spot-hcm-5',
          hcmcCamCode: 'TTH 246',
          hcmcCamId: '63bd1f48bfd3d90017ec3d19',
          secondaryCams: [
            { code: 'TTH 320', id: '662a8cc51afb9c00172d2938', name: 'Huỳnh Tấn Phát - Phú Thuận' },
            { code: 'TTH 321', id: '662a8cfe1afb9c00172d296e', name: 'Huỳnh Tấn Phát - Trần Trọng Cung' }
          ],
          name: 'Huỳnh Tấn Phát - Nguyễn Thị Thập (Quận 7)',
          district: 'Quận 7',
          lat: 10.737525,
          lng: 106.730354,
          elevationM: 1.20,
          drainageCapacityMmH: 30,
          basinFactor: 1.48,
          riverProximityWeight: 0.96,
          maxRadiusM: 320,
          detectedBy: 'Camera TTH 246 & TTH 320',
          reportCount: 29,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam TTH 246: Huỳnh Tấn Phát - Nguyễn Thị Thập',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=63bd1f48bfd3d90017ec3d19&camLocation=Hu%E1%BB%B3nh%20T%E1%BA%A5n%20Ph%C3%A1t%20-%20Nguy%E1%BB%85n%20Th%E1%BB%8B%20Th%E1%BA%ADp&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 28,
          hazards: ['Nhiều xe đầu kéo container tạo sóng lớn', 'Ngập kéo dài theo triều cường']
        },
        {
          id: 'spot-hcm-6',
          hcmcCamCode: 'IDICO-QL1 33',
          hcmcCamId: '59ca31d602eb490011a0a40b',
          secondaryCams: [
            { code: 'TTH 18.2', id: '56de42f611f398ec0c481299', name: 'Võ Văn Kiệt - An Dương Vương 2' },
            { code: 'TTH 308', id: '662a881a1afb9c00172d2559', name: 'Kinh Dương Vương - Tên Lửa' }
          ],
          name: 'Võ Văn Kiệt - Hồ Học Lãm (Bình Tân)',
          district: 'Bình Tân',
          lat: 10.722240,
          lng: 106.610904,
          elevationM: 1.25,
          drainageCapacityMmH: 31,
          basinFactor: 1.44,
          riverProximityWeight: 0.90,
          maxRadiusM: 300,
          detectedBy: 'Camera IDICO-QL1 33 & TTH 18.2',
          reportCount: 22,
          lastUpdatedText: 'Trực tiếp (5s/lần)',
          cameraTitle: 'Cam IDICO-QL1 33: Nút giao Hồ Học Lãm - Võ Văn Kiệt',
          officialPortalName: 'Cổng Thông tin Giao thông TP.HCM',
          officialPortalUrl: 'https://giaothong.hochiminhcity.gov.vn/expandcameraplayer?camId=59ca31d602eb490011a0a40b&camLocation=QL1%20-%20H%E1%BB%93%20H%E1%BB%8Dc%20L%C3%A3m&camMode=camera',
          liveFeedType: 'hcmc_camera',
          curbReferenceCm: 28,
          hazards: ['Ngập làn xe máy đại lộ Võ Văn Kiệt', 'Mật độ xe tải cao']
        }
      ],
      safeZones: [
        {
          id: 'safe-hcm-1',
          type: 'parking',
          name: 'Bãi đỗ xe tầng nổi Pearl Plaza (Điện Biên Phủ)',
          lat: 10.7998,
          lng: 106.7185,
          elevationText: 'Tầng nổi cao ráo • Tránh ngập Nguyễn Hữu Cảnh',
          phone: '028 3899 8888'
        },
        {
          id: 'safe-hcm-2',
          type: 'garage',
          name: 'Cứu hộ Ô tô - Xe máy Sài Gòn SOS 24/7',
          lat: 10.7932,
          lng: 106.7091,
          elevationText: 'Cứu hộ thủy kích lưu động Quận 1 - Bình Thạnh',
          phone: '0938 118 118'
        }
      ],
      bypassWaypoints: {
        highGround: [10.7935, 106.7032],
        ringRoadElevated: [10.7852, 106.7015]
      }
    }
  },

  // Danh mục Loại xe & Chủng loại chi tiết (hiển thị ở Màn hình 3 sau khi chọn đường đi)
  vehicleCategories: [
    {
      id: 'motorbike',
      name: 'Xe máy',
      icon: '🛵',
      subtypes: [
        {
          id: 'moto_scooter',
          name: 'Xe tay ga (AirBlade, Lead, Vision, SH)',
          safeDepthCm: 16,
          criticalDepthCm: 22,
          clearanceInfo: 'Ống hút gió nồi thấp (18cm) • Rất dễ tắt máy',
          voiceCoachTip: 'Giữ đều tay ga, tuyệt đối không giảm ga đột ngột để tránh nước tràn ngược vào pô và bộ nồi.'
        },
        {
          id: 'moto_underbone',
          name: 'Xe số phổ thông (Wave, Sirius, Future)',
          safeDepthCm: 22,
          criticalDepthCm: 30,
          clearanceInfo: 'Cổ hút gió cao hơn xe ga (25cm)',
          voiceCoachTip: 'Chuyển về số 1 hoặc số 2, giữ đều ga ở vòng tua trung bình để đẩy khí xả liên tục.'
        },
        {
          id: 'moto_manual',
          name: 'Xe côn tay / Mô tô gầm cao (Exciter, Winner)',
          safeDepthCm: 25,
          criticalDepthCm: 35,
          clearanceInfo: 'Gầm cao thoáng (28cm)',
          voiceCoachTip: 'Đi số 1, rà côn nhẹ giữ tua máy ổn định, tránh tạo sóng nước bắn lên bugi.'
        }
      ]
    },
    {
      id: 'sedan',
      name: 'Ô tô con',
      icon: '🚗',
      subtypes: [
        {
          id: 'car_hatchback',
          name: 'Hatchback cỡ A (Morning, i10, Fadil, VF3)',
          safeDepthCm: 18,
          criticalDepthCm: 25,
          clearanceInfo: 'Gầm thấp (15cm) • Nguy cơ thủy kích cao',
          voiceCoachTip: 'Tắt điều hòa (A/C), chuyển về số L hoặc số 1, giữ tốc độ dưới 10km/h và tránh đi song song xe tải.'
        },
        {
          id: 'car_sedan_bc',
          name: 'Sedan hạng B/C (Vios, Accent, City, Mazda3)',
          safeDepthCm: 20,
          criticalDepthCm: 28,
          clearanceInfo: 'Tâm trục bánh xe ~25cm',
          voiceCoachTip: 'Tắt A/C, đi số thấp (S/L), giữ khoảng cách xa xe phía trước để tránh sóng nước tràn vào họng gió.'
        },
        {
          id: 'car_sedan_d',
          name: 'Sedan hạng D / Xe điện (Camry, VF8)',
          safeDepthCm: 24,
          criticalDepthCm: 32,
          clearanceInfo: 'Gầm tiêu chuẩn (26cm)',
          voiceCoachTip: 'Bật chế độ đi đường ngập/trơn trượt, di chuyển chậm đều ga không phanh gấp.'
        }
      ]
    },
    {
      id: 'suv_pickup',
      name: 'SUV / Bán tải',
      icon: '🚙',
      subtypes: [
        {
          id: 'suv_cuv',
          name: 'CUV 5 chỗ (CX-5, Tucson, Seltos, VF6/VF7)',
          safeDepthCm: 30,
          criticalDepthCm: 40,
          clearanceInfo: 'Khoảng sáng gầm 20cm • Lội nước 35cm',
          voiceCoachTip: 'Tắt A/C, đi chậm dưới 15km/h để không tạo sóng nước gây ngập cho người đi xe máy xung quanh.'
        },
        {
          id: 'suv_7seat',
          name: 'SUV 7 chỗ (Fortuner, Everest, SantaFe)',
          safeDepthCm: 42,
          criticalDepthCm: 55,
          clearanceInfo: 'Khung gầm rời cao ráo • Lội nước 50cm',
          voiceCoachTip: 'Gài cầu chậm (nếu cần), đi giữa tâm đường nơi cốt nền cao nhất.'
        },
        {
          id: 'pickup_truck',
          name: 'Bán tải (Ford Ranger, Hilux, Triton)',
          safeDepthCm: 55,
          criticalDepthCm: 75,
          clearanceInfo: 'Khả năng lội nước 60-80cm',
          voiceCoachTip: 'Giữ tốc độ thật chậm (< 10km/h) để tránh tạo sóng lớn làm ngã xe máy hai bên.'
        }
      ]
    }
  ]
};
