/**
 * ATLANTIS - Bộ điều khiển trung tâm (60fps GPU Canvas, Định vị GPS, Tìm kiếm Tiếng Việt Có/Không Dấu Thời Gian Thực,
 * Thuật toán Né Ngập Vuông Góc Động & Dữ liệu Camera Giao thông Thực tế TP.HCM / HSDC Hà Nội)
 */

window.AtlantisApp = {
  state: {
    screenMode: 'explore', // 'explore' | 'search' | 'route_preview' | 'turn_by_turn'
    previousScreenMode: 'explore',
    searchTargetField: 'to', // 'from' | 'to'
    isRealDataMode: true,
    cityId: 'hanoi',
    vehicleCatId: 'motorbike',
    vehicleSubId: 'moto_scooter',
    rainMmPerHour: 0,
    rainDurationMin: 30,
    forecastOffsetMin: 0,
    riverLevelM: 3.85,
    mapTileStyle: 'google_streets',
    voiceEnabled: true,
    wetScreenLocked: false,
    selectedHotspotId: 'spot-hn-1',
    selectedSubCamId: null,
    predictions: {},
    searchHistory: [],
    liveSearchResults: [],
    searchDebounceTimer: null,
    userGpsCoords: null,
    userGpsName: null,
    routeQuery: {
      fromName: 'Ngã tư Sở (Đống Đa)',
      fromCoords: [21.0029, 105.8206],
      toName: 'Hồ Hoàn Kiếm (Bờ Hồ)',
      toCoords: [21.0285, 105.8525]
    },
    computedRoutes: {
      directCoords: [],
      safeCoords: [],
      activeCoords: [],
      directDistanceKm: 5.4,
      safeDistanceKm: 6.1,
      directDurationMin: 15,
      safeDurationMin: 18,
      isRerouted: false,
      maxFloodOnDirectCm: 0,
      maxFloodOnSafeCm: 0,
      avoidedHotspotNames: [],
      directSteps: [],
      safeSteps: [],
      turnSteps: []
    },
    navSession: {
      mode: 'simulation',
      timerId: null,
      watchId: null,
      currentCoordIdx: 0,
      resampledCoords: [],
      speedMultiplier: 1,
      isPaused: false,
      lastBearing: 0,
      pipShownForHotspotId: null,
      lastSpokenTurnIdx: -1,
      lastRerouteTs: 0
    },
    forecastAutoPlayTimerId: null,
    camRefreshTimerId: null,
    weatherLive: null,
    toastTimerId: null
  },

  map: null,
  tileLayer: null,
  hotspotLayers: [],
  poiLayers: [],
  routeLayers: [],
  navCarMarker: null,
  userGpsMarker: null,
  userGpsCircle: null,

  // Chuẩn hóa chuỗi Tiếng Việt (bỏ dấu, chuyển chữ thường) để tìm kiếm nhạy cả có dấu lẫn không dấu
  normalizeViText(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  },

  showToast(message, durationMs = 3200) {
    const el = document.getElementById('app-toast-banner');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    if (this.state.toastTimerId) {
      clearTimeout(this.state.toastTimerId);
    }
    this.state.toastTimerId = setTimeout(() => {
      el.classList.add('hidden');
    }, durationMs);
  },

  async init() {
    // Tự động khôi phục thành phố người dùng đã chọn trước đó
    try {
      const savedCity = localStorage.getItem('atlantis_selected_city');
      if (savedCity && window.ATLANTIS_DATA.cities[savedCity]) {
        this.state.cityId = savedCity;
      }
    } catch (e) {}

    this.loadUserCreatedHotspots();

    // Tự động cập nhật mã QR và đường dẫn cài đặt theo domain hiện tại (GitHub Pages hoặc mạng LAN)
    try {
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
        const baseUrl = (location.origin + location.pathname).replace(/\/index\.html$/i, '').replace(/\/$/, '');
        const qrImg = document.getElementById('qr-mobile-img');
        const qrText = document.getElementById('qr-mobile-url-text');
        if (qrImg) {
          qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(baseUrl + '/ATLANTIS-AI.apk')}`;
        }
        if (qrText) {
          qrText.textContent = baseUrl;
        }
      }
    } catch (_) {}

    const city = this.getCurrentCity();
    this.state.riverLevelM = city.riverStation.currentRealLevelM;
    this.state.selectedHotspotId = city.hotspots[0].id;
    this.state.routeQuery = {
      fromName: city.defaultOrigin.name,
      fromCoords: [city.defaultOrigin.lat, city.defaultOrigin.lng],
      toName: city.defaultDestination.name,
      toCoords: [city.defaultDestination.lat, city.defaultDestination.lng]
    };

    this.updateCityUIBadges();
    this.loadSearchHistory();
    this.initMap();
    this.initDraggableDemoBubble();
    this.bindEvents();
    this.renderVehicleCategoryAndSubtypes();

    await this.syncLivePublicData(true);
    this.setScreenMode('explore');
  },

  getCurrentCity() {
    return window.ATLANTIS_DATA.cities[this.state.cityId];
  },

  getCurrentVehicle() {
    const cats = window.ATLANTIS_DATA.vehicleCategories;
    const cat = cats.find((c) => c.id === this.state.vehicleCatId) || cats[0];
    const sub = cat.subtypes.find((s) => s.id === this.state.vehicleSubId) || cat.subtypes[0];
    return {
      catId: cat.id,
      catName: cat.name,
      icon: cat.icon,
      ...sub
    };
  },

  loadSearchHistory() {
    const city = this.getCurrentCity();
    this.state.searchHistory = (city.searchHistory || []).map((item) => ({
      name: item.title,
      subtitle: item.subtitle,
      coords: [item.lat, item.lng],
      badge: 'Lịch sử'
    }));
  },

  initMap() {
    const city = this.getCurrentCity();
    this.map = L.map('map-container', {
      center: city.center,
      zoom: city.zoom,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    });

    this.setMapTileStyle(this.state.mapTileStyle);

    this.map.on('click', (e) => {
      document.getElementById('top-more-menu')?.classList.add('hidden');
      document.getElementById('flood-hotspot-card')?.classList.add('hidden');
      if (this.state.isPickingReportLocation && e && e.latlng) {
        this.onMapPickedForReport(e.latlng.lat, e.latlng.lng);
      }
    });

    // Hỗ trợ nhấn chuột phải (hoặc nhấn giữ trên điện thoại) vào bất kỳ điểm nào trên bản đồ để báo ngập nhanh tại đó
    this.map.on('contextmenu', (e) => {
      if (e && e.latlng) {
        this.onMapPickedForReport(e.latlng.lat, e.latlng.lng);
      }
    });
  },

  setMapTileStyle(style) {
    this.state.mapTileStyle = style;
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    const urls = {
      google_streets: 'https://mt1.google.com/vt/lyrs=m&hl=vi&x={x}&y={y}&z={z}',
      google_sat: 'https://mt1.google.com/vt/lyrs=y&hl=vi&x={x}&y={y}&z={z}',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      carto_dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      carto_voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      carto_positron: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    };

    const targetUrl = urls[style] || urls.google_streets;
    const isCarto = targetUrl.includes('cartocdn.com');

    this.tileLayer = L.tileLayer(targetUrl, {
      maxZoom: 20,
      subdomains: isCarto ? 'abcd' : ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: isCarto ? '© CARTO © OpenStreetMap' : '© Google Maps'
    }).addTo(this.map);

    document.querySelectorAll('[data-map-type-btn]').forEach((btn) => {
      const active = btn.getAttribute('data-map-type-btn') === style;
      btn.classList.toggle('ring-2', active);
      btn.classList.toggle('ring-sky-500', active);
      btn.classList.toggle('bg-sky-500/25', active);
    });
  },

  // ==================== ĐỊNH VỊ GPS THỰC TẾ ====================
  renderUserGpsMarker(lat, lng, accuracyM = 35) {
    if (!this.map) return;
    if (this.userGpsMarker) this.map.removeLayer(this.userGpsMarker);
    if (this.userGpsCircle) this.map.removeLayer(this.userGpsCircle);

    this.userGpsCircle = L.circle([lat, lng], {
      radius: Math.min(180, Math.max(25, accuracyM)),
      color: '#2563eb',
      weight: 1,
      fillColor: '#3b82f6',
      fillOpacity: 0.15
    }).addTo(this.map);

    this.userGpsMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'gps-user-dot',
        html: `<div style="width:20px;height:20px;border-radius:999px;background:#2563eb;border:3.5px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,0.28), 0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    })
      .bindPopup('<b>🎯 Vị trí GPS hiện tại của bạn</b>')
      .addTo(this.map);
  },

  async locateUserGPS(applyAndRouteImmediately = false) {
    this.showToast('📡 Đang lấy tọa độ GPS hiện tại của bạn...', 4000);

    const applyPosition = async (lat, lng, accuracyM, isSimulatedFallback = false) => {
      // Kiểm tra nếu tọa độ nằm ở TP.HCM hay Hà Nội để tự động đồng bộ thành phố
      const distToHanoi = this.distanceMeters([lat, lng], [21.0285, 105.8525]);
      const distToHcmc = this.distanceMeters([lat, lng], [10.7769, 106.7009]);

      if (distToHcmc < 80000 && this.state.cityId !== 'hcmc') {
        await this.switchCity('hcmc', true);
      } else if (distToHanoi < 80000 && this.state.cityId !== 'hanoi') {
        await this.switchCity('hanoi', true);
      }

      let resolvedName = isSimulatedFallback
        ? `Vị trí GPS của bạn (${this.getCurrentCity().defaultOrigin.name})`
        : `Vị trí GPS của bạn (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      if (!isSimulatedFallback) {
        try {
          const rev = await this.reverseGeocodeUnified(lat, lng);
          if (rev && rev.name) {
            resolvedName = `Vị trí của bạn (${rev.name})`;
          }
        } catch (e) {}
      }

      this.state.userGpsCoords = [lat, lng];
      this.state.userGpsName = resolvedName;
      this.state.routeQuery.fromName = resolvedName;
      this.state.routeQuery.fromCoords = [lat, lng];
      this.syncRouteHeaderInputs();

      this.renderUserGpsMarker(lat, lng, accuracyM);

      if (this.map && this.state.screenMode === 'explore') {
        this.map.flyTo([lat, lng], 15, { duration: 0.8 });
      }

      this.showToast(`🎯 Đã định vị: ${resolvedName}`, 3500);

      if (applyAndRouteImmediately || this.state.screenMode === 'route_preview') {
        await this.calculateAndRenderRoute(true);
      }
    };

    if (!('geolocation' in navigator)) {
      const c = this.getCurrentCity().defaultOrigin;
      await applyPosition(c.lat, c.lng, 40, true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await applyPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy || 35, false);
      },
      async () => {
        // Fallback mượt mà khi trình duyệt máy tính tắt quyền Location hoặc không có chip GPS
        const c = this.getCurrentCity().defaultOrigin;
        await applyPosition(c.lat, c.lng, 45, true);
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 15000
      }
    );
  },

  async useGpsInSearch() {
    await this.locateUserGPS(false);
    const gpsCoords = this.state.userGpsCoords || [
      this.getCurrentCity().defaultOrigin.lat,
      this.getCurrentCity().defaultOrigin.lng
    ];
    const gpsName = this.state.userGpsName || `Vị trí GPS (${this.getCurrentCity().defaultOrigin.name})`;

    if (this.state.searchTargetField === 'from') {
      this.state.routeQuery.fromName = gpsName;
      this.state.routeQuery.fromCoords = [...gpsCoords];
    } else {
      this.state.routeQuery.fromName = gpsName;
      this.state.routeQuery.fromCoords = [...gpsCoords];
    }

    this.syncRouteHeaderInputs();
    this.setScreenMode('route_preview');
    await this.calculateAndRenderRoute(true);
  },

  async openRoutePreviewDefault() {
    this.syncRouteHeaderInputs();
    this.setScreenMode('route_preview');
    await this.calculateAndRenderRoute(true);
  },

  // ==================== TÌM KIẾM ĐỊA ĐIỂM SIÊU NHẠY (CÓ DẤU & KHÔNG DẤU + AUTOCOMPLETE THỜI GIAN THỰC) ====================
  openSearchForTarget(targetField = 'to') {
    if (this.state.screenMode !== 'search') {
      this.state.previousScreenMode = this.state.screenMode;
    }
    this.setScreenMode('search');
    this.setSearchTargetField(targetField);
  },

  closeSearchOverlay() {
    const backMode = this.state.previousScreenMode === 'route_preview' ? 'route_preview' : 'explore';
    this.setScreenMode(backMode);
  },

  setSearchTargetField(targetField) {
    this.state.searchTargetField = targetField === 'from' ? 'from' : 'to';
    const btnFrom = document.getElementById('btn-search-target-from');
    const btnTo = document.getElementById('btn-search-target-to');
    const input = document.getElementById('search-destination-input');

    const isFrom = this.state.searchTargetField === 'from';
    if (btnFrom) {
      btnFrom.className = isFrom
        ? 'px-3 py-1 rounded-full border transition bg-blue-600 text-white border-blue-600 shadow-sm'
        : 'px-3 py-1 rounded-full border transition text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200';
    }
    if (btnTo) {
      btnTo.className = !isFrom
        ? 'px-3 py-1 rounded-full border transition bg-red-600 text-white border-red-600 shadow-sm'
        : 'px-3 py-1 rounded-full border transition text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200';
    }
    if (input) {
      input.placeholder = isFrom
        ? 'Nhập Điểm Đi (tên đường, ngã tư, có dấu hoặc không dấu)...'
        : 'Nhập Điểm Đến (tên đường, ngã tư, có dấu hoặc không dấu)...';
      input.focus();
    }
    this.renderSearchHistoryList(input ? input.value : '');
  },

  clearSearchInput() {
    const input = document.getElementById('search-destination-input');
    const clearBtn = document.getElementById('btn-clear-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    this.state.liveSearchResults = [];
    this.renderSearchHistoryList('');
  },

  setScreenMode(mode) {
    this.state.screenMode = mode;
    if (mode !== 'turn_by_turn') {
      this.stopTurnByTurnSimulation();
      this.stopGPSNavigation();
    }

    document.getElementById('screen-explore-top')?.classList.toggle('hidden', mode !== 'explore');
    document.getElementById('screen-explore-bottom-dock')?.classList.toggle('hidden', mode !== 'explore');
    document.getElementById('screen-search-overlay')?.classList.toggle('hidden', mode !== 'search');
    document.getElementById('screen-route-preview')?.classList.toggle('hidden', mode !== 'route_preview');
    document.getElementById('screen-turn-by-turn')?.classList.toggle('hidden', mode !== 'turn_by_turn');

    if (mode !== 'explore') {
      document.getElementById('flood-hotspot-card')?.classList.add('hidden');
      document.getElementById('time-scrubber-drawer')?.classList.add('hidden');
    }

    if (mode === 'search') {
      const input = document.getElementById('search-destination-input');
      if (input) {
        input.value = '';
      }
      document.getElementById('btn-clear-search-input')?.classList.add('hidden');
      this.state.liveSearchResults = [];
      this.renderSearchHistoryList('');
      setTimeout(() => document.getElementById('search-destination-input')?.focus(), 40);
    } else {
      this.renderMapLayers();
    }
  },

  getAllLocalPlacesForCity() {
    const city = this.getCurrentCity();
    const hotspotPlaces = (city.hotspots || []).map((h) => ({
      name: `${h.name} (${h.district})`,
      subtitle: `Điểm giám sát ngập & Camera • Quận ${h.district}`,
      coords: [h.lat, h.lng],
      icon: '🌊',
      badge: 'Điểm giám sát'
    }));

    const popular = (city.popularPlaces || []).map((p) => ({
      name: p.name,
      subtitle: p.subtitle,
      coords: [p.lat, p.lng],
      icon: '📍',
      badge: 'Phổ biến'
    }));

    const safePlaces = (city.safeZones || []).map((s) => ({
      name: s.name,
      subtitle: s.elevationText,
      coords: [s.lat, s.lng],
      icon: s.type === 'parking' ? '🅿️' : '🛠️',
      badge: 'Điểm trú an toàn'
    }));

    const historyItems = (this.state.searchHistory || []).map((h) => ({
      ...h,
      icon: '🕒',
      badge: h.badge || 'Gần đây'
    }));

    // Khử trùng lặp theo tên chuẩn hóa
    const seen = new Set();
    const merged = [];
    for (const item of [...historyItems, ...hotspotPlaces, ...popular, ...safePlaces]) {
      const key = this.normalizeViText(item.name);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  },

  renderSearchHistoryList(filterQuery = '') {
    const listEl = document.getElementById('search-history-list');
    const headerLabel = document.getElementById('search-list-header-label');
    if (!listEl) return;

    const rawQ = filterQuery.trim();
    const normQ = this.normalizeViText(rawQ);
    const localPlaces = this.getAllLocalPlacesForCity();

    let matchedLocal = localPlaces;
    if (normQ) {
      const queryTokens = normQ.split(/\s+/).filter(Boolean);
      matchedLocal = localPlaces
        .map((item) => {
          const normName = this.normalizeViText(item.name);
          const normSub = this.normalizeViText(item.subtitle || '');
          const combinedText = `${normName} ${normSub}`;

          // Khớp từng từ khóa (hỗ trợ cả gõ tắt/không dấu như "thai ha", "nguyen xien", "ben thanh")
          const allTokensMatch = queryTokens.every((tk) => combinedText.includes(tk));
          if (!allTokensMatch) return null;

          let score = 10;
          if (normName.startsWith( normQ )) score += 50;
          else if (normName.includes(normQ)) score += 30;
          return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item);
    } else {
      matchedLocal = localPlaces.slice(0, 14);
    }

    // Kết hợp kết quả nội bộ với kết quả OpenStreetMap thời gian thực
    const seenCoords = new Set();
    const finalItems = [];

    for (const loc of matchedLocal) {
      const key = `${loc.coords[0].toFixed(3)},${loc.coords[1].toFixed(3)}`;
      seenCoords.add(key);
      finalItems.push(loc);
    }

    if (normQ && Array.isArray(this.state.liveSearchResults)) {
      for (const live of this.state.liveSearchResults) {
        if (!live || isNaN(live.lat) || isNaN(live.lng)) continue;
        const key = `${live.lat.toFixed(3)},${live.lng.toFixed(3)}`;
        if (seenCoords.has(key)) continue;
        seenCoords.add(key);
        finalItems.push({
          name: live.name,
          subtitle: live.subtitle,
          coords: [live.lat, live.lng],
          icon: '🗺️',
          badge: 'Bản đồ thực tế'
        });
      }
    }

    if (headerLabel) {
      headerLabel.textContent = normQ
        ? `🔍 Tìm thấy ${finalItems.length} địa điểm phù hợp`
        : '🕒 Địa điểm gợi ý & đã tra cứu gần đây';
    }

    const actionText = this.state.searchTargetField === 'from' ? 'Chọn làm Điểm Đi' : 'Chỉ đường tới đây →';

    if (finalItems.length === 0) {
      listEl.innerHTML = `
        <div class="py-8 px-4 text-center space-y-2">
          <div class="text-sm font-bold text-slate-700">Đang tìm kiếm "${rawQ}" trên bản đồ Việt Nam...</div>
          <div class="text-xs text-slate-500">Bấm nút <b>"Tìm"</b> hoặc phím <b>Enter</b> để định vị trực tiếp địa chỉ này.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = finalItems
      .map((item) => {
        const safeName = String(item.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeSub = String(item.subtitle || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
          <button
            onclick="window.AtlantisApp.selectPlaceFromSearch('${safeName}', '${safeSub}', ${item.coords[0]}, ${item.coords[1]})"
            class="w-full px-3 py-2.5 flex items-center justify-between hover:bg-blue-50/80 rounded-2xl transition text-left border-b border-slate-100 last:border-none group"
          >
            <div class="flex items-center gap-3 min-w-0 pr-2">
              <div class="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-slate-700 shrink-0 text-sm">
                ${item.icon || '📍'}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-bold text-slate-800 truncate">${item.name}</span>
                  ${
                    item.badge
                      ? `<span class="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-600 text-[9px] font-extrabold">${item.badge}</span>`
                      : ''
                  }
                </div>
                <div class="text-xs text-slate-500 truncate mt-0.5">${item.subtitle || ''}</div>
              </div>
            </div>
            <span class="text-blue-600 font-extrabold text-xs shrink-0">${actionText}</span>
          </button>
        `;
      })
      .join('');
  },

  triggerLiveGeocodeAutocomplete(rawQuery) {
    if (this.state.searchDebounceTimer) {
      clearTimeout(this.state.searchDebounceTimer);
    }

    const q = rawQuery.trim();
    const statusEl = document.getElementById('search-live-status');
    if (q.length < 2) {
      this.state.liveSearchResults = [];
      if (statusEl) statusEl.textContent = 'Gõ không dấu hoặc có dấu';
      return;
    }

    if (statusEl) statusEl.textContent = '🔄 Đang tìm trên bản đồ...';

    this.state.searchDebounceTimer = setTimeout(async () => {
      const city = this.getCurrentCity();
      const seq = (this._searchReqSeq = (this._searchReqSeq || 0) + 1);
      try {
        const results = await this.searchPlacesUnified(q, city);
        // Bỏ qua phản hồi cũ nếu người dùng đã gõ truy vấn mới hơn (tránh kết quả nhảy lung tung)
        const currentInput = document.getElementById('search-destination-input');
        if (seq !== this._searchReqSeq || (currentInput && currentInput.value.trim() !== q)) return;
        if (Array.isArray(results)) {
          this.state.liveSearchResults = results;
          this.state.liveSearchQuery = q;
          this.renderSearchHistoryList(q);
        }
        if (statusEl) {
          statusEl.textContent =
            Array.isArray(results) && results.length === 0 ? 'Không thấy trên bản đồ, thử thêm tên quận/phường' : '✓ Đã đồng bộ bản đồ thực tế';
        }
      } catch (e) {
        if (seq === this._searchReqSeq && statusEl) statusEl.textContent = '⚠️ Mất kết nối tìm kiếm, đang dùng gợi ý nhanh';
      }
    }, 300);
  },

  async selectPlaceFromSearch(placeName, placeSubtitle, lat, lng) {
    // Lưu vào đầu lịch sử tra cứu
    const normNew = this.normalizeViText(placeName);
    this.state.searchHistory = [
      {
        name: placeName,
        subtitle: placeSubtitle || this.getCurrentCity().name,
        coords: [lat, lng],
        badge: 'Vừa tìm'
      },
      ...this.state.searchHistory.filter((x) => this.normalizeViText(x.name) !== normNew)
    ].slice(0, 10);

    if (this.state.searchTargetField === 'from') {
      this.state.routeQuery.fromName = placeName;
      this.state.routeQuery.fromCoords = [lat, lng];
    } else {
      this.state.routeQuery.toName = placeName;
      this.state.routeQuery.toCoords = [lat, lng];
    }

    this.syncRouteHeaderInputs();
    this.setScreenMode('route_preview');
    await this.calculateAndRenderRoute(true);
  },

  // Giữ tương thích ngược nếu có lệnh gọi cũ
  async selectDestinationFromSearch(idx, toName, toLat, toLng) {
    await this.selectPlaceFromSearch(toName, '', toLat, toLng);
  },

  async submitCustomSearchInput() {
    const input = document.getElementById('search-destination-input');
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const statusEl = document.getElementById('search-live-status');
    if (statusEl) statusEl.textContent = '🔄 Đang định vị địa chỉ...';

    // 1. Ưu tiên kiểm tra xem có kết quả khớp chính xác trong danh sách hiện tại không
    const normQ = this.normalizeViText(text);
    const localPlaces = this.getAllLocalPlacesForCity();
    const localHit =
      localPlaces.find((p) => this.normalizeViText(p.name) === normQ) ||
      (normQ.length >= 4 ? localPlaces.find((p) => this.normalizeViText(p.name).includes(normQ)) : null);

    if (localHit) {
      await this.selectPlaceFromSearch(localHit.name, localHit.subtitle, localHit.coords[0], localHit.coords[1]);
      return;
    }

    if (
      this.state.liveSearchResults &&
      this.state.liveSearchResults.length > 0 &&
      this.state.liveSearchQuery &&
      this.normalizeViText(this.state.liveSearchQuery) === normQ
    ) {
      const first = this.state.liveSearchResults[0];
      await this.selectPlaceFromSearch(first.name, first.subtitle, first.lat, first.lng);
      return;
    }

    // 2. Gọi tìm kiếm địa điểm đa tầng (Hỗ trợ cả server.js lẫn GitHub Pages)
    const city = this.getCurrentCity();
    try {
      const res = await this.searchPlacesUnified(text, city);

      if (Array.isArray(res) && res.length > 0) {
        const best = res[0];
        await this.selectPlaceFromSearch(best.name, best.subtitle, best.lat, best.lng);
        return;
      }
    } catch (e) {}

    this.showToast('⚠️ Không tìm thấy địa danh này, vui lòng chọn từ danh sách gợi ý bên dưới.');
  },

  syncRouteHeaderInputs() {
    const fromEl = document.getElementById('route-input-from');
    const toEl = document.getElementById('route-input-to');
    const topSearchText = document.getElementById('top-search-pill-text');
    if (fromEl) fromEl.value = this.state.routeQuery.fromName;
    if (toEl) toEl.value = this.state.routeQuery.toName;
    if (topSearchText && this.state.routeQuery.toName) {
      topSearchText.textContent = `Tìm đường đi, địa điểm... (${this.getCurrentCity().name})`;
    }
  },

  async swapRouteEndpoints() {
    const q = this.state.routeQuery;
    const tmpName = q.fromName;
    const tmpCoords = [...q.fromCoords];
    q.fromName = q.toName;
    q.fromCoords = [...q.toCoords];
    q.toName = tmpName;
    q.toCoords = tmpCoords;
    this.syncRouteHeaderInputs();
    await this.calculateAndRenderRoute(true);
  },

  // Tính ngưỡng ngập an toàn đại diện cho từng nhóm phương tiện để hiển thị đúng ETA trên 3 tab
  getCategorySafeDepthCm(catId) {
    const cats = window.ATLANTIS_DATA.vehicleCategories;
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return 20;
    if (cat.id === this.state.vehicleCatId) {
      return this.getCurrentVehicle().safeDepthCm;
    }
    return cat.subtypes[0].safeDepthCm;
  },

  renderVehicleCategoryAndSubtypes() {
    const catsContainer = document.getElementById('vehicle-category-tabs');
    const subsContainer = document.getElementById('vehicle-subtype-pills');
    const tipBanner = document.getElementById('vehicle-voice-coach-tip');
    if (!catsContainer || !subsContainer) return;

    const categories = window.ATLANTIS_DATA.vehicleCategories;
    const currentCat = categories.find((c) => c.id === this.state.vehicleCatId) || categories[0];
    const currentVehicle = this.getCurrentVehicle();
    const cr = this.state.computedRoutes;

    catsContainer.innerHTML = categories
      .map((cat) => {
        const isActive = cat.id === this.state.vehicleCatId;
        const catSafeCm = this.getCategorySafeDepthCm(cat.id);
        const catNeedsBypass = cr.maxFloodOnDirectCm > 0 && cr.maxFloodOnDirectCm >= catSafeCm;
        const catEtaMin = catNeedsBypass ? cr.safeDurationMin || 18 : cr.directDurationMin || 15;

        return `
          <button
            onclick="window.AtlantisApp.selectVehicleCategory('${cat.id}')"
            class="flex-1 py-2 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }"
          >
            <span>${cat.icon}</span>
            <span>${cat.name}</span>
            <span class="text-[10px] ${isActive ? 'text-blue-100' : 'text-emerald-700 font-extrabold'}">(${catEtaMin}p)</span>
          </button>
        `;
      })
      .join('');

    subsContainer.innerHTML = currentCat.subtypes
      .map((sub) => {
        const isSelected = sub.id === this.state.vehicleSubId;
        return `
          <button
            onclick="window.AtlantisApp.selectVehicleSubtype('${sub.id}')"
            class="shrink-0 px-3 py-2 rounded-2xl border text-left transition ${
              isSelected
                ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500/30'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }"
          >
            <div class="text-xs font-extrabold">${sub.name}</div>
            <div class="text-[10px] text-slate-500 mt-0.5">Giới hạn an toàn: <b>${sub.safeDepthCm}cm</b> • Chết máy: <b>${sub.criticalDepthCm}cm</b></div>
          </button>
        `;
      })
      .join('');

    if (tipBanner) {
      tipBanner.innerHTML = `💡 <b>Trợ lý lái xe (${currentVehicle.name}):</b> ${currentVehicle.voiceCoachTip}`;
    }
  },

  async selectVehicleCategory(catId) {
    const cat = window.ATLANTIS_DATA.vehicleCategories.find((c) => c.id === catId);
    if (!cat) return;
    this.state.vehicleCatId = cat.id;
    this.state.vehicleSubId = cat.subtypes[0].id;
    this.renderVehicleCategoryAndSubtypes();
    await this.recalculateAll(false, true);
  },

  async selectVehicleSubtype(subId) {
    this.state.vehicleSubId = subId;
    this.renderVehicleCategoryAndSubtypes();
    await this.recalculateAll(false, true);
  },

  // ==================== TOÁN HỌC HÌNH HỌC & THUẬT TOÁN CHỈ ĐƯỜNG NÉ NGẬP THÔNG MINH ====================
  distanceMeters(a, b) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  },

  computeBearingDeg(fromPt, toPt) {
    if (!fromPt || !toPt) return 0;
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(fromPt[0]);
    const lat2 = toRad(toPt[0]);
    const dLon = toRad(toPt[1] - fromPt[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },

  formatVietnameseStepInstruction(st) {
    const type = st.maneuver?.type || '';
    const mod = st.maneuver?.modifier || '';
    const road = st.name && st.name.trim() ? st.name.trim() : 'trục đường phía trước';

    let arrow = '↑';
    let prefix = 'Đi thẳng theo';

    if (type === 'depart') {
      prefix = 'Xuất phát vào';
      arrow = '↑';
    } else if (type === 'arrive') {
      return { arrow: '🏁', instruction: `Đến đích trên ${road}` };
    } else if (type === 'roundabout' || type === 'rotary') {
      prefix = 'Đi qua vòng xuyến vào';
      arrow = '↻';
    } else if (mod.includes('sharp left') || mod === 'left') {
      prefix = 'Rẽ trái vào';
      arrow = '↰';
    } else if (mod.includes('slight left')) {
      prefix = 'Chếch sang trái vào';
      arrow = '↖';
    } else if (mod.includes('sharp right') || mod === 'right') {
      prefix = 'Rẽ phải vào';
      arrow = '↱';
    } else if (mod.includes('slight right')) {
      prefix = 'Chếch sang phải vào';
      arrow = '↗';
    } else if (mod.includes('uturn')) {
      prefix = 'Quay đầu xe trên';
      arrow = '↶';
    }

    return {
      arrow,
      instruction: `${prefix} ${road}`
    };
  },

  parseSingleOsrmRouteObject(r) {
    const coords = r.geometry.coordinates.map((pt) => [pt[1], pt[0]]);
    const rawSteps = [];

    // 1. Gán chỉ số tọa độ tăng dần (monotonic) theo từng chặng (leg), bỏ bước arrive/depart giả tại điểm mốc trung gian (via)
    let searchFrom = 0;
    if (Array.isArray(r.legs)) {
      r.legs.forEach((leg, legIdx) => {
        const isLastLeg = legIdx === r.legs.length - 1;
        if (!Array.isArray(leg.steps)) return;
        leg.steps.forEach((st) => {
          const type = st.maneuver?.type || '';
          if (type === 'arrive' && !isLastLeg) return;
          if (type === 'depart' && legIdx > 0) return;
          if (st.distance < 8 && type !== 'arrive') return;

          const loc = st.maneuver?.location
            ? [st.maneuver.location[1], st.maneuver.location[0]]
            : coords[0];

          let bestIdx = searchFrom;
          let bestDist = Infinity;
          for (let i = searchFrom; i < coords.length; i++) {
            const d = this.distanceMeters(coords[i], loc);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
            if (bestDist < 5 && i > searchFrom + 15) break;
          }
          searchFrom = bestIdx;

          const formatted = this.formatVietnameseStepInstruction(st);
          const rawName = (st.name || '').trim();
          rawSteps.push({
            streetName: formatted.instruction,
            rawRoadName: rawName || 'Trục đường chính',
            isUnnamedRoad: !rawName,
            distanceM: Math.max(15, Math.round(st.distance || 80)),
            arrow: formatted.arrow,
            location: loc,
            coordIdx: bestIdx
          });
        });
      });
    }

    // 2. Tự động cắt bỏ mọi nhánh cụt / vòng lặp thừa trên quỹ đạo (ví dụ: rẽ vào Ngõ 81 Xã Đàn hoặc Ngõ 1 Trần Huy Liệu
    //    để chạm điểm mốc trung gian rồi quay đầu ra đúng vị trí cũ trên đại lộ)
    const startPt = coords[0];
    const endPt = coords[coords.length - 1];
    let totalRemovedM = 0;
    let changed = true;
    let guard = 0;

    while (changed && guard++ < 10 && coords.length >= 6) {
      changed = false;
      const n = coords.length;
      const cum = new Array(n).fill(0);
      for (let k = 1; k < n; k++) cum[k] = cum[k - 1] + this.distanceMeters(coords[k - 1], coords[k]);

      for (let i = 1; i < n - 3; i++) {
        if (this.distanceMeters(coords[i], startPt) < 70 || this.distanceMeters(coords[i], endPt) < 70) continue;
        let bestJ = -1;
        for (let j = n - 2; j > i + 1; j--) {
          const loopLen = cum[j] - cum[i];
          if (loopLen < 35 || loopLen > 1400) continue;
          if (this.distanceMeters(coords[j], startPt) < 70 || this.distanceMeters(coords[j], endPt) < 70) continue;
          const chord = this.distanceMeters(coords[i], coords[j]);
          if (chord <= 26 && loopLen >= Math.max(35, chord * 4)) {
            const prevIdx = Math.max(0, i - 3);
            const nextIdx = Math.min(n - 1, j + 3);
            const bIn = this.computeBearingDeg(coords[prevIdx], coords[i]);
            const bOut = this.computeBearingDeg(coords[j], coords[nextIdx]);
            const diff = Math.abs(((bOut - bIn + 540) % 360) - 180);
            if (chord <= 8 || diff <= 65) {
              bestJ = j;
              break;
            }
          }
        }
        if (bestJ !== -1) {
          const removed = cum[bestJ] - cum[i] - this.distanceMeters(coords[i], coords[bestJ]);
          totalRemovedM += Math.max(0, removed);
          const cutCount = bestJ - i;
          coords.splice(i + 1, cutCount);
          // Nếu bước tại bestJ là đoạn tiếp tục trên cùng trục đường chính ngay trước nhánh cụt -> cộng dồn quãng đường
          let prevMainStep = null;
          for (let s = 0; s < rawSteps.length; s++) {
            if (rawSteps[s].coordIdx < i) prevMainStep = rawSteps[s];
          }
          for (let s = rawSteps.length - 1; s >= 0; s--) {
            const idx = rawSteps[s].coordIdx;
            if (idx >= i && idx <= bestJ) {
              if (idx === bestJ && prevMainStep && !prevMainStep.isUnnamedRoad && rawSteps[s].rawRoadName === prevMainStep.rawRoadName) {
                prevMainStep.distanceM += rawSteps[s].distanceM;
              }
              rawSteps.splice(s, 1);
            } else if (idx > bestJ) {
              rawSteps[s].coordIdx -= cutCount;
            }
          }
          changed = true;
          break;
        }
      }
    }

    // 3. Gộp các bước liên tiếp đi thẳng trên cùng một tên đường
    const steps = [];
    for (const st of rawSteps) {
      const prev = steps[steps.length - 1];
      if (prev && !prev.isUnnamedRoad && prev.rawRoadName === st.rawRoadName && st.arrow !== '🏁' && st.arrow !== '↶') {
        prev.distanceM += st.distanceM;
      } else {
        steps.push(st);
      }
    }

    const cleanDistM = Math.max(200, (r.distance || 0) - totalRemovedM);
    const ratio = r.distance > 0 ? Math.max(0.2, cleanDistM / r.distance) : 1;

    return {
      coords,
      distanceKm: Number((cleanDistM / 1000).toFixed(1)),
      durationMin: Math.max(2, Math.round(((r.duration || 180) * ratio) / 60)),
      steps
    };
  },

  // Kiểm tra xem web đang chạy trên GitHub Pages / host tĩnh (không có server.js) hay có backend Node.js
  isStaticHost() {
    if (this._detectedStaticHost === true) return true;
    if (typeof location === 'undefined') return false;
    if (location.protocol === 'file:' || /\.github\.io$/i.test(location.hostname)) {
      this._detectedStaticHost = true;
      return true;
    }
    return false;
  },

  // Tìm kiếm địa điểm đa tầng: tự động dùng /api/search-places khi có server.js hoặc gọi trực tiếp Nominatim + Photon khi chạy trên GitHub Pages
  async searchPlacesUnified(q, city) {
    const cleanQ = (q || '').trim();
    if (!cleanQ) return [];

    if (!this.isStaticHost()) {
      try {
        const url = `/api/search-places?q=${encodeURIComponent(cleanQ)}&city=${encodeURIComponent(
          city.name
        )}&viewbox=${encodeURIComponent(city.viewbox || '')}`;
        const res = await this.fetchJsonWithTimeout(url, 7500);
        if (Array.isArray(res)) return res;
      } catch (e) {
        if (String(e.message || '').includes('404')) this._detectedStaticHost = true;
      }
    }

    // Fallback trực tiếp trên trình duyệt (dành cho GitHub Pages / Android APK tĩnh)
    const vbParts = (city.viewbox || '').split(',').map(Number);
    const hasVb = vbParts.length === 4 && vbParts.every((n) => !Number.isNaN(n));
    const centerLat = hasVb ? (vbParts[1] + vbParts[3]) / 2 : city.center[0];
    const centerLon = hasVb ? (vbParts[0] + vbParts[2]) / 2 : city.center[1];
    const inCity = (lat, lon) =>
      !hasVb ||
      (lon >= Math.min(vbParts[0], vbParts[2]) - 0.15 &&
        lon <= Math.max(vbParts[0], vbParts[2]) + 0.15 &&
        lat >= Math.min(vbParts[1], vbParts[3]) - 0.15 &&
        lat <= Math.max(vbParts[1], vbParts[3]) + 0.15);

    const hasCityName = this.normalizeViText(cleanQ).includes(this.normalizeViText(city.name));
    const fullQuery = hasCityName ? cleanQ : `${cleanQ}, ${city.name}`;
    const vbParam = hasVb ? `&viewbox=${encodeURIComponent(city.viewbox)}&bounded=0` : '';
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=vn&accept-language=vi${vbParam}&q=${encodeURIComponent(
      fullQuery
    )}`;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      fullQuery
    )}&lat=${centerLat}&lon=${centerLon}&limit=10`;

    const [nomRes, phoRes] = await Promise.allSettled([
      this.fetchJsonWithTimeout(nomUrl, 6500),
      this.fetchJsonWithTimeout(photonUrl, 5500)
    ]);

    const merged = [];
    const seen = new Set();
    const pushItem = (name, subtitle, lat, lng) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCity(lat, lng)) return;
      const key = `${lat.toFixed(3)}_${lng.toFixed(3)}_${this.normalizeViText(name)}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ name, subtitle, lat, lng });
    };

    if (nomRes.status === 'fulfilled' && Array.isArray(nomRes.value)) {
      for (const item of nomRes.value) {
        const parts = (item.display_name || '').split(',').map((s) => s.trim());
        const addr = item.address || {};
        const houseAndRoad = [addr.house_number, addr.road].filter(Boolean).join(' ');
        const shortName = houseAndRoad || item.name || parts.slice(0, 2).join(', ');
        const subtitle = parts.slice(1, 5).join(', ');
        pushItem(shortName, subtitle, parseFloat(item.lat), parseFloat(item.lon));
      }
    }

    if (phoRes.status === 'fulfilled' && phoRes.value && Array.isArray(phoRes.value.features)) {
      for (const f of phoRes.value.features) {
        const coords = f.geometry?.coordinates;
        const p = f.properties || {};
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const streetFull = [p.housenumber, p.street].filter(Boolean).join(' ');
        const mainName = p.name && streetFull && p.name !== p.street ? `${p.name} (${streetFull})` : p.name || streetFull || p.locality;
        if (!mainName) continue;
        const sub = [streetFull !== mainName ? streetFull : null, p.district || p.suburb || p.locality, p.city || city.name]
          .filter(Boolean)
          .join(', ');
        pushItem(mainName, sub, Number(coords[1]), Number(coords[0]));
      }
    }

    return merged.slice(0, 10);
  },

  // Tra ngược tọa độ ra tên đường: tự động dùng /api/reverse-geocode hoặc gọi trực tiếp Nominatim trên GitHub Pages
  async reverseGeocodeUnified(lat, lng) {
    if (!this.isStaticHost()) {
      try {
        const rev = await this.fetchJsonWithTimeout(`/api/reverse-geocode?lat=${lat}&lon=${lng}`, 4500);
        if (rev && (rev.shortName || rev.name)) return rev;
      } catch (e) {
        if (String(e.message || '').includes('404')) this._detectedStaticHost = true;
      }
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`;
      const data = await this.fetchJsonWithTimeout(url, 5000);
      if (data && data.display_name) {
        const parts = data.display_name.split(',').map((s) => s.trim());
        const addr = data.address || {};
        const roadPart = [addr.house_number, addr.road || addr.pedestrian || addr.suburb].filter(Boolean).join(' ');
        const shortName = roadPart || parts.slice(0, 2).join(', ');
        const district = addr.city_district || addr.district || addr.county || addr.suburb || '';
        return {
          name: parts.slice(0, 3).join(', '),
          shortName,
          district,
          fullName: data.display_name
        };
      }
    } catch (_) {}
    return null;
  },

  // fetch JSON có giới hạn thời gian chờ (tránh treo vô hạn khi mạng yếu / máy chủ quá tải)
  async fetchJsonWithTimeout(url, timeoutMs = 8000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  // Chạy danh sách tác vụ bất đồng bộ với số luồng song song giới hạn (tránh bị máy chủ OSRM chặn 429)
  async runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length).fill(null);
    let next = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (next < items.length) {
        const idx = next++;
        try {
          results[idx] = await worker(items[idx], idx);
        } catch (e) {
          results[idx] = null;
        }
      }
    });
    await Promise.all(runners);
    return results;
  },

  async fetchOsrmRoutes(coordsArray, allowAlternatives = true) {
    const coordStr = coordsArray.map((c) => `${Number(c[1]).toFixed(6)},${Number(c[0]).toFixed(6)}`).join(';');
    const altParam = allowAlternatives && coordsArray.length === 2 ? 'true' : 'false';

    // Bộ nhớ đệm phía trình duyệt (cùng truy vấn trong 5 phút sẽ không gọi lại mạng)
    if (!this._osrmClientCache) this._osrmClientCache = new Map();
    const cacheKey = `${coordStr}|${altParam}`;
    const cached = this._osrmClientCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      return cached.routes;
    }

    const query = `${coordStr}?overview=full&geometries=geojson&steps=true&alternatives=${altParam}`;
    const endpoints = [];
    // 1. Proxy của máy chủ Atlantis (có cache + tự chuyển máy chủ dự phòng) khi chạy qua server.js
    if (!this.isStaticHost() && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
      endpoints.push(`/api/osrm-route?coords=${encodeURIComponent(coordStr)}&alternatives=${altParam}`);
    }
    // 2. Gọi trực tiếp các máy chủ OSRM công cộng (dùng cho GitHub Pages / app Android / chạy offline không có server.js)
    endpoints.push(`https://router.project-osrm.org/route/v1/driving/${query}`);
    endpoints.push(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${query}`);

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const res = await this.fetchJsonWithTimeout(url, url.startsWith('/api/') ? 12000 : 8000);
        if (res && Array.isArray(res.routes) && res.routes.length > 0) {
          const routes = res.routes.map((r) => ({ ...this.parseSingleOsrmRouteObject(r), source: 'osrm' }));
          this._osrmClientCache.set(cacheKey, { at: Date.now(), routes });
          if (this._osrmClientCache.size > 200) {
            this._osrmClientCache.delete(this._osrmClientCache.keys().next().value);
          }
          return routes;
        }
        if (res && res.code && res.code !== 'Ok' && res.code !== 'Unavailable') {
          // NoRoute / InvalidQuery: các máy chủ khác cũng sẽ trả kết quả tương tự
          lastErr = new Error(`OSRM ${res.code}`);
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('OSRM failed');
  },

  _routeReqSeq: 0,

  // Tính khoảng cách ngắn nhất từ điểm P tới đoạn thẳng AB (tính bằng mét)
  minDistancePointToSegmentM(p, a, b) {
    const dLat = b[0] - a[0];
    const dLng = b[1] - a[1];
    const lenSq = dLat * dLat + dLng * dLng;
    if (lenSq === 0) return this.distanceMeters(p, a);
    let t = ((p[0] - a[0]) * dLat + (p[1] - a[1]) * dLng) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const proj = [a[0] + t * dLat, a[1] + t * dLng];
    return this.distanceMeters(p, proj);
  },

  // Đánh giá mức độ ngập của một lộ trình bất kỳ (kiểm tra cả các điểm lẫn đoạn thẳng nối giữa 2 điểm)
  evaluateRouteFloodRisk(coords, vehicle) {
    const city = this.getCurrentCity();
    let maxFloodCm = 0;
    let penaltyScore = 0;
    const hitHotspots = [];

    city.hotspots.forEach((h) => {
      const p = this.state.predictions[h.id];
      if (!p || p.predictedDepthCm <= 0) return;

      const radius = (p.activeRadiusM || 220) * 1.08;
      let minDistanceToHotspot = Infinity;
      let pointsInside = 0;

      for (let i = 0; i < coords.length; i++) {
        const d = this.distanceMeters(coords[i], [h.lat, h.lng]);
        if (d < minDistanceToHotspot) minDistanceToHotspot = d;
        if (d <= radius) {
          pointsInside++;
        }
        if (i < coords.length - 1) {
          const segDist = this.minDistancePointToSegmentM([h.lat, h.lng], coords[i], coords[i + 1]);
          if (segDist < minDistanceToHotspot) minDistanceToHotspot = segDist;
          if (segDist <= radius) {
            pointsInside++;
          }
        }
      }

      if (pointsInside > 0) {
        if (p.predictedDepthCm > maxFloodCm) {
          maxFloodCm = p.predictedDepthCm;
        }
        if (p.predictedDepthCm >= vehicle.safeDepthCm) {
          hitHotspots.push({ hotspot: h, depthCm: p.predictedDepthCm, minDistanceToHotspot });
          penaltyScore += p.predictedDepthCm * 1000000 + pointsInside * 10000;
        } else {
          penaltyScore += p.predictedDepthCm * 10;
        }
      }
    });

    return {
      maxFloodCm,
      penaltyScore,
      hitHotspots
    };
  },

  // Ngõ / ngách / hẻm / kiệt (đường nhỏ trong khu dân cư)
  isAlleyRoadName(rawName) {
    const name = String(rawName || '').toLowerCase().trim();
    return /^(ngõ|ngách|hẻm|kiệt|ng\.|h\.)\s/.test(name);
  },

  // Thống kê chất lượng hình học của một lộ trình: số mét đi trong ngõ/hẻm, có quay đầu hoặc đi vòng lặp hay không
  // (bỏ qua bán kính 350m quanh điểm đi/điểm đến vì bản thân địa chỉ có thể nằm trong ngõ)
  analyzeRouteQuality(route, from = null, to = null) {
    const stats = { alleyM: 0, hasUturn: false, hasLoop: false };
    if (!route) return stats;
    const steps = Array.isArray(route.steps) ? route.steps : [];
    const nearEndpoint = (pt) =>
      !!pt && ((from && this.distanceMeters(pt, from) < 350) || (to && this.distanceMeters(pt, to) < 350));

    steps.forEach((s, idx) => {
      if (idx === 0 || idx === steps.length - 1 || nearEndpoint(s.location)) return;
      if (this.isAlleyRoadName(s.rawRoadName)) stats.alleyM += Number(s.distanceM) || 0;
      if (s.arrow === '↶') stats.hasUturn = true;
    });

    // Đi lòng vòng theo HÌNH HỌC: tuyến đường rẽ vào ngõ/đường nhánh nhỏ rồi quay lại rất sát (≤ 22m) điểm cũ trên trục chính
    // (Nếu là đường đôi đại lộ quay đầu hợp pháp qua dải phân cách thì không tính là loop lỗi)
    const coords = Array.isArray(route.coords) ? route.coords : [];
    if (coords.length >= 6) {
      const CELL = 0.0004; // ~45m
      const grid = new Map();
      let cum = 0;
      outer: for (let i = 0; i < coords.length; i++) {
        if (i > 0) cum += this.distanceMeters(coords[i - 1], coords[i]);
        const pt = coords[i];
        if (nearEndpoint(pt)) continue;
        const cx = Math.floor(pt[0] / CELL);
        const cy = Math.floor(pt[1] / CELL);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = grid.get(`${cx + dx},${cy + dy}`);
            if (!bucket) continue;
            for (const prev of bucket) {
              const d = this.distanceMeters(prev.pt, pt);
              const loopLen = cum - prev.cum;
              // Chỉ coi là vòng lặp lỗi nếu quay lại rất sát điểm cũ (d <= 22m) và hướng đi sau đó cùng hướng với lúc vào (diff <= 55°)
              if (d <= 22 && loopLen >= 45 && loopLen <= 1200) {
                const prevIdx = Math.max(0, prev.idx - 2);
                const nextIdx = Math.min(coords.length - 1, i + 2);
                const bIn = this.computeBearingDeg(coords[prevIdx], coords[prev.idx]);
                const bOut = this.computeBearingDeg(coords[i], coords[nextIdx]);
                const diff = Math.abs(((bOut - bIn + 540) % 360) - 180);
                if (diff <= 55) {
                  stats.hasLoop = true;
                  break outer;
                }
              }
            }
          }
        }
        const key = `${cx},${cy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push({ pt, cum, idx: i });
      }
    }
    return stats;
  },

  // Quy đổi các yếu tố gây khó chịu thành "km phạt": đi xuyên ngõ giữa hành trình phạt nặng (+6km + 12x), vòng lặp +15km, quay đầu +2km
  routeComfortPenaltyKm(route, from = null, to = null) {
    const q = this.analyzeRouteQuality(route, from, to);
    const alleyPenalty = q.alleyM > 0 ? 6 + (q.alleyM / 1000) * 12 : 0;
    return alleyPenalty + (q.hasLoop ? 15 : 0) + (q.hasUturn ? 2 : 0);
  },

  // Phát hiện các lộ trình đi lòng vòng (Backtracking / Rẽ vào ngõ cụt rồi quay ra lại đúng đường cũ / đi xuyên ngõ)
  hasRedundantLoopOrAlley(route, from = null, to = null) {
    const q = this.analyzeRouteQuality(route, from, to);
    return q.alleyM > 0 || q.hasUturn || q.hasLoop;
  },

  openInNavigationApp(targetApp = 'google') {
    const from = this.state.routeQuery.fromCoords;
    const to = this.state.routeQuery.toCoords;
    if (!from || !to) {
      alert('Vui lòng chọn điểm đi và điểm đến trước khi mở chỉ đường.');
      return;
    }

    const cr = this.state.computedRoutes;
    let detourWp = null;

    // Nếu lộ trình đang phải vòng tránh ngập, tự động tìm 1 điểm mốc trung gian trên trục đại lộ an toàn
    // để ÉP Google Maps / Apple Maps phải dẫn đường đi vòng qua đó, không cho đi thẳng vào chỗ ngập!
    if (cr && cr.isRerouted && Array.isArray(cr.safeCoords) && cr.safeCoords.length >= 6) {
      const city = this.getCurrentCity();
      const floodHotspots = city.hotspots.filter((h) => {
        const p = this.state.predictions[h.id];
        return p && p.predictedDepthCm > 0;
      });

      // Tìm điểm trên nửa giữa lộ trình an toàn có khoảng cách xa nhất so với tâm điểm ngập
      let bestWp = null;
      let maxDistToFlood = -1;
      const startIdx = Math.floor(cr.safeCoords.length * 0.25);
      const endIdx = Math.floor(cr.safeCoords.length * 0.75);

      for (let i = startIdx; i <= endIdx; i++) {
        const pt = cr.safeCoords[i];
        let minDistToAnyFlood = Infinity;
        floodHotspots.forEach((h) => {
          const d = this.distanceMeters(pt, [h.lat, h.lng]);
          if (d < minDistToAnyFlood) minDistToAnyFlood = d;
        });
        if (minDistToAnyFlood > maxDistToFlood) {
          maxDistToFlood = minDistToAnyFlood;
          bestWp = pt;
        }
      }

      detourWp = bestWp || cr.safeCoords[Math.floor(cr.safeCoords.length * 0.5)];
    }

    if (targetApp === 'apple') {
      // Apple Maps (Dành cho iPhone, iPad, Mac - Dẫn đường giọng nói tiếng Việt miễn phí)
      const url = `https://maps.apple.com/?saddr=${from[0]},${from[1]}&daddr=${to[0]},${to[1]}&dirflg=d`;
      window.open(url, '_blank');
      return;
    }

    if (targetApp === 'vietmap') {
      // Vietmap Live (Bản đồ dẫn đường cảnh báo phạt nguội số 1 Việt Nam)
      const url = `https://vietmap.vn`;
      window.open(url, '_blank');
      return;
    }

    // Mặc định: Google Maps (Hoàn toàn miễn phí trên cả Android, iPhone và máy tính)
    const origin = `${from[0]},${from[1]}`;
    const destination = `${to[0]},${to[1]}`;
    let gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

    // Nếu có điểm vòng tránh ngập, chèn trực tiếp làm Waypoint vào Google Maps URL
    if (detourWp) {
      const wpParam = `${detourWp[0].toFixed(5)},${detourWp[1].toFixed(5)}`;
      gmapsUrl += `&waypoints=${encodeURIComponent(wpParam)}`;
    }

    window.open(gmapsUrl, '_blank');
  },

  openInGoogleMaps() {
    this.openInNavigationApp('google');
  },

  // Cấu hình Goong Maps API Key (Nền tảng bản đồ số Việt Nam - Đăng ký miễn phí tại https://goong.io)
  promptGoongApiKey() {
    const currentKey = localStorage.getItem('goong_api_key') || '';
    const newKey = prompt(
      '🇻🇳 Nhập Goong Maps API Key (Nền tảng bản đồ số tối ưu cho Việt Nam, đăng ký miễn phí tại goong.io không cần thẻ Visa/Mastercard):\n(Để trống nếu muốn dùng thuật toán Đại Lộ Tránh Ngập miễn phí)',
      currentKey
    );
    if (newKey !== null) {
      const trimmed = newKey.trim();
      if (trimmed) {
        localStorage.setItem('goong_api_key', trimmed);
        alert('✓ Đã lưu Goong Maps API Key! Atlantis sẽ ưu tiên định tuyến bằng bản đồ số Việt Nam Goong.');
      } else {
        localStorage.removeItem('goong_api_key');
        alert('✓ Đã xóa Goong Maps Key. Ứng dụng chuyển về thuật toán Đại lộ né ngập mặc định.');
      }
      if (this.state.screenMode === 'route_preview') {
        this.calculateAndRenderRoute(true);
      }
    }
  },

  // Cấu hình Google Maps API Key từ người dùng (lưu vào localStorage)
  promptGoogleApiKey() {
    const currentKey = localStorage.getItem('google_maps_api_key') || '';
    const newKey = prompt(
      'Nhập Google Maps API Key của bạn để sử dụng thuật toán tìm đường chính thức từ Google Maps:\n(Để trống nếu muốn sử dụng thuật toán né ngập OSRM theo các trục đại lộ lớn)',
      currentKey
    );
    if (newKey !== null) {
      const trimmed = newKey.trim();
      if (trimmed) {
        localStorage.setItem('google_maps_api_key', trimmed);
        alert('✓ Đã lưu Google Maps API Key thành công! Atlantis sẽ ưu tiên định tuyến bằng Google Maps Directions API.');
      } else {
        localStorage.removeItem('google_maps_api_key');
        alert('✓ Đã chuyển về thuật toán né ngập OSRM theo hệ thống đại lộ chính.');
      }
      if (this.state.screenMode === 'route_preview') {
        this.calculateAndRenderRoute(true);
      }
    }
  },

  // Gọi API Goong Maps Directions (Nền tảng bản đồ số Việt Nam)
  async fetchGoongRoutes(from, to, vehicleCatId) {
    const apiKey = localStorage.getItem('goong_api_key') || '';
    if (!apiKey) return null;

    const origin = `${from[0]},${from[1]}`;
    const destination = `${to[0]},${to[1]}`;
    const vehicle = vehicleCatId === 'car' ? 'car' : 'bike';
    const url = `/api/goong-directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&vehicle=${vehicle}&key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes;
      }
    } catch (e) {
      console.warn('Lỗi kết nối Goong Directions API:', e);
    }
    return null;
  },

  // Gọi API Google Maps Directions qua proxy máy chủ Atlantis (nếu đã cấu hình API Key)
  async fetchGoogleRoutes(from, to) {
    const apiKey = localStorage.getItem('google_maps_api_key') || '';
    if (!apiKey) return null;

    const origin = `${from[0]},${from[1]}`;
    const destination = `${to[0]},${to[1]}`;
    const url = `/api/google-directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${encodeURIComponent(apiKey)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes;
      }
    } catch (e) {
      console.warn('Lỗi kết nối Google Directions API:', e);
    }
    return null;
  },

  // Cấu hình GraphHopper API Key (Hỗ trợ cấm vùng ngập block_area)
  promptGraphhopperApiKey() {
    const currentKey = localStorage.getItem('graphhopper_api_key') || '';
    const newKey = prompt(
      '🦘 Nhập GraphHopper API Key (Hỗ trợ thuật toán cấm vùng ngập block_area tự động):\n(Để trống nếu muốn sử dụng thuật toán OSRM Đại Lộ Tránh Ngập miễn phí)',
      currentKey
    );
    if (newKey !== null) {
      const trimmed = newKey.trim();
      if (trimmed) {
        localStorage.setItem('graphhopper_api_key', trimmed);
        alert('✓ Đã lưu GraphHopper API Key thành công! Atlantis sẽ ưu tiên định tuyến bằng GraphHopper.');
      } else {
        localStorage.removeItem('graphhopper_api_key');
        alert('✓ Đã chuyển về thuật toán OSRM Đại lộ né ngập miễn phí.');
      }
      if (this.state.screenMode === 'route_preview') {
        this.calculateAndRenderRoute(true);
      }
    }
  },

  // Gọi API GraphHopper Directions với tham số block_area
  async fetchGraphhopperRoutes(from, to, vehicleCatId, blockAreaStr) {
    const apiKey = localStorage.getItem('graphhopper_api_key') || '';
    if (!apiKey) return null;

    const origin = `${from[0]},${from[1]}`;
    const destination = `${to[0]},${to[1]}`;
    const vehicle = vehicleCatId === 'motorbike' ? 'bike' : 'car';
    let url = `/api/graphhopper-directions?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&vehicle=${vehicle}&key=${encodeURIComponent(apiKey)}`;
    if (blockAreaStr) {
      url += `&block_area=${encodeURIComponent(blockAreaStr)}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes;
      }
    } catch (e) {
      console.warn('Lỗi kết nối GraphHopper API:', e);
    }
    return null;
  },

  async calculateAndRenderRoute(fitMap = false) {
    const reqId = ++this._routeReqSeq;
    const city = this.getCurrentCity();
    const vehicle = this.getCurrentVehicle();
    const from = this.state.routeQuery.fromCoords;
    const to = this.state.routeQuery.toCoords;

    // 0. Tạo danh sách các điểm ngập nguy hiểm (vượt quá ngưỡng an toàn của xe)
    const dangerousHotspots = city.hotspots.filter((h) => {
      const p = this.state.predictions[h.id];
      return p && p.predictedDepthCm >= vehicle.safeDepthCm;
    });
    const blockAreaStr = dangerousHotspots
      .map((h) => {
        const p = this.state.predictions[h.id];
        const r = Math.round((p.activeRadiusM || 220) * 1.25);
        return `${h.lat},${h.lng},${r}`;
      })
      .join(';');

    // 1. Thử lấy lộ trình từ GraphHopper trước (nếu có GraphHopper API Key - Tự động né vùng block_area)
    let ghRoutes = null;
    try {
      ghRoutes = await this.fetchGraphhopperRoutes(from, to, this.state.vehicleCatId, blockAreaStr);
    } catch (e) {}

    // 2. Thử lấy lộ trình từ Goong Maps trước (nếu có Goong API Key - Tối ưu cho Việt Nam)
    let goongRoutes = null;
    if (!ghRoutes) {
      try {
        goongRoutes = await this.fetchGoongRoutes(from, to, this.state.vehicleCatId);
      } catch (e) {}
    }

    // 3. Thử lấy lộ trình từ Google Directions API (nếu có Google API Key)
    let googleRoutes = null;
    if (!ghRoutes && !goongRoutes) {
      try {
        googleRoutes = await this.fetchGoogleRoutes(from, to);
      } catch (e) {}
    }

    let initialRoutes = [];
    if (ghRoutes && ghRoutes.length > 0) {
      initialRoutes = ghRoutes;
    } else if (goongRoutes && goongRoutes.length > 0) {
      initialRoutes = goongRoutes;
    } else if (googleRoutes && googleRoutes.length > 0) {
      initialRoutes = googleRoutes;
    } else {
      // 4. Mặc định: Dùng OSRM với alternatives=true để lấy các trục đường chính tự nhiên (Boulevards)
      try {
        initialRoutes = await this.fetchOsrmRoutes([from, to], true);
      } catch (e) {
        // Không kết nối được máy chủ dẫn đường: chỉ hiển thị đường chim bay và cảnh báo rõ ràng (không giả lập tuyến đường)
        const straightKm = this.distanceMeters(from, to) / 1000;
        initialRoutes = [
          {
            coords: [from, to],
            distanceKm: Number(straightKm.toFixed(1)),
            durationMin: Math.max(3, Math.round((straightKm * 1.4 * 60) / 25)),
            steps: [{ streetName: 'Hướng về điểm đến (chưa có dữ liệu đường)', rawRoadName: '', distanceM: Math.round(straightKm * 1000), arrow: '↑', location: from, coordIdx: 0 }],
            source: 'offline'
          }
        ];
        if (reqId === this._routeReqSeq && typeof this.showToast === 'function') {
          this.showToast('⚠️ Không kết nối được máy chủ dẫn đường. Đang hiển thị hướng chim bay, vui lòng thử lại sau.');
        }
      }
    }

    if (reqId !== this._routeReqSeq) return;

    const directData = initialRoutes[0];
    const directEval = this.evaluateRouteFloodRisk(directData.coords, vehicle);
    const maxFloodOnDirectCm = directEval.maxFloodCm;
    const needsReroute = directEval.hitHotspots.length > 0;

    let bestSafeData = directData;
    let bestSafeEval = directEval;

    if (needsReroute) {
      // ---------- Hàm hỗ trợ hình học: chuyển đổi tọa độ sang hệ mét cục bộ quanh điểm xuất phát ----------
      const cosLat0 = Math.cos((from[0] * Math.PI) / 180);
      const toXY = (p) => [(p[1] - from[1]) * 111320 * cosLat0, (p[0] - from[0]) * 110540];
      const toLatLng = (xy) => [from[0] + xy[1] / 110540, from[1] + xy[0] / (111320 * cosLat0)];
      const toXYto = toXY(to);
      const odLen = Math.hypot(toXYto[0], toXYto[1]) || 1;
      const dirUnit = [toXYto[0] / odLen, toXYto[1] / odLen];
      const perpUnit = [-dirUnit[1], dirUnit[0]]; // vuông góc bên trái hướng đi
      const projAlong = (p) => {
        const xy = toXY(p);
        return xy[0] * dirUnit[0] + xy[1] * dirUnit[1];
      };
      const radiusOf = (h) => ((this.state.predictions[h.id] || {}).activeRadiusM || 220) * 1.08;
      const isInsideDanger = (pt, margin = 1.25) =>
        dangerousHotspots.some((h) => this.distanceMeters(pt, [h.lat, h.lng]) <= radiusOf(h) * margin);
      // Điểm mốc nằm trên vòng tròn quanh điểm ngập theo góc bất kỳ (0° = hướng đi, 90° = bên trái)
      const ringPoint = (h, angleDeg, extraM) => {
        const c = toXY([h.lat, h.lng]);
        const r = radiusOf(h) + extraM;
        const a = (angleDeg * Math.PI) / 180;
        const ux = dirUnit[0] * Math.cos(a) + perpUnit[0] * Math.sin(a);
        const uy = dirUnit[1] * Math.cos(a) + perpUnit[1] * Math.sin(a);
        return toLatLng([c[0] + ux * r, c[1] + uy * r]);
      };

      const directDistM = this.distanceMeters(from, to);
      const waypointSets = []; // mỗi phần tử: { label, points, straightM, kind }
      const seenSetKeys = new Set();
      const addWaypointSet = (label, points, kind) => {
        if (!points.length || points.some((p) => !p || isInsideDanger(p))) return null;
        const pts = points.slice().sort((a, b) => projAlong(a) - projAlong(b)); // theo thứ tự dọc hướng đi, tránh quay ngược
        let total = 0;
        const seq = [from, ...pts, to];
        for (let i = 0; i < seq.length - 1; i++) total += this.distanceMeters(seq[i], seq[i + 1]);
        // Bỏ các điểm mốc khiến quãng đường chim bay vượt quá 2.3 lần đường thẳng
        if (total > Math.max(directDistM * 2.3, directDistM + 6000)) return null;
        const key = pts.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join('|');
        if (seenSetKeys.has(key)) return null;
        seenSetKeys.add(key);
        // Đường gấp khúc chim bay qua các điểm mốc có cắt ngang vùng ngập không? (nếu có thì ít triển vọng hơn)
        let crossings = 0;
        dangerousHotspots.forEach((h) => {
          for (let i = 0; i < seq.length - 1; i++) {
            if (this.minDistancePointToSegmentM([h.lat, h.lng], seq[i], seq[i + 1]) <= radiusOf(h) * 1.3) {
              crossings++;
              break;
            }
          }
        });
        const set = { label, points: pts, straightM: total, kind, crossings };
        waypointSets.push(set);
        return set;
      };

      // A. Điểm mốc động bao quanh các điểm ngập trên tuyến trực tiếp (hoạt động ở mọi khu vực, không cần dữ liệu cứng)
      const hitList = directEval.hitHotspots.map((x) => x.hotspot);
      // A1. Né cả loạt điểm ngập về cùng một phía (trái/phải)
      [1, -1].forEach((side) => {
        addWaypointSet(`side-${side}`, hitList.map((h) => ringPoint(h, 90 * side, 380)), 'dyn');
        addWaypointSet(`side-wide-${side}`, hitList.map((h) => ringPoint(h, 90 * side, 850)), 'dyn');
      });
      // A2. Vòng tròn 8 hướng quanh từng điểm ngập (kể cả hướng "lùi lại" khi điểm ngập nằm sát điểm đi/đến)
      hitList.forEach((h) => {
        [400, 900].forEach((extra) => {
          for (let ang = 0; ang < 360; ang += 45) {
            if (ang === 90 || ang === 270) continue; // đã có ở A1
            addWaypointSet(`ring-${h.id}-${ang}-${extra}`, [ringPoint(h, ang, extra)], 'dyn');
          }
        });
      });

      // B. Nút giao đại lộ lớn đã khảo sát (Arterial Bypass Nodes) – ưu tiên nút ít phải đi vòng nhưng cách xa vùng ngập
      (city.arterialBypassNodes || [])
        .filter((node) => !isInsideDanger(node.coords, 1.3))
        .forEach((node) => addWaypointSet(`node-${node.name}`, [node.coords], 'node'));

      // Sắp xếp: ưu tiên bộ điểm mốc mà đường chim bay không cắt vùng ngập, rồi tới quãng đường ngắn;
      // nút đại lộ được ưu tiên nhẹ (thường là đường lớn, ít ngõ)
      const priorityOf = (s) => s.straightM * (s.kind === 'node' ? 0.92 : 1) * (1 + 0.6 * s.crossings);
      waypointSets.sort((a, b) => priorityOf(a) - priorityOf(b));

      // ---------- Gọi OSRM cho các bộ điểm mốc (tối đa 3 luồng song song để tránh bị chặn 429) ----------
      const fetchSets = async (sets) => {
        const routes = await this.runWithConcurrency(sets, 3, (set) =>
          this.fetchOsrmRoutes([from, ...set.points, to], false).then((arr) => ({ ...arr[0], viaLabel: set.label }))
        );
        return routes.filter((r) => r && Array.isArray(r.coords) && r.coords.length >= 2);
      };

      let cleanCandidates = [];
      let partialCandidates = [];
      const evaluateCandidates = (routes) => {
        for (const cand of routes) {
          if (cand.distanceKm > Math.max(directData.distanceKm * 2.6, directData.distanceKm + 8)) continue;
          const ev = this.evaluateRouteFloodRisk(cand.coords, vehicle);
          // Tuyến đi vào ngõ / quay đầu / lòng vòng vẫn được giữ làm phương án dự phòng nhưng bị cộng "km phạt"
          const effectiveKm = cand.distanceKm + this.routeComfortPenaltyKm(cand, from, to);
          if (ev.hitHotspots.length === 0) {
            cleanCandidates.push({ data: cand, ev, cost: effectiveKm + ev.penaltyScore / 1000 });
          } else {
            partialCandidates.push({ data: cand, ev, cost: ev.penaltyScore + effectiveKm * 10 });
          }
        }
      };

      evaluateCandidates(initialRoutes.slice(1).map((r) => ({ ...r, viaLabel: 'osrm-alt' })));

      // Pha 1: 6 bộ điểm mốc triển vọng nhất. Pha 2 (chỉ khi chưa có tuyến sạch): thêm 8 bộ tiếp theo.
      const phases = [waypointSets.slice(0, 6), waypointSets.slice(6, 14)];
      for (const phaseSets of phases) {
        if (cleanCandidates.length > 0 || phaseSets.length === 0) break;
        evaluateCandidates(await fetchSets(phaseSets));
        if (reqId !== this._routeReqSeq) return;
      }

      // Pha 3: vẫn chưa có tuyến sạch -> lấy 2 tuyến ít ngập nhất, chèn thêm điểm mốc né các điểm ngập còn sót lại
      if (cleanCandidates.length === 0 && partialCandidates.length > 0) {
        partialCandidates.sort((a, b) => a.cost - b.cost);
        const round3Sets = [];
        partialCandidates.slice(0, 2).forEach((pc) => {
          const baseSet = waypointSets.find((s) => s.label === pc.data.viaLabel);
          const basePts = baseSet ? baseSet.points : [];
          const remaining = pc.ev.hitHotspots.map((x) => x.hotspot);
          [1, -1].forEach((side) => {
            const s = addWaypointSet(
              `r3-${pc.data.viaLabel}-${side}`,
              [...basePts, ...remaining.map((h) => ringPoint(h, 90 * side, 600))],
              'dyn'
            );
            if (s) round3Sets.push(s);
          });
        });
        if (round3Sets.length > 0) {
          evaluateCandidates(await fetchSets(round3Sets.slice(0, 4)));
          if (reqId !== this._routeReqSeq) return;
        }
      }

      if (window.__ATLANTIS_DEBUG_ROUTE) {
        console.log('[route-debug] sets', waypointSets.slice(0, 14).map((s) => `${s.label}:${Math.round(s.straightM)}m`));
        console.log('[route-debug] clean', cleanCandidates.map((c) => `${c.data.viaLabel}:${c.data.distanceKm}km cost=${c.cost.toFixed(2)}`));
        console.log('[route-debug] partial', partialCandidates.map((c) => `${c.data.viaLabel}:${c.data.distanceKm}km hits=${c.ev.hitHotspots.map((x) => x.hotspot.id)}`));
      }

      if (cleanCandidates.length > 0) {
        // Ưu tiên TUYỆT ĐỐI tuyến sạch ngập; trong nhóm sạch chọn tuyến có "quãng đường hiệu dụng" ngắn nhất
        cleanCandidates.sort((a, b) => a.cost - b.cost);
        bestSafeData = cleanCandidates[0].data;
        bestSafeEval = cleanCandidates[0].ev;
      } else if (partialCandidates.length > 0) {
        // Không còn đường nào sạch 100% (ví dụ điểm đi/đến nằm trong vùng ngập): chọn đường ít ngập nhất,
        // nhưng chỉ khi nó thực sự tốt hơn tuyến trực tiếp
        partialCandidates.sort((a, b) => a.cost - b.cost);
        const directCost = directEval.penaltyScore + directData.distanceKm * 10;
        if (partialCandidates[0].cost < directCost) {
          bestSafeData = partialCandidates[0].data;
          bestSafeEval = partialCandidates[0].ev;
        }
      }
    }

    const safeHitIds = new Set((bestSafeEval.hitHotspots || []).map((x) => x.hotspot.id));
    const trulyAvoidedHotspots = directEval.hitHotspots.filter((x) => !safeHitIds.has(x.hotspot.id));
    const actuallyRerouted = needsReroute && trulyAvoidedHotspots.length > 0 && bestSafeData !== directData;
    const avoidedNames = trulyAvoidedHotspots.map((x) => x.hotspot.name);

    this.state.computedRoutes = {
      directCoords: directData.coords,
      safeCoords: bestSafeData.coords,
      activeCoords: actuallyRerouted ? bestSafeData.coords : directData.coords,
      directDistanceKm: directData.distanceKm,
      safeDistanceKm: actuallyRerouted ? bestSafeData.distanceKm : directData.distanceKm,
      directDurationMin: directData.durationMin,
      safeDurationMin: actuallyRerouted ? bestSafeData.durationMin : directData.durationMin,
      isRerouted: actuallyRerouted,
      maxFloodOnDirectCm,
      maxFloodOnSafeCm: bestSafeEval.maxFloodCm,
      avoidedHotspotNames: avoidedNames,
      blockedCount: dangerousHotspots.length,
      directSteps: directData.steps || [],
      safeSteps: bestSafeData.steps || [],
      turnSteps: (actuallyRerouted ? bestSafeData.steps : directData.steps) || [],
      source: bestSafeData.source || directData.source || 'osrm'
    };

    this.updateRoutePreviewSummaryUI();
    this.renderVehicleCategoryAndSubtypes();
    this.renderMapLayers();

    if (fitMap && this.map && this.state.computedRoutes.activeCoords.length >= 2) {
      const allPts = actuallyRerouted
        ? [...this.state.computedRoutes.directCoords, ...this.state.computedRoutes.safeCoords]
        : this.state.computedRoutes.activeCoords;

      this.map.fitBounds(L.latLngBounds(allPts), {
        paddingTopLeft: [45, 175],
        paddingBottomRight: [45, 245]
      });
    }
  },

  updateRoutePreviewSummaryUI() {
    const cr = this.state.computedRoutes;
    const vehicle = this.getCurrentVehicle();
    const summaryEl = document.getElementById('route-preview-summary-line');
    const subEl = document.getElementById('route-preview-sub-line');

    const activeMin = cr.isRerouted ? cr.safeDurationMin : cr.directDurationMin;
    const activeKm = cr.isRerouted ? cr.safeDistanceKm : cr.directDistanceKm;
    let sourceBadge = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold border border-emerald-200">🛡️ Đại lộ tránh ngập</span>`;
    if (cr.source === 'offline') {
      sourceBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold border border-amber-300">📡 Mất kết nối dẫn đường</span>`;
    } else if (cr.source === 'graphhopper') {
      sourceBadge = `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold border border-amber-300">🦘 GraphHopper (Vùng cấm)</span>`;
    } else if (cr.source === 'goong_maps') {
      sourceBadge = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold border border-rose-200">🇻🇳 Goong Maps VN</span>`;
    } else if (cr.source === 'google_maps') {
      sourceBadge = `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-extrabold border border-blue-200">🗺️ Google Maps</span>`;
    }

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="text-xl font-black text-emerald-700">${activeMin} phút</span>
          <span class="text-base font-bold text-slate-600">(${activeKm} km)</span>
          ${sourceBadge}
        </div>
      `;
    }

    if (subEl) {
      if (cr.source === 'offline') {
        subEl.innerHTML = `<span class="text-amber-700 font-bold">⚠️ Chưa tải được bản đồ đường đi – đây chỉ là hướng chim bay. Hãy kiểm tra mạng và thử lại.</span>`;
      } else if (cr.isRerouted) {
        if (cr.maxFloodOnSafeCm >= vehicle.safeDepthCm) {
          subEl.innerHTML = `<span class="text-rose-700 font-bold">⚠️ Vẫn còn điểm ngập ${cr.maxFloodOnSafeCm}cm (Vượt ngưỡng an toàn ${vehicle.safeDepthCm}cm của ${vehicle.name})</span>`;
        } else {
          const avoidedList = cr.avoidedHotspotNames && cr.avoidedHotspotNames.length > 0
            ? cr.avoidedHotspotNames.slice(0, 2).join(' & ')
            : 'điểm ngập sâu';
          subEl.innerHTML = `<span class="text-emerald-700 font-bold">✓ Đã vòng tránh ${avoidedList}</span> • An toàn cho ${vehicle.name}`;
        }
      } else if (cr.source === 'graphhopper' && cr.blockedCount > 0 && cr.maxFloodOnDirectCm < vehicle.safeDepthCm) {
        subEl.innerHTML = `<span class="text-emerald-700 font-bold">✓ GraphHopper đã tự động cô lập & né ${cr.blockedCount} vùng ngập</span> • An toàn cho ${vehicle.name}`;
      } else if (cr.maxFloodOnDirectCm >= vehicle.safeDepthCm) {
        subEl.innerHTML = `<span class="text-rose-700 font-bold">⚠️ Cảnh báo ngập sâu ${cr.maxFloodOnDirectCm}cm (Vượt ngưỡng an toàn ${vehicle.safeDepthCm}cm của ${vehicle.name})</span>`;
      } else if (cr.maxFloodOnDirectCm > 0) {
        subEl.innerHTML = `<span class="text-sky-700 font-bold">✓ Đi thẳng qua vùng nước nông ${cr.maxFloodOnDirectCm}cm</span> (Trong ngưỡng an toàn ${vehicle.safeDepthCm}cm của ${vehicle.name})`;
      } else {
        subEl.innerHTML = `<span class="text-slate-600">Lộ trình ngắn nhất hiện khô ráo & an toàn cho ${vehicle.name}</span>`;
      }
    }
  },

  // Lấy mẫu lại tuyến đường thành các bước đều nhau (khoảng 12m/bước) để xe lướt mượt mà, không bị giật hay đứt quãng
  resamplePolyline(coords, stepMeters = 12) {
    if (!coords || coords.length < 2) return coords ? [...coords] : [];
    const resampled = [coords[0]];
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const segDist = this.distanceMeters(p1, p2);
      if (segDist <= 1) continue;

      const numSteps = Math.floor(segDist / stepMeters);
      for (let s = 1; s <= numSteps; s++) {
        const t = (s * stepMeters) / segDist;
        const lat = p1[0] + (p2[0] - p1[0]) * t;
        const lng = p1[1] + (p2[1] - p1[1]) * t;
        resampled.push([lat, lng]);
      }
      resampled.push(p2);
    }
    return resampled;
  },

  // ==================== CHỈ ĐƯỜNG TURN-BY-TURN (MÔ PHỎNG vs GPS THỰC TẾ) ====================
  // 1. Chế độ MÔ PHỎNG (Xe tự di chuyển đều đặn dọc theo lộ trình)
  startTurnByTurnSimulation() {
    this.state.navSession.mode = 'simulation';
    this.stopGPSNavigation();
    this.setScreenMode('turn_by_turn');
    this.updateNavModeUI('simulation');
    this.restartTurnByTurnFromStart();
  },

  // 2. Chế độ BẮT ĐẦU DẪN ĐƯỜNG CĂN CỨ VÀO GPS THỰC TẾ
  startTurnByTurnGPS() {
    this.state.navSession.mode = 'gps';
    this.stopTurnByTurnSimulation();
    this.stopGPSNavigation();
    this.setScreenMode('turn_by_turn');
    this.updateNavModeUI('gps');
    this.startGPSNavigationWatch();
  },

  // Hàm tương thích ngược
  startTurnByTurnNavigation() {
    this.startTurnByTurnGPS();
  },

  updateNavModeUI(mode) {
    const badge = document.getElementById('tbt-mode-badge');
    const simControls = document.getElementById('tbt-sim-controls');
    const gpsControls = document.getElementById('tbt-gps-controls');

    if (badge) {
      if (mode === 'gps') {
        badge.textContent = '🎯 GPS Thực tế';
        badge.className = 'px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-[9px] font-black uppercase border border-emerald-400/50 shadow-sm';
      } else {
        badge.textContent = '▶️ Mô phỏng';
        badge.className = 'px-2 py-0.5 rounded-full bg-sky-500/30 text-sky-200 text-[9px] font-black uppercase border border-sky-400/50 shadow-sm';
      }
    }

    if (simControls && gpsControls) {
      if (mode === 'gps') {
        simControls.classList.add('hidden');
        gpsControls.classList.remove('hidden');
      } else {
        simControls.classList.remove('hidden');
        gpsControls.classList.add('hidden');
      }
    }
  },

  // Điều khiển Tạm dừng / Tiếp tục mô phỏng
  toggleSimulationPause() {
    if (this.state.navSession.mode !== 'simulation') return;
    this.state.navSession.isPaused = !this.state.navSession.isPaused;
    const icon = document.getElementById('sim-playpause-icon');
    const text = document.getElementById('sim-playpause-text');
    if (icon) icon.textContent = this.state.navSession.isPaused ? '▶' : '⏸';
    if (text) text.textContent = this.state.navSession.isPaused ? 'Tiếp tục' : 'Tạm dừng';
    this.showToast(this.state.navSession.isPaused ? '⏸ Đã tạm dừng mô phỏng' : '▶ Tiếp tục mô phỏng', 1500);
  },

  // Đổi tốc độ mô phỏng: 1x -> 2x -> 4x -> 1x
  cycleSimulationSpeed() {
    if (this.state.navSession.mode !== 'simulation') return;
    const current = this.state.navSession.speedMultiplier || 1;
    const next = current === 1 ? 2 : current === 2 ? 4 : 1;
    this.state.navSession.speedMultiplier = next;
    const speedBtn = document.getElementById('btn-sim-speed');
    if (speedBtn) speedBtn.textContent = `⚡ ${next}x`;
    this.showToast(`⚡ Tốc độ mô phỏng: ${next}x`, 1500);

    // Cập nhật lại chu kỳ timer mượt mà
    if (this.state.navSession.timerId) {
      clearInterval(this.state.navSession.timerId);
      this.state.navSession.timerId = null;
      const tickMs = Math.max(80, Math.round(300 / next));
      this.state.navSession.timerId = setInterval(() => {
        this.advanceSimulationStep();
      }, tickMs);
    }
  },

  advanceSimulationStep() {
    if (this.state.navSession.isPaused) return;
    const coords = this.state.navSession.resampledCoords;
    if (!coords || coords.length === 0) return;

    if (this.state.navSession.currentCoordIdx >= coords.length - 1) {
      this.stopTurnByTurnSimulation();
      this.speakVietnamese('Mô phỏng hoàn tất. Bạn đã đến đích an toàn.');
      this.showToast('🎉 Mô phỏng hoàn tất: Đã đến đích!');
      const progEl = document.getElementById('tbt-progress-bar');
      if (progEl) progEl.style.width = '100%';
      const streetEl = document.getElementById('tbt-street-name');
      if (streetEl) streetEl.textContent = 'ĐÃ ĐẾN ĐÍCH AN TOÀN';
      return;
    }

    this.state.navSession.currentCoordIdx += 1;
    this.updateTurnByTurnStepAtIndex(this.state.navSession.currentCoordIdx);
  },

  handleTurnByTurnAction() {
    if (this.state.navSession.mode === 'gps') {
      this.recenterGPSNavigation();
    } else {
      this.restartTurnByTurnFromStart();
    }
  },

  exitTurnByTurnNavigation() {
    this.stopTurnByTurnSimulation();
    this.stopGPSNavigation();
    this.setScreenMode('route_preview');
  },

  restartTurnByTurnFromStart() {
    this.stopTurnByTurnSimulation();
    const cr = this.state.computedRoutes;
    if (!cr.activeCoords || cr.activeCoords.length < 2) return;

    // Resample lộ trình thành các điểm cách đều ~12m để chuyển động xe mượt như nước chảy
    const smoothCoords = this.resamplePolyline(cr.activeCoords, 12);
    this.state.navSession.resampledCoords = smoothCoords;
    this.state.navSession.currentCoordIdx = 0;
    this.state.navSession.isPaused = false;
    this.state.navSession.speedMultiplier = 1;
    this.state.navSession.pipShownForHotspotId = null;
    this.state.navSession.lastBearing = 0;
    this.state.navSession.lastSpokenTurnIdx = -1;

    // Ánh xạ từng bước rẽ (turnSteps) vào chỉ số tọa độ chính xác trên smoothCoords để đếm lùi
    if (Array.isArray(cr.turnSteps)) {
      cr.turnSteps.forEach((st) => {
        let bestIdx = smoothCoords.length - 1;
        let minDist = Infinity;
        for (let i = 0; i < smoothCoords.length; i++) {
          const d = this.distanceMeters(smoothCoords[i], st.location);
          if (d < minDist) {
            minDist = d;
            bestIdx = i;
          }
        }
        st.simStepIdx = bestIdx;
      });
    }

    const icon = document.getElementById('sim-playpause-icon');
    const text = document.getElementById('sim-playpause-text');
    if (icon) icon.textContent = '⏸';
    if (text) text.textContent = 'Tạm dừng';

    const speedBtn = document.getElementById('btn-sim-speed');
    if (speedBtn) speedBtn.textContent = '⚡ 1x';

    const progEl = document.getElementById('tbt-progress-bar');
    if (progEl) progEl.style.width = '0%';

    this.updateTurnByTurnStepAtIndex(0);
    const firstManeuver = cr.turnSteps[1]?.streetName || cr.turnSteps[0]?.streetName || 'Đi thẳng theo vạch màu xanh';
    this.speakVietnamese(
      `Bắt đầu mô phỏng lộ trình an toàn cho ${this.getCurrentVehicle().name}. ${firstManeuver}.`
    );

    const tickMs = Math.max(80, Math.round(300 / (this.state.navSession.speedMultiplier || 1)));
    this.state.navSession.timerId = setInterval(() => {
      this.advanceSimulationStep();
    }, tickMs);
  },

  stopTurnByTurnSimulation() {
    if (this.state.navSession.timerId) {
      clearInterval(this.state.navSession.timerId);
      this.state.navSession.timerId = null;
    }
    if (this.state.navSession.mode === 'simulation' && this.navCarMarker && this.map) {
      this.map.removeLayer(this.navCarMarker);
      this.navCarMarker = null;
    }
    document.getElementById('turn-pip-camera-box')?.classList.add('hidden');
  },

  // ==================== XỬ LÝ DẪN ĐƯỜNG THEO GPS THỰC TẾ ====================
  startGPSNavigationWatch() {
    if (!('geolocation' in navigator)) {
      this.showToast('⚠️ Thiết bị không hỗ trợ Geolocation, chuyển sang Mô phỏng.');
      this.startTurnByTurnSimulation();
      return;
    }

    const cr = this.state.computedRoutes;
    if (cr.activeCoords && cr.activeCoords.length > 0) {
      this.updateTurnByTurnStepAtIndex(0);
    }

    this.speakVietnamese(
      `Bắt đầu dẫn đường theo GPS thực tế cho ${this.getCurrentVehicle().name}. Đang kết nối định vị vệ tinh...`
    );
    this.showToast('📡 Đang kết nối định vị GPS vệ tinh...', 3500);

    this.state.navSession.lastSpokenTurnIdx = -1;
    this.state.navSession.lastRerouteTs = 0;

    this.state.navSession.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleGPSNavigationUpdate(pos),
      (err) => this.handleGPSNavigationError(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1500
      }
    );
  },

  stopGPSNavigation() {
    if (this.state.navSession.watchId) {
      navigator.geolocation.clearWatch(this.state.navSession.watchId);
      this.state.navSession.watchId = null;
    }
    if (this.state.navSession.mode === 'gps' && this.navCarMarker && this.map) {
      this.map.removeLayer(this.navCarMarker);
      this.navCarMarker = null;
    }
    document.getElementById('turn-pip-camera-box')?.classList.add('hidden');
  },

  // Thuật toán xác định ngã rẽ tiếp theo phía trước và tính khoảng cách ĐẾM XUỐNG dọc theo tuyến đường
  getUpcomingManeuverAndDistance(coords, currIdx, isSim, pt) {
    const cr = this.state.computedRoutes;
    const steps = cr.turnSteps;
    if (!steps || steps.length === 0) {
      return {
        step: {
          arrow: '↑',
          streetName: 'Đi thẳng theo lộ trình an toàn',
          location: coords[coords.length - 1]
        },
        stepIdx: 0,
        distanceM: 0
      };
    }

    // Tìm bước rẽ tiếp theo phía trước xe (bước s >= 1 có vị trí vượt trước vị trí hiện tại của xe)
    let upcomingStep = null;
    let upcomingStepIdx = steps.length - 1;
    let targetIdx = coords.length - 1;

    for (let s = 1; s < steps.length; s++) {
      const st = steps[s];
      const stepIdxOnRoute = isSim ? (st.simStepIdx ?? st.coordIdx ?? 0) : (st.coordIdx ?? 0);
      // Nếu bước rẽ này ở phía trước xe ít nhất 1-2 điểm
      if (stepIdxOnRoute > currIdx + 1) {
        upcomingStep = st;
        upcomingStepIdx = s;
        targetIdx = stepIdxOnRoute;
        break;
      }
    }

    // Nếu đã qua hết các bước rẽ trung gian, hướng dẫn tiếp theo là điểm đến
    if (!upcomingStep) {
      upcomingStep = steps[steps.length - 1];
      upcomingStepIdx = steps.length - 1;
      targetIdx = coords.length - 1;
    }

    // Tính khoảng cách ĐẾM XUỐNG dọc theo tuyến đường từ vị trí xe hiện tại tới vị trí rẽ
    let distM = 0;
    if (targetIdx > currIdx) {
      for (let k = currIdx; k < targetIdx; k++) {
        distM += this.distanceMeters(coords[k], coords[k + 1]);
      }
    } else {
      distM = Math.round(this.distanceMeters(pt, upcomingStep.location || coords[coords.length - 1]));
    }

    return {
      step: upcomingStep,
      stepIdx: upcomingStepIdx,
      distanceM: Math.max(0, Math.round(distM))
    };
  },

  handleGPSNavigationUpdate(pos) {
    if (this.state.navSession.mode !== 'gps') return;

    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy || 15;
    const heading = pos.coords.heading;
    const speed = pos.coords.speed;
    this.state.currentGPS = { lat, lng, heading, speed, accuracy };

    const cr = this.state.computedRoutes;
    const coords = cr.activeCoords;
    if (!coords || coords.length < 2) return;

    // 1. Tìm điểm trên lộ trình gần vị trí GPS hiện tại nhất
    let minI = 0;
    let minDist = 999999;
    for (let i = 0; i < coords.length; i++) {
      const d = this.distanceMeters([lat, lng], coords[i]);
      if (d < minDist) {
        minDist = d;
        minI = i;
      }
    }
    this.state.navSession.currentCoordIdx = minI;

    // 2. Tự động tính lại đường nếu đi chệch lộ trình quá 75m
    if (minDist > 75) {
      const now = Date.now();
      if (!this.state.navSession.lastRerouteTs || now - this.state.navSession.lastRerouteTs > 15000) {
        this.state.navSession.lastRerouteTs = now;
        this.speakVietnamese('Bạn đã đi chệch lộ trình, đang tự động tìm đường tránh ngập mới từ vị trí của bạn...');
        this.showToast('🔄 Bạn đã chệch lộ trình! Đang tự động tìm đường mới...');
        this.state.routeFromCoords = [lat, lng];
        this.state.routeFromName = 'Vị trí GPS của bạn';
        this.recalculateAll(false, false);
        return;
      }
    }

    // 3. Tính góc xoay đầu xe
    let bearing = 0;
    if (typeof heading === 'number' && !isNaN(heading) && heading >= 0) {
      bearing = heading;
    } else {
      const nextPt = coords[Math.min(coords.length - 1, minI + 1)];
      bearing = this.computeBearingDeg([lat, lng], nextPt);
    }

    // 4. Hiển thị Puck xe Turn-by-Turn GPS
    const puckHtml = `<div style="width:34px;height:34px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 3px 14px rgba(37,99,235,0.75);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:900;transform:rotate(${Math.round(
      bearing
    )}deg);">▲</div>`;

    if (!this.navCarMarker) {
      this.navCarMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: 'nav-puck', html: puckHtml, iconSize: [34, 34], iconAnchor: [17, 17] })
      }).addTo(this.map);
    } else {
      this.navCarMarker.setLatLng([lat, lng]);
      this.navCarMarker.setIcon(
        L.divIcon({ className: 'nav-puck', html: puckHtml, iconSize: [34, 34], iconAnchor: [17, 17] })
      );
    }

    this.map.panTo([lat, lng], { animate: true, duration: 0.5 });

    // 5. Cập nhật bước chỉ dẫn rẽ tiếp theo & khoảng cách ĐẾM XUỐNG
    const maneuverInfo = this.getUpcomingManeuverAndDistance(coords, minI, false, [lat, lng]);
    const upcomingStep = maneuverInfo.step;
    const realDistToTurnM = maneuverInfo.distanceM;

    const arrowEl = document.getElementById('tbt-arrow');
    const distEl = document.getElementById('tbt-distance');
    const streetEl = document.getElementById('tbt-street-name');
    if (arrowEl) arrowEl.textContent = upcomingStep.arrow || '↑';
    if (distEl) {
      distEl.textContent = realDistToTurnM >= 1000 ? `${(realDistToTurnM / 1000).toFixed(1)} km` : `${realDistToTurnM} m`;
    }
    if (streetEl) streetEl.textContent = upcomingStep.streetName;

    // Phát âm thanh giọng nói trước khi rẽ
    if (realDistToTurnM <= 60 && realDistToTurnM > 10 && this.state.navSession.lastSpokenTurnIdx !== maneuverInfo.stepIdx) {
      this.state.navSession.lastSpokenTurnIdx = maneuverInfo.stepIdx;
      this.speakVietnamese(`Trong ${realDistToTurnM} mét nữa, ${upcomingStep.streetName}`);
    }

    // 6. Tính thời gian & khoảng cách còn lại (ĐẾM XUỐNG)
    let remMeters = 0;
    for (let j = minI; j < coords.length - 1; j++) {
      remMeters += this.distanceMeters(coords[j], coords[j + 1]);
    }
    const remKm = Math.max(0, (remMeters / 1000).toFixed(1));
    const speedKmH = speed && speed > 1 ? speed * 3.6 : 28;
    const remMin = Math.max(1, Math.round((remMeters / 1000 / speedKmH) * 60));

    const remainTimeEl = document.getElementById('tbt-remain-time');
    const remainKmEl = document.getElementById('tbt-remain-km');
    if (remainTimeEl) remainTimeEl.textContent = `${remMin} phút`;
    if (remainKmEl) remainKmEl.textContent = `(${remKm} km)`;

    // 7. Cảnh báo camera / trạm giám sát ngập lụt phía trước (< 650m)
    const city = this.getCurrentCity();
    for (const h of city.hotspots) {
      const dist = this.distanceMeters([lat, lng], [h.lat, h.lng]);
      if (dist <= 650 && this.state.navSession.pipShownForHotspotId !== h.id) {
        this.state.navSession.pipShownForHotspotId = h.id;
        this.showTurnByTurnPiPCamera(h, Math.round(dist));
        break;
      }
    }

    // 8. Kiểm tra đã đến đích chưa (< 35m)
    const dest = coords[coords.length - 1];
    if (this.distanceMeters([lat, lng], dest) <= 35) {
      this.stopGPSNavigation();
      this.speakVietnamese('Bạn đã đến nơi an toàn. Chúc bạn có một ngày thuận lợi.');
      this.showToast('🎉 Bạn đã đến đích an toàn!');
      if (streetEl) streetEl.textContent = 'ĐÃ ĐẾN ĐÍCH AN TOÀN';
    }
  },

  handleGPSNavigationError(err) {
    console.warn('GPS Navigation Error:', err);
    if (!this.state.currentGPS) {
      this.showToast('⚠️ Chưa nhận được tọa độ GPS vệ tinh. Bạn có thể dùng chế độ Mô phỏng.');
    } else {
      this.showToast('⚠️ Tín hiệu GPS yếu, đang tiếp tục kết nối...');
    }
  },

  recenterGPSNavigation() {
    if (this.state.currentGPS) {
      this.map.flyTo([this.state.currentGPS.lat, this.state.currentGPS.lng], 17, { duration: 0.5 });
      this.showToast('🎯 Đã căn giữa bản đồ theo vị trí GPS của bạn');
    } else {
      this.locateUserGPS(false);
    }
  },

  updateTurnByTurnStepAtIndex(idx) {
    const cr = this.state.computedRoutes;
    const isSim = this.state.navSession.mode === 'simulation';
    const coords = isSim && this.state.navSession.resampledCoords?.length
      ? this.state.navSession.resampledCoords
      : cr.activeCoords;

    if (!coords || !coords[idx] || !this.map) return;
    const pt = coords[idx];

    // Tính góc xoay đầu xe mượt mà: nhìn trước 2 điểm (~24m) để góc quay không bị giật 0 độ
    const targetIdx = Math.min(coords.length - 1, idx + 2);
    const targetPt = coords[targetIdx];
    const distToTarget = this.distanceMeters(pt, targetPt);
    let bearing = this.state.navSession.lastBearing || 0;
    if (distToTarget > 2.5) {
      bearing = this.computeBearingDeg(pt, targetPt);
      this.state.navSession.lastBearing = bearing;
    }

    const puckHtml = `<div class="nav-puck-sim" style="width:32px;height:32px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 3px 14px rgba(37,99,235,0.75);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:900;transform:rotate(${Math.round(
      bearing
    )}deg);">▲</div>`;

    if (!this.navCarMarker) {
      this.navCarMarker = L.marker(pt, {
        icon: L.divIcon({
          className: 'nav-puck',
          html: puckHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(this.map);
    } else {
      this.navCarMarker.setLatLng(pt);
      this.navCarMarker.setIcon(
        L.divIcon({
          className: 'nav-puck',
          html: puckHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      );
    }

    // Camera di chuyển êm dịu theo vị trí xe
    this.map.panTo(pt, { animate: true, duration: 0.28, easeLinearity: 0.5 });

    // Cập nhật thanh tiến trình %
    const totalSteps = Math.max(1, coords.length - 1);
    const progressPct = Math.min(100, Math.round((idx / totalSteps) * 100));
    const progEl = document.getElementById('tbt-progress-bar');
    if (progEl) progEl.style.width = `${progressPct}%`;

    // Cập nhật bước chuyển hướng tiếp theo & khoảng cách ĐẾM XUỐNG
    const maneuverInfo = this.getUpcomingManeuverAndDistance(coords, idx, isSim, pt);
    const upcomingStep = maneuverInfo.step;
    const realDistToTurnM = maneuverInfo.distanceM;

    const arrowEl = document.getElementById('tbt-arrow');
    const distEl = document.getElementById('tbt-distance');
    const streetEl = document.getElementById('tbt-street-name');
    if (arrowEl) arrowEl.textContent = upcomingStep.arrow || '↑';
    if (distEl) {
      distEl.textContent =
        realDistToTurnM >= 1000
          ? `${(realDistToTurnM / 1000).toFixed(1)} km`
          : `${realDistToTurnM} m`;
    }
    if (streetEl) streetEl.textContent = upcomingStep.streetName;

    // Phát âm thanh giọng nói khi cách khúc rẽ <= 60m
    if (realDistToTurnM <= 60 && realDistToTurnM > 10 && this.state.navSession.lastSpokenTurnIdx !== maneuverInfo.stepIdx) {
      this.state.navSession.lastSpokenTurnIdx = maneuverInfo.stepIdx;
      this.speakVietnamese(`Trong ${realDistToTurnM} mét nữa, ${upcomingStep.streetName}`);
    }

    // Khoảng cách & thời gian còn lại tới đích (ĐẾM XUỐNG ĐẾN ĐÍCH)
    let totalRemMeters = 0;
    for (let j = idx; j < coords.length - 1; j++) {
      totalRemMeters += this.distanceMeters(coords[j], coords[j + 1]);
    }
    const remKm = Math.max(0, (totalRemMeters / 1000).toFixed(1));
    const speedKmH = 28;
    const remMin = Math.max(1, Math.round((totalRemMeters / 1000 / speedKmH) * 60));

    const remainTimeEl = document.getElementById('tbt-remain-time');
    const remainKmEl = document.getElementById('tbt-remain-km');
    if (remainTimeEl) remainTimeEl.textContent = `${remMin} phút`;
    if (remainKmEl) remainKmEl.textContent = `(${remKm} km)`;

    // Camera PiP tự động bật khi cách điểm ngập <= 650m và tự động ẩn khi đã vượt qua xa
    const city = this.getCurrentCity();
    let nearHotspot = null;
    for (const h of city.hotspots) {
      const dist = this.distanceMeters(pt, [h.lat, h.lng]);
      if (dist <= 650) {
        nearHotspot = { hotspot: h, dist: Math.round(dist) };
        break;
      }
    }

    if (nearHotspot) {
      if (this.state.navSession.pipShownForHotspotId !== nearHotspot.hotspot.id) {
        this.state.navSession.pipShownForHotspotId = nearHotspot.hotspot.id;
        this.showTurnByTurnPiPCamera(nearHotspot.hotspot, nearHotspot.dist);
      }
    } else if (this.state.navSession.pipShownForHotspotId) {
      this.state.navSession.pipShownForHotspotId = null;
      document.getElementById('turn-pip-camera-box')?.classList.add('hidden');
    }
  },

  showTurnByTurnPiPCamera(hotspot, distMeters) {
    const pipBox = document.getElementById('turn-pip-camera-box');
    const pipTitle = document.getElementById('turn-pip-title');
    const pipBody = document.getElementById('turn-pip-body');
    const pred = this.state.predictions[hotspot.id];
    if (!pipBox || !pipTitle || !pipBody) return;

    pipBox.classList.remove('hidden');
    pipTitle.textContent = `📹 Cách ${distMeters}m: ${hotspot.name}`;

    const isHanoi = hotspot.liveFeedType === 'hanoi_hsdc' || this.state.cityId === 'hanoi';

    if (isHanoi) {
      pipBody.innerHTML = `
        <div class="rounded-xl overflow-hidden border border-cyan-400/40 bg-white p-1 mb-1">
          <div class="text-[9px] font-bold text-slate-700 truncate">🌧️ ${hotspot.rainStationName || 'Trạm quan trắc HSDC'}</div>
          <img
            src="https://thoatnuochanoi.vn/rain/images/${hotspot.rainStationId || '55'}.png?t=${Date.now()}"
            alt="Đo mưa Hà Nội"
            class="w-full h-20 object-contain bg-white rounded"
          />
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-slate-200">Mực nước: <b style="color:${pred ? pred.colorHex : '#10b981'}">${
        pred ? pred.predictedDepthCm : 0
      } cm</b></span>
          <button onclick="window.AtlantisApp.openCameraModal('${hotspot.id}')" class="text-cyan-300 font-bold underline">Xem chi tiết</button>
        </div>
      `;
    } else {
      const liveImgSrc = `/api/hcmc-cam?id=${hotspot.hcmcCamId || '587470c2b807da0011e33ce4'}&t=${Date.now()}`;
      pipBody.innerHTML = `
        <img
          src="${liveImgSrc}"
          alt="${hotspot.cameraTitle}"
          class="w-full h-28 object-cover rounded-xl bg-slate-900 border border-white/15 mb-1"
        />
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-slate-200">Mực nước: <b style="color:${pred ? pred.colorHex : '#10b981'}">${
        pred ? pred.predictedDepthCm : 0
      } cm</b></span>
          <button onclick="window.AtlantisApp.openCameraModal('${hotspot.id}')" class="text-cyan-300 font-bold underline">Phóng to</button>
        </div>
      `;
    }
  },

  async triggerSuddenFloodAheadDemo() {
    this.state.isRealDataMode = false;
    this.state.rainMmPerHour = 95;
    this.state.rainDurationMin = 55;
    this.state.riverLevelM = this.getCurrentCity().riverStation.warningLevelM + 0.3;
    this.syncDemoSliders();

    const bubbleBadge = document.getElementById('demo-bubble-label');
    if (bubbleBadge) bubbleBadge.textContent = 'DEMO';

    await this.recalculateAll(false, true);

    const banner = document.getElementById('tbt-top-banner');
    const streetEl = document.getElementById('tbt-street-name');
    if (banner) banner.classList.add('rerouting-alert');
    if (streetEl) {
      streetEl.textContent = `⚠️ PHÁT HIỆN NGẬP SÂU ${this.state.computedRoutes.maxFloodOnDirectCm || 34}CM PHÍA TRƯỚC! ĐÃ ĐỔI LỘ TRÌNH VÒNG TRÁNH...`;
    }
    this.speakVietnamese(
      'Cảnh báo khẩn cấp! Phát hiện điểm ngập sâu phía trước 300 mét. Đã tự động bẻ lái sang đường vòng cao ráo.'
    );
    this.restartTurnByTurnFromStart();
    setTimeout(() => {
      if (banner) banner.classList.remove('rerouting-alert');
    }, 4500);
  },

  renderMapLayers() {
    if (!this.map) return;
    const city = this.getCurrentCity();
    const preds = this.state.predictions;
    const cr = this.state.computedRoutes;

    [...this.hotspotLayers, ...this.poiLayers, ...this.routeLayers].forEach((l) =>
      this.map.removeLayer(l)
    );
    this.hotspotLayers = [];
    this.poiLayers = [];
    this.routeLayers = [];

    // 1. Vẽ các Điểm giám sát ngập theo 3 vành đai bán kính tròn (Đỏ - Vàng - Xanh lá)
    city.hotspots.forEach((h) => {
      const p = preds[h.id];
      if (!p) return;

      const centerLatLng = [h.lat, h.lng];
      const baseR = p.activeRadiusM || 220;

      if (p.predictedDepthCm > 0) {
        const outerGreen = L.circle(centerLatLng, {
          radius: baseR,
          color: '#10B981',
          weight: 1.5,
          dashArray: '4, 6',
          fillColor: '#10B981',
          fillOpacity: 0.14
        }).addTo(this.map);

        const midYellow = L.circle(centerLatLng, {
          radius: Math.round(baseR * 0.65),
          color: '#F59E0B',
          weight: 1.5,
          fillColor: '#F59E0B',
          fillOpacity: 0.24
        }).addTo(this.map);

        const innerRed = L.circle(centerLatLng, {
          radius: Math.round(baseR * 0.35),
          color: '#EF4444',
          weight: 2,
          fillColor: '#EF4444',
          fillOpacity: 0.45
        }).addTo(this.map);

        [outerGreen, midYellow, innerRed].forEach((c) => {
          c.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this.openFloodHotspotCard(h.id);
          });
        });

        this.hotspotLayers.push(outerGreen, midYellow, innerRed);
      } else {
        const dryCircle = L.circle(centerLatLng, {
          radius: 130,
          color: '#0284c7',
          weight: 1.5,
          dashArray: '4, 4',
          fillColor: '#38bdf8',
          fillOpacity: 0.08
        })
          .addTo(this.map)
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this.openFloodHotspotCard(h.id);
          });
        this.hotspotLayers.push(dryCircle);
      }

      const badgeHtml =
        p.predictedDepthCm > 0
          ? `<div style="background:#0f172a;border:2px solid ${p.colorHex};border-radius:999px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">
              <span style="font-size:11px;font-weight:900;color:${p.colorHex};">💧 ${p.predictedDepthCm}cm</span>
              <span style="font-size:9px;color:#e2e8f0;font-weight:700;">📹 Cam</span>
            </div>`
          : `<div style="background:#ffffff;border:1.5px solid #0284c7;border-radius:999px;padding:2px 8px;display:inline-flex;align-items:center;gap:3px;box-shadow:0 2px 6px rgba(0,0,0,0.15);white-space:nowrap;">
              <span style="font-size:10px;font-weight:800;color:#0369a1;">📹 0cm (Khô ráo)</span>
            </div>`;

      const marker = L.marker(centerLatLng, {
        icon: L.divIcon({
          className: 'hotspot-center-pill',
          html: badgeHtml,
          iconSize: [104, 26],
          iconAnchor: [52, 13]
        })
      })
        .addTo(this.map)
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.openFloodHotspotCard(h.id);
        });

      this.hotspotLayers.push(marker);
    });

    // 2. Vẽ Lộ trình khi ở màn hình Route Preview hoặc Turn-by-Turn
    if (this.state.screenMode === 'route_preview' || this.state.screenMode === 'turn_by_turn') {
      if (cr.directCoords.length >= 2 && cr.isRerouted && this.state.screenMode === 'route_preview') {
        const blockedLine = L.polyline(cr.directCoords, {
          color: '#dc2626',
          weight: 5,
          opacity: 0.78,
          dashArray: '8, 8'
        }).addTo(this.map);

        const midBlocked = cr.directCoords[Math.floor(cr.directCoords.length / 2)];
        const blockedCallout = L.marker(midBlocked, {
          icon: L.divIcon({
            className: 'eta-callout-wrap',
            html: `<div class="route-eta-callout danger-eta">⛔ Ngập ${cr.maxFloodOnDirectCm}cm</div>`,
            iconSize: [104, 26],
            iconAnchor: [52, 13]
          })
        }).addTo(this.map);

        this.routeLayers.push(blockedLine, blockedCallout);
      }

      if (cr.activeCoords.length >= 2) {
        const routeOutline = L.polyline(cr.activeCoords, {
          color: '#1d4ed8',
          weight: 8,
          opacity: 0.9
        }).addTo(this.map);

        const routeMain = L.polyline(cr.activeCoords, {
          color: '#3b82f6',
          weight: 5,
          opacity: 1
        }).addTo(this.map);

        const midSafe = cr.activeCoords[Math.floor(cr.activeCoords.length * 0.45)];
        const activeMin = cr.isRerouted ? cr.safeDurationMin : cr.directDurationMin;
        const etaMarker = L.marker(midSafe, {
          icon: L.divIcon({
            className: 'eta-callout-wrap',
            html: `<div class="route-eta-callout">🕐 ${activeMin} phút</div>`,
            iconSize: [82, 26],
            iconAnchor: [41, 13]
          })
        }).addTo(this.map);

        const startDot = L.circleMarker(this.state.routeQuery.fromCoords, {
          radius: 7,
          fillColor: '#2563eb',
          color: '#ffffff',
          weight: 3,
          fillOpacity: 1
        })
          .bindTooltip(`Điểm đi: ${this.state.routeQuery.fromName}`)
          .addTo(this.map);

        const endDot = L.circleMarker(this.state.routeQuery.toCoords, {
          radius: 8,
          fillColor: '#dc2626',
          color: '#ffffff',
          weight: 3,
          fillOpacity: 1
        })
          .bindTooltip(`Điểm đến: ${this.state.routeQuery.toName}`)
          .addTo(this.map);

        this.routeLayers.push(routeOutline, routeMain, etaMarker, startDot, endDot);
      }
    }

    // 3. Vẽ Bãi đỗ xe cao ráo & Gara cứu hộ
    city.safeZones.forEach((z) => {
      const isParking = z.type === 'parking';
      const m = L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          className: 'poi-pin',
          html: `<div style="background:#ffffff;border:2px solid #059669;border-radius:9px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.2);font-size:13px;">${
            isParking ? '🅿️' : '🛠️'
          }</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      })
        .bindPopup(`<b>${z.name}</b><br/>${z.elevationText}<br/>📞 SĐT: ${z.phone}`)
        .addTo(this.map);
      this.poiLayers.push(m);
    });
  },

  openFloodHotspotCard(hotspotId) {
    this.state.selectedHotspotId = hotspotId;
    const city = this.getCurrentCity();
    const vehicle = this.getCurrentVehicle();
    const h = city.hotspots.find((x) => x.id === hotspotId) || city.hotspots[0];
    const p = this.state.predictions[h.id];
    if (!h || !p) return;

    if (this.map) {
      this.map.panTo([h.lat, h.lng], { animate: true });
    }

    const card = document.getElementById('flood-hotspot-card');
    const body = document.getElementById('flood-hotspot-card-body');
    if (!card || !body) return;

    const hazardsHtml =
      h.hazards && h.hazards.length > 0
        ? `<div class="flex flex-wrap gap-1.5 mt-2">
            ${h.hazards
              .map(
                (hz) =>
                  `<span class="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-semibold">⚠️ ${hz}</span>`
              )
              .join('')}
          </div>`
        : '';

    body.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="text-base font-extrabold text-white">${h.name}</h3>
          <p class="text-xs text-slate-300 mt-0.5">Quận/Huyện: ${h.district} • Tọa độ: ${h.lat.toFixed(5)}, ${h.lng.toFixed(5)}</p>
        </div>
        <button onclick="document.getElementById('flood-hotspot-card').classList.add('hidden')" class="text-slate-400 hover:text-white text-sm font-bold px-2">✕</button>
      </div>

      <div class="mt-2 flex items-center gap-2 flex-wrap">
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 text-xs font-bold">
          📡 Phát hiện bởi: ${h.detectedBy}
        </span>
        <span class="text-[11px] text-slate-300">(${h.reportCount} lượt xác nhận • ${h.lastUpdatedText})</span>
      </div>

      ${hazardsHtml}

      <div class="grid grid-cols-3 gap-1.5 my-2.5 text-center text-xs">
        <div class="rounded-xl bg-red-500/20 border border-red-400/50 p-2">
          <div class="text-[10px] text-red-200">🔴 Tâm điểm trũng</div>
          <div class="font-black text-sm text-red-300">${p.predictedDepthCm} cm</div>
        </div>
        <div class="rounded-xl bg-amber-500/20 border border-amber-400/50 p-2">
          <div class="text-[10px] text-amber-200">🟡 Vành đai giữa</div>
          <div class="font-black text-sm text-amber-300">${Math.round(p.predictedDepthCm * 0.6)} cm</div>
        </div>
        <div class="rounded-xl bg-emerald-500/20 border border-emerald-400/50 p-2">
          <div class="text-[10px] text-emerald-200">🟢 Rìa ngoài</div>
          <div class="font-black text-sm text-emerald-300">${Math.round(p.predictedDepthCm * 0.25)} cm</div>
        </div>
      </div>

      <div class="text-xs text-slate-200 bg-slate-900/80 rounded-xl p-2.5 border border-white/10 mb-2.5">
        ${
          p.predictedDepthCm === 0
            ? `• <b>Hiện trạng thực tế:</b> Trời đang không mưa (${this.state.rainMmPerHour} mm/h), mặt đường <b>khô ráo (0 cm)</b>. Bạn có thể bấm <b>📹 Xem Camera Thực Tế</b> bên dưới để xem hình ảnh trực tiếp tại nút giao.`
            : `• <b>Dự báo thủy văn:</b> Mưa ${this.state.rainMmPerHour} mm/h trong ${this.state.rainDurationMin} phút • Thoát nước đạt <b>${p.drainageEfficiencyPct}%</b> công suất.<br/>• <b>Đánh giá cho ${vehicle.name}:</b> <b style="color:${p.colorHex}">${p.statusLabel}</b>`
        }
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button
          onclick="window.AtlantisApp.openReportModal('${h.id}')"
          class="py-2.5 px-3 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs"
        >
          ⚠️ Báo Cáo Điểm Ngập
        </button>
        <button
          onclick="window.AtlantisApp.openCameraModal('${h.id}')"
          class="py-2.5 px-3 rounded-xl bg-cyan-500 text-slate-950 font-extrabold text-xs"
        >
          📹 Xem Camera Thực Tế
        </button>
      </div>
      ${
        h.isUserCreated || typeof h.manualOverrideCm === 'number'
          ? `<button
              onclick="window.AtlantisApp.removeUserFloodHotspot('${h.id}')"
              class="mt-2 w-full py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 font-bold text-xs transition"
            >
              🗑️ Xóa điểm ngập này / Báo đã hết ngập
            </button>`
          : ''
      }
    `;

    card.classList.remove('hidden');
  },

  // Hiển thị Trạm Quan Trắc & Camera Thực Tế (Hà Nội: Trạm Đo Mưa/Mực Nước HSDC Maps & iHanoi; TP.HCM: Camera Giao Thông :8007)
  openCameraModal(hotspotId = null, customHcmcCamId = null) {
    const city = this.getCurrentCity();
    if (hotspotId) {
      this.state.selectedHotspotId = hotspotId;
    }
    const h = city.hotspots.find((x) => x.id === this.state.selectedHotspotId) || city.hotspots[0];
    const pred = this.state.predictions[h.id];

    const modal = document.getElementById('modal-camera-viewer');
    const titleEl = document.getElementById('cam-modal-title');
    const selectorEl = document.getElementById('cam-modal-selector');
    const infoBox = document.getElementById('cam-official-portal-box');
    if (!modal || !infoBox) return;

    // Reset kết quả đo AI cũ khi chuyển sang điểm camera mới
    document.getElementById('ai-photo-analysis-result')?.classList.add('hidden');
    document.getElementById('uploaded-photo-preview')?.classList.add('hidden');

    modal.classList.remove('hidden');
    if (titleEl) titleEl.textContent = h.cameraTitle;

    if (selectorEl) {
      selectorEl.innerHTML = city.hotspots
        .map(
          (item) => `
          <button
            onclick="window.AtlantisApp.openCameraModal('${item.id}')"
            class="px-2.5 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition ${
              item.id === h.id
                ? 'bg-cyan-500/30 border-cyan-400 text-white shadow-sm'
                : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
            }"
          >
            ${city.id === 'hanoi' ? '🌧️' : '📹'} ${item.name}
          </button>
        `
        )
        .join('');
    }

    if (this.state.camRefreshTimerId) {
      clearInterval(this.state.camRefreshTimerId);
      this.state.camRefreshTimerId = null;
    }

    const isHanoi = h.liveFeedType === 'hanoi_hsdc' || city.id === 'hanoi';

    if (isHanoi) {
      // ==================== GIAO DIỆN CHUẨN XÁC CHO HÀ NỘI (TRẠM QUAN TRẮC HSDC MAPS & iHANOI) ====================
      infoBox.innerHTML = `
        <div class="rounded-2xl bg-slate-900/95 border border-cyan-500/40 p-3.5 space-y-3 text-xs">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-extrabold text-[10px]">
              🏛️ TRẠM QUAN TRẮC ÚNG NGẬP & ĐO MƯA HÀ NỘI (HSDC MAPS)
            </span>
            <span id="cam-live-clock" class="text-cyan-300 font-mono text-[11px] font-bold">${new Date().toLocaleTimeString('vi-VN')}</span>
          </div>

          <!-- 2 Bảng đo Telemetry thực tế truyền trực tiếp từ Công ty Thoát nước Hà Nội -->
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-2xl overflow-hidden border border-cyan-400/40 bg-white p-2.5 shadow-md flex flex-col justify-between">
              <div class="text-[10px] font-extrabold text-slate-800 pb-1 truncate">🌧️ ${h.rainStationName || 'Trạm đo lượng mưa'}</div>
              <img
                id="hn-live-rain-img"
                src="${h.rainImgUrl || `https://thoatnuochanoi.vn/rain/images/${h.rainStationId || '55'}.png`}?t=${Date.now()}"
                alt="Lượng mưa Hà Nội"
                class="w-full h-20 object-contain bg-white rounded-lg mx-auto"
              />
              <div class="text-[9px] text-slate-500 text-center pt-1">Số liệu mưa tự động HSDC</div>
            </div>

            <div class="rounded-2xl overflow-hidden border border-cyan-400/40 bg-white p-2.5 shadow-md flex flex-col justify-between">
              <div class="text-[10px] font-extrabold text-slate-800 pb-1 truncate">🌊 ${h.waterStationName || 'Trạm đo mực nước'}</div>
              <img
                id="hn-live-wt-img"
                src="${h.waterImgUrl || `https://thoatnuochanoi.vn/wt/images/${h.waterStationId || '2_18'}.png`}?t=${Date.now()}"
                alt="Mực nước hồ/sông Hà Nội"
                class="w-full h-20 object-contain bg-white rounded-lg mx-auto"
              />
              <div class="text-[9px] text-slate-500 text-center pt-1">Cốt nước hồ điều hòa HSDC</div>
            </div>
          </div>

          <!-- Khung quan trắc nút giao thực địa Hà Nội -->
          <div class="relative rounded-2xl overflow-hidden border border-cyan-400/50 bg-slate-950 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-extrabold text-white text-xs">📍 Nút giao: <b class="text-cyan-300">${h.name}</b></span>
              <span class="px-2 py-0.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold">Quận ${h.district}</span>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center py-1">
              <div class="p-2 rounded-xl bg-white/5 border border-white/10">
                <div class="text-[10px] text-slate-400">Cốt vỉa hè chuẩn</div>
                <div class="text-sm font-black text-white mt-0.5">${h.curbReferenceCm || 28} cm</div>
              </div>
              <div class="p-2 rounded-xl bg-white/5 border border-white/10">
                <div class="text-[10px] text-slate-400">Năng lực cống</div>
                <div class="text-sm font-black text-cyan-300 mt-0.5">${h.drainageCapacityMmH || 35} mm/h</div>
              </div>
              <div class="p-2 rounded-xl bg-white/5 border border-white/10">
                <div class="text-[10px] text-slate-400">Mực nước ngập</div>
                <div class="text-sm font-black mt-0.5" style="color:${pred ? pred.colorHex : '#10b981'}">${pred ? pred.predictedDepthCm : 0} cm</div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-1">
              <span class="text-[11px] text-slate-300">Hiện trạng: <b style="color:${pred ? pred.colorHex : '#10b981'}">${pred ? pred.statusLabel : 'Khô ráo / An toàn'}</b></span>
              <button
                onclick="window.AtlantisApp.openReportModal('${h.id}')"
                class="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-[11px]"
              >
                ⚠️ Báo cáo điểm ngập
              </button>
            </div>
          </div>

          <!-- Các liên kết giám sát chính thức tại Hà Nội -->
          <div class="grid grid-cols-2 gap-2">
            <a
              href="${h.officialPortalUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="block py-2.5 px-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/45 border border-blue-400/50 text-blue-200 font-bold text-center text-[11px] transition"
            >
              🌐 Cổng Giám Sát HSDC Maps ↗
            </a>
            <a
              href="${h.trafficPortalUrl || 'https://ihanoi.hanoi.gov.vn'}"
              target="_blank"
              rel="noopener noreferrer"
              class="block py-2.5 px-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/45 border border-emerald-400/50 text-emerald-200 font-bold text-center text-[11px] transition"
            >
              📹 Cổng Camera iHanoi ↗
            </a>
          </div>
        </div>
      `;

      // Làm mới dữ liệu biểu đồ đo mưa và mực nước HSDC tự động mỗi 5 giây
      this.state.camRefreshTimerId = setInterval(() => {
        const rainImg = document.getElementById('hn-live-rain-img');
        const wtImg = document.getElementById('hn-live-wt-img');
        const clockEl = document.getElementById('cam-live-clock');
        if (modal.classList.contains('hidden')) {
          clearInterval(this.state.camRefreshTimerId);
          return;
        }
        if (rainImg && h.rainStationId) {
          rainImg.src = `https://thoatnuochanoi.vn/rain/images/${h.rainStationId}.png?t=${Date.now()}`;
        }
        if (wtImg && h.waterStationId) {
          wtImg.src = `https://thoatnuochanoi.vn/wt/images/${h.waterStationId}.png?t=${Date.now()}`;
        }
        if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
      }, 5000);

      return;
    }

    // ==================== GIAO DIỆN CHO TP. HỒ CHÍ MINH (LUỒNG CAMERA GIAO THÔNG SỞ GTVT :8007) ====================
    const activeCamId = customHcmcCamId || h.hcmcCamId || '587470c2b807da0011e33ce4';
    this.state.selectedSubCamId = activeCamId;
    const allCamsAtSpot = [
      { code: h.hcmcCamCode || 'CAM-LIVE', id: h.hcmcCamId || '587470c2b807da0011e33ce4', name: h.name },
      ...(h.secondaryCams || [])
    ];

    const subCamButtonsHtml =
      allCamsAtSpot.length > 1
        ? `<div class="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-1">
            ${allCamsAtSpot
              .map(
                (sc) => `
                <button
                  onclick="window.AtlantisApp.openCameraModal('${h.id}', '${sc.id}')"
                  class="px-2.5 py-1 rounded-lg text-[11px] font-bold border shrink-0 ${
                    sc.id === activeCamId
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-white/15'
                  }"
                >
                  🎥 ${sc.code}: ${sc.name}
                </button>
              `
              )
              .join('')}
          </div>`
        : '';

    const liveCamUrl = `/api/hcmc-cam?id=${activeCamId}&t=${Date.now()}`;

    infoBox.innerHTML = `
      <div class="rounded-2xl bg-slate-900/95 border border-cyan-500/40 p-3 space-y-2.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-extrabold text-[10px]">
            ● LUỒNG ẢNH CAMERA GIAO THÔNG TP.HCM TRỰC TIẾP (5S/LẦN)
          </span>
          <span id="cam-live-clock" class="text-cyan-300 font-mono text-[11px] font-bold">${new Date().toLocaleTimeString('vi-VN')}</span>
        </div>

        ${subCamButtonsHtml}

        <!-- Hình ảnh thực tế từ Camera giao thông đường phố TP.HCM -->
        <div class="relative rounded-2xl overflow-hidden border border-cyan-400/50 bg-black">
          <img
            id="live-traffic-cam-img"
            crossorigin="anonymous"
            src="${liveCamUrl}"
            alt="${h.cameraTitle}"
            class="w-full h-56 object-contain bg-black block"
          />
          <div class="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/90 border-t border-white/15 text-[11px]">
            <span class="text-white font-bold">Mực nước tại nút giao: <b style="color:${pred ? pred.colorHex : '#10b981'}">${
      pred ? pred.predictedDepthCm : 0
    } cm</b></span>
            <button
              onclick="window.AtlantisApp.analyzeCurrentTrafficCamImage()"
              class="px-2.5 py-1 rounded-lg bg-cyan-400 text-slate-950 font-extrabold shadow"
            >
              🤖 AI Đo Ảnh Camera Này
            </button>
          </div>
        </div>

        <a
          href="${h.officialPortalUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="block w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-cyan-200 font-bold text-center text-xs"
        >
          🌐 Mở Cổng Giao Thông TP.HCM (${h.officialPortalName}) ↗
        </a>
      </div>
    `;

    this.state.camRefreshTimerId = setInterval(() => {
      const imgEl = document.getElementById('live-traffic-cam-img');
      const clockEl = document.getElementById('cam-live-clock');
      if (!imgEl || modal.classList.contains('hidden')) {
        clearInterval(this.state.camRefreshTimerId);
        return;
      }
      imgEl.src = `/api/hcmc-cam?id=${activeCamId}&t=${Date.now()}`;
      if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('vi-VN');
    }, 5000);
  },

  analyzeCurrentTrafficCamImage() {
    const imgEl = document.getElementById('live-traffic-cam-img');
    const resultEl = document.getElementById('ai-photo-analysis-result');
    if (!imgEl || !imgEl.complete) return;

    const res = window.CameraAI.analyzeImageElement(imgEl);
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `<b>🤖 AI Computer Vision phân tích ảnh Camera Giao thông:</b> Độ phản xạ mặt đường cho thấy mực nước khoảng <b>${res.estimatedCm} cm</b> (Độ tin cậy ${res.confidencePct}%). ${res.summary}`;
    }
  },

  closeCameraModal() {
    if (this.state.camRefreshTimerId) {
      clearInterval(this.state.camRefreshTimerId);
      this.state.camRefreshTimerId = null;
    }
    window.CameraAI.stopDeviceLiveCamera();
    document.getElementById('modal-camera-viewer')?.classList.add('hidden');
  },

  analyzeLivePhoneCameraFrame() {
    const videoEl = document.getElementById('live-device-video');
    const resultEl = document.getElementById('ai-photo-analysis-result');
    const res = window.CameraAI.captureFrameFromLiveVideo(videoEl);
    if (!res) {
      this.showToast('⚠️ Hãy bấm "Mở Camera Thật Của Máy" trước khi chụp & đo mực nước!');
      return;
    }
    if (resultEl) {
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `<b>🤖 Kết quả AI đo từ Camera máy:</b> Mực nước ước tính <b>${res.estimatedCm} cm</b> (Độ tin cậy ${res.confidencePct}%). ${res.summary}`;
    }
    this.submitUserReport(res.estimatedCm);
  },

  // ==================== LƯU TRỮ & CHỌN ĐIỂM NGẬP BẤT KỲ TRÊN BẢN ĐỒ ====================
  loadUserCreatedHotspots() {
    try {
      const raw = localStorage.getItem('atlantis_user_hotspots_v1');
      if (!raw) return;
      const savedMap = JSON.parse(raw);
      if (!savedMap || typeof savedMap !== 'object') return;
      for (const [cId, list] of Object.entries(savedMap)) {
        const city = window.ATLANTIS_DATA?.cities?.[cId];
        if (!city || !Array.isArray(list)) continue;
        for (const item of list) {
          if (!item || !item.id || typeof item.lat !== 'number' || typeof item.lng !== 'number') continue;
          const exists = city.hotspots.find((h) => h.id === item.id);
          if (!exists) {
            city.hotspots.push({
              ...item,
              isUserCreated: true
            });
          }
        }
      }
    } catch (_) {}
  },

  saveUserCreatedHotspots() {
    try {
      const savedMap = {};
      for (const [cId, city] of Object.entries(window.ATLANTIS_DATA?.cities || {})) {
        savedMap[cId] = (city.hotspots || []).filter((h) => h.isUserCreated);
      }
      localStorage.setItem('atlantis_user_hotspots_v1', JSON.stringify(savedMap));
    } catch (_) {}
  },

  openReportModal(hotspotId = null) {
    const city = this.getCurrentCity();
    if (hotspotId) {
      this.state.selectedHotspotId = hotspotId;
      const h = city.hotspots.find((x) => x.id === hotspotId);
      if (h) {
        this.state.reportTarget = {
          mode: 'hotspot',
          hotspotId: h.id,
          lat: h.lat,
          lng: h.lng,
          name: h.name,
          district: h.district || city.name
        };
      }
      this.populateReportHotspotSelect(hotspotId);
    } else {
      // Nếu mở trực tiếp từ thanh công cụ: giữ điểm vừa chấm hoặc lấy tâm bản đồ hiện tại để người dùng báo điểm bất kỳ ngay
      if (!this.state.reportTarget || this.state.reportTarget.mode !== 'custom') {
        const center = this.map ? this.map.getCenter() : { lat: city.center[0], lng: city.center[1] };
        this.state.reportTarget = {
          mode: 'custom',
          hotspotId: null,
          lat: Number(center.lat.toFixed(6)),
          lng: Number(center.lng.toFixed(6)),
          name: `Điểm báo ngập (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`,
          district: city.name
        };
        // Tự động tra tên đường tại tâm bản đồ
        this.reverseGeocodeReportTarget(this.state.reportTarget.lat, this.state.reportTarget.lng);
      }
      this.populateReportHotspotSelect('__custom__');
    }

    document.getElementById('modal-report-flood')?.classList.remove('hidden');
  },

  async reverseGeocodeReportTarget(lat, lng) {
    try {
      const res = await this.reverseGeocodeUnified(lat, lng);
      if (res && res.shortName && this.state.reportTarget && Math.abs(this.state.reportTarget.lat - lat) < 0.0005) {
        this.state.reportTarget.name = res.shortName;
        this.state.reportTarget.district = res.district || this.getCurrentCity().name;
        const nameInput = document.getElementById('report-custom-name-input');
        if (nameInput) nameInput.value = res.shortName;
      }
    } catch (_) {}
  },

  populateReportHotspotSelect(selectedValue = '__custom__') {
    const city = this.getCurrentCity();
    const sel = document.getElementById('report-hotspot-select');
    const nameInput = document.getElementById('report-custom-name-input');
    const coordsBadge = document.getElementById('report-coords-badge');
    const radiusSel = document.getElementById('report-radius-select');

    if (sel) {
      const t = this.state.reportTarget;
      const customLabel =
        t && t.mode === 'custom'
          ? `📍 Điểm tự chọn trên bản đồ (${t.lat.toFixed(4)}, ${t.lng.toFixed(4)})`
          : '📍 Điểm bất kỳ tự chọn trên bản đồ';

      sel.innerHTML = [
        `<option value="__custom__">${customLabel}</option>`,
        ...city.hotspots.map(
          (h) =>
            `<option value="${h.id}">${h.isUserCreated ? '🆕 ' : '🌊 '}${h.name} (${h.district || city.name})</option>`
        )
      ].join('');

      sel.value = selectedValue && (selectedValue === '__custom__' || city.hotspots.some((h) => h.id === selectedValue))
        ? selectedValue
        : '__custom__';
    }

    this.syncReportModalInputsFromTarget();
    if (radiusSel && !radiusSel.value) radiusSel.value = '220';
    if (nameInput && coordsBadge && this.state.reportTarget) {
      nameInput.value = this.state.reportTarget.name || '';
      coordsBadge.textContent = `${this.state.reportTarget.lat.toFixed(5)}, ${this.state.reportTarget.lng.toFixed(5)}`;
    }
  },

  syncReportModalInputsFromTarget() {
    const nameInput = document.getElementById('report-custom-name-input');
    const coordsBadge = document.getElementById('report-coords-badge');
    const radiusSel = document.getElementById('report-radius-select');
    const t = this.state.reportTarget;
    if (!t) return;
    if (nameInput) nameInput.value = t.name || '';
    if (coordsBadge && typeof t.lat === 'number' && typeof t.lng === 'number') {
      coordsBadge.textContent = `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`;
    }
    if (radiusSel && t.hotspotId) {
      const h = this.getCurrentCity().hotspots.find((x) => x.id === t.hotspotId);
      if (h && h.maxRadiusM) {
        radiusSel.value = h.maxRadiusM <= 150 ? '130' : h.maxRadiusM >= 280 ? '320' : '220';
      }
    }
  },

  onReportHotspotSelectChange(val) {
    const city = this.getCurrentCity();
    if (val === '__custom__') {
      const center = this.map ? this.map.getCenter() : { lat: city.center[0], lng: city.center[1] };
      this.state.reportTarget = {
        mode: 'custom',
        hotspotId: null,
        lat: Number(center.lat.toFixed(6)),
        lng: Number(center.lng.toFixed(6)),
        name: `Điểm ngập tại (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`,
        district: city.name
      };
      this.syncReportModalInputsFromTarget();
      this.reverseGeocodeReportTarget(this.state.reportTarget.lat, this.state.reportTarget.lng);
      return;
    }

    const h = city.hotspots.find((x) => x.id === val);
    if (h) {
      this.state.selectedHotspotId = h.id;
      this.state.reportTarget = {
        mode: 'hotspot',
        hotspotId: h.id,
        lat: h.lat,
        lng: h.lng,
        name: h.name,
        district: h.district || city.name
      };
      this.syncReportModalInputsFromTarget();
    }
  },

  startReportMapPickMode() {
    this.state.isPickingReportLocation = true;
    document.getElementById('modal-report-flood')?.classList.add('hidden');
    document.getElementById('flood-hotspot-card')?.classList.add('hidden');
    document.getElementById('report-map-picker-banner')?.classList.remove('hidden');
    const mapEl = document.getElementById('map-container');
    if (mapEl) mapEl.style.cursor = 'crosshair';
    this.showToast('🎯 Hãy chạm vào bất kỳ vị trí nào trên bản đồ để chọn điểm báo ngập!');
  },

  cancelReportMapPickMode() {
    this.state.isPickingReportLocation = false;
    document.getElementById('report-map-picker-banner')?.classList.add('hidden');
    const mapEl = document.getElementById('map-container');
    if (mapEl) mapEl.style.cursor = '';
  },

  async onMapPickedForReport(lat, lng) {
    this.cancelReportMapPickMode();
    const city = this.getCurrentCity();
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));

    // Hiển thị ghim đỏ nhấp nháy tại vị trí vừa chấm trên bản đồ
    if (this.map) {
      if (this.reportPickMarker) {
        try {
          this.map.removeLayer(this.reportPickMarker);
        } catch (_) {}
      }
      const pinIcon = L.divIcon({
        className: 'custom-report-pick-pin',
        html: `<div style="
          width:28px;height:28px;border-radius:9999px;
          background:#ef4444;border:3px solid #ffffff;
          box-shadow:0 0 0 6px rgba(239,68,68,0.35),0 6px 16px rgba(0,0,0,0.45);
          display:flex;align-items:center;justify-content:center;
          color:#fff;font-size:13px;font-weight:900;
        ">⚠️</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      this.reportPickMarker = L.marker([cleanLat, cleanLng], { icon: pinIcon }).addTo(this.map);
      this.map.panTo([cleanLat, cleanLng], { animate: true });
    }

    this.state.reportTarget = {
      mode: 'custom',
      hotspotId: null,
      lat: cleanLat,
      lng: cleanLng,
      name: `Đang lấy tên đường (${cleanLat.toFixed(4)}, ${cleanLng.toFixed(4)})...`,
      district: city.name
    };

    this.populateReportHotspotSelect('__custom__');
    document.getElementById('modal-report-flood')?.classList.remove('hidden');

    try {
      const res = await this.reverseGeocodeUnified(cleanLat, cleanLng);
      if (res && res.shortName) {
        this.state.reportTarget.name = res.shortName;
        this.state.reportTarget.district = res.district || city.name;
      } else {
        this.state.reportTarget.name = `Điểm ngập tại (${cleanLat.toFixed(4)}, ${cleanLng.toFixed(4)})`;
      }
    } catch (_) {
      this.state.reportTarget.name = `Điểm ngập tại (${cleanLat.toFixed(4)}, ${cleanLng.toFixed(4)})`;
    }

    this.populateReportHotspotSelect('__custom__');
  },

  useGpsForReportPoint() {
    if (Array.isArray(this.state.userGpsCoords) && this.state.userGpsCoords.length === 2) {
      this.onMapPickedForReport(this.state.userGpsCoords[0], this.state.userGpsCoords[1]);
      return;
    }
    if (!navigator.geolocation) {
      this.showToast('⚠️ Trình duyệt không hỗ trợ định vị GPS. Hãy bấm "Chọn Điểm Trên Bản Đồ"!');
      return;
    }
    this.showToast('🛰️ Đang lấy tọa độ GPS hiện tại của bạn...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.state.userGpsCoords = [pos.coords.latitude, pos.coords.longitude];
        this.onMapPickedForReport(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        this.showToast('⚠️ Không lấy được GPS. Hãy bấm "Chọn Điểm Trên Bản Đồ" để chấm trực tiếp!');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  },

  submitCustomDepthReport() {
    const inputEl = document.getElementById('report-custom-cm-input');
    const rawVal = inputEl ? parseInt(inputEl.value, 10) : NaN;
    if (Number.isNaN(rawVal) || rawVal < 0 || rawVal > 200) {
      this.showToast('⚠️ Vui lòng nhập mực nước hợp lệ từ 0 đến 200 cm!');
      return;
    }
    this.submitUserReport(rawVal);
  },

  async submitUserReport(depthCm) {
    const city = this.getCurrentCity();
    const selVal = document.getElementById('report-hotspot-select')?.value || '__custom__';
    const customNameVal = (document.getElementById('report-custom-name-input')?.value || '').trim();
    const radiusVal = parseInt(document.getElementById('report-radius-select')?.value || '220', 10) || 220;
    const waveChecked = document.getElementById('chk-hazard-wave')?.checked;
    const holeChecked = document.getElementById('chk-hazard-hole')?.checked;

    const hazards = [];
    if (waveChecked) hazards.push('Sóng nước mạnh từ xe lớn');
    if (holeChecked) hazards.push('Hố sâu / Mất nắp cống');

    let targetHotspot = null;

    if (selVal !== '__custom__') {
      targetHotspot = city.hotspots.find((x) => x.id === selVal);
    }

    if (!targetHotspot) {
      const t = this.state.reportTarget || {
        lat: city.center[0],
        lng: city.center[1],
        name: 'Điểm ngập người dùng báo',
        district: city.name
      };

      // Kiểm tra xem tọa độ vừa chọn có trùng (< 65m) với điểm ngập nào đã có không
      const nearbyExisting = city.hotspots.find(
        (x) => this.distanceMeters([x.lat, x.lng], [t.lat, t.lng]) <= 65
      );

      if (nearbyExisting) {
        targetHotspot = nearbyExisting;
        if (customNameVal) targetHotspot.name = customNameVal;
      } else if (depthCm > 0) {
        const finalName =
          customNameVal ||
          (t.name && !t.name.startsWith('Đang lấy')
            ? t.name
            : `Điểm ngập (${t.lat.toFixed(4)}, ${t.lng.toFixed(4)})`);

        targetHotspot = {
          id: `spot-user-${Date.now()}`,
          isUserCreated: true,
          name: finalName,
          district: t.district || city.name,
          lat: t.lat,
          lng: t.lng,
          elevationM: 4.5,
          drainageCapacityMmH: 25,
          tideSensitivity: 0.2,
          basinFactor: 1.25,
          maxRadiusM: radiusVal,
          curbReferenceCm: 25,
          cameraTitle: `Điểm báo ngập cộng đồng – ${finalName}`,
          liveFeedType: city.id === 'hanoi' ? 'hanoi_hsdc' : 'hcmc_gtvt',
          officialPortalName: 'Cộng đồng Atlantis AI',
          officialPortalUrl: city.id === 'hanoi' ? 'https://thoatnuochanoi.vn' : 'https://giaothong.hochiminhcity.gov.vn',
          detectedBy: 'Báo cáo Cộng đồng (Vừa tạo trên bản đồ)',
          lastUpdatedText: 'Vừa xong',
          reportCount: 1,
          manualOverrideCm: Math.max(0, depthCm),
          hazards
        };
        city.hotspots.push(targetHotspot);
      } else {
        this.showToast('✅ Đã ghi nhận vị trí này hiện khô ráo (0 cm)!');
        document.getElementById('modal-report-flood')?.classList.add('hidden');
        return;
      }
    }

    if (targetHotspot) {
      targetHotspot.manualOverrideCm = Math.max(0, depthCm);
      targetHotspot.maxRadiusM = radiusVal || targetHotspot.maxRadiusM || 220;
      if (customNameVal) targetHotspot.name = customNameVal;
      targetHotspot.reportCount = (targetHotspot.reportCount || 1) + 1;
      targetHotspot.lastUpdatedText = 'Vừa xong';
      targetHotspot.detectedBy = targetHotspot.isUserCreated
        ? `Điểm ngập Người dùng tạo (${targetHotspot.reportCount} xác nhận)`
        : `Báo cáo Người dùng (${targetHotspot.reportCount} xác nhận)`;
      targetHotspot.hazards = hazards;
      this.state.selectedHotspotId = targetHotspot.id;

      // Nếu người dùng báo "Hết ngập (0 cm)" cho điểm tự tạo thì xóa luôn khỏi bản đồ
      if (depthCm <= 0 && targetHotspot.isUserCreated) {
        city.hotspots = city.hotspots.filter((x) => x.id !== targetHotspot.id);
      }
      this.saveUserCreatedHotspots();
    }

    if (this.reportPickMarker && this.map) {
      try {
        this.map.removeLayer(this.reportPickMarker);
      } catch (_) {}
      this.reportPickMarker = null;
    }

    document.getElementById('modal-report-flood')?.classList.add('hidden');
    await this.recalculateAll(true, true);

    if (targetHotspot && depthCm > 0) {
      this.openFloodHotspotCard(targetHotspot.id);
      this.showToast(`🚨 Đã ghim điểm ngập ${depthCm}cm tại "${targetHotspot.name}" & tự động tính lại lộ trình né ngập!`);
      this.speakVietnamese(`Đã ghim điểm ngập ${depthCm} xen ti mét tại ${targetHotspot.name}. Hệ thống đã tự động cập nhật lộ trình vòng tránh.`);
    } else if (targetHotspot) {
      document.getElementById('flood-hotspot-card')?.classList.add('hidden');
      this.showToast(`✅ Đã cập nhật "${targetHotspot.name}" hết ngập (0 cm)!`);
    }
  },

  async removeUserFloodHotspot(hotspotId) {
    const city = this.getCurrentCity();
    const h = city.hotspots.find((x) => x.id === hotspotId);
    if (!h) return;

    if (h.isUserCreated) {
      city.hotspots = city.hotspots.filter((x) => x.id !== hotspotId);
      this.saveUserCreatedHotspots();
      this.showToast(`🗑️ Đã xóa điểm ngập "${h.name}" khỏi bản đồ!`);
    } else {
      delete h.manualOverrideCm;
      h.manualOverrideCm = 0;
      this.showToast(`✅ Đã đặt "${h.name}" về trạng thái hết ngập (0 cm)!`);
    }

    document.getElementById('flood-hotspot-card')?.classList.add('hidden');
    await this.recalculateAll(false, true);
  },

  async triggerPanicNearestShelter() {
    document.getElementById('modal-sos')?.classList.add('hidden');
    const city = this.getCurrentCity();
    const nearest = city.safeZones[0];
    if (!nearest) return;

    this.state.routeQuery.toName = nearest.name;
    this.state.routeQuery.toCoords = [nearest.lat, nearest.lng];
    this.syncRouteHeaderInputs();
    await this.calculateAndRenderRoute(false);
    this.startTurnByTurnNavigation();
    this.speakVietnamese(`Đang dẫn đường khẩn cấp đưa xe tới điểm trú cao ráo: ${nearest.name}.`);
  },

  onForecastSliderChange(val) {
    this.setForecastTimeOffset(val);
  },

  async setForecastTimeOffset(offsetMin) {
    this.state.forecastOffsetMin = Math.max(0, Math.min(180, Number(offsetMin)));

    // Đồng bộ lại giá trị trên thanh trượt
    const slider = document.getElementById('slider-forecast-time');
    if (slider && Number(slider.value) !== this.state.forecastOffsetMin) {
      slider.value = this.state.forecastOffsetMin;
    }
    const hint = document.getElementById('slider-val-hint');
    if (hint) {
      hint.textContent = this.state.forecastOffsetMin === 0 ? '0 phút (Bây giờ)' : `+${this.state.forecastOffsetMin} phút`;
    }

    // Hiển thị giờ đồng hồ dự kiến
    const now = new Date();
    const future = new Date(now.getTime() + this.state.forecastOffsetMin * 60000);
    const timeFormatted = future.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const labelEl = document.getElementById('val-time-offset');
    if (labelEl) {
      labelEl.textContent = this.state.forecastOffsetMin === 0
        ? `Hiện tại (${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})`
        : `Dự báo +${this.state.forecastOffsetMin} phút (${timeFormatted})`;
    }

    await this.recalculateAll(false, false);
    this.updateForecastImpactSummary();
  },

  updateForecastImpactSummary() {
    const city = this.getCurrentCity();
    const vehicle = this.getCurrentVehicle();
    let safeCount = 0;
    let warnCount = 0;
    let dangerCount = 0;

    city.hotspots.forEach((h) => {
      const pred = this.state.predictions[h.id];
      if (!pred) return;
      if (pred.predictedDepthCm < vehicle.safeDepthCm) {
        safeCount++;
      } else if (pred.predictedDepthCm <= vehicle.dangerDepthCm) {
        warnCount++;
      } else {
        dangerCount++;
      }
    });

    const sEl = document.getElementById('fc-stat-safe');
    const wEl = document.getElementById('fc-stat-warn');
    const dEl = document.getElementById('fc-stat-danger');
    if (sEl) sEl.textContent = `${safeCount} điểm`;
    if (wEl) wEl.textContent = `${warnCount} điểm`;
    if (dEl) dEl.textContent = `${dangerCount} điểm`;
  },

  toggleForecastPlay() {
    const icon = document.getElementById('forecast-play-icon');
    const label = document.getElementById('forecast-play-label');
    const btn = document.getElementById('btn-forecast-autoplay');

    if (this.state.forecastAutoPlayTimerId) {
      clearInterval(this.state.forecastAutoPlayTimerId);
      this.state.forecastAutoPlayTimerId = null;
      if (icon) icon.textContent = '▶';
      if (label) label.textContent = 'Tự chạy';
      if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-md active:scale-95 transition';
      this.showToast('⏸ Đã dừng tự chạy dự báo', 1500);
      return;
    }

    if (icon) icon.textContent = '⏸';
    if (label) label.textContent = 'Dừng';
    if (btn) btn.className = 'px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1 shadow-md active:scale-95 transition';
    this.showToast('▶ Đang tự động mô phỏng diễn tiến mưa & ngập 3 giờ tới...', 2000);

    this.state.forecastAutoPlayTimerId = setInterval(() => {
      let next = this.state.forecastOffsetMin + 10;
      if (next > 180) {
        next = 0;
      }
      this.setForecastTimeOffset(next);
    }, 650);
  },

  async syncLivePublicData(applyImmediately = true) {
    const city = this.getCurrentCity();
    const data = await window.HydroAI.fetchPublicWeatherAndRiver(city);
    this.state.weatherLive = data;

    const chipRiver = document.getElementById('chip-live-weather-label');
    if (chipRiver) {
      chipRiver.textContent = `🌧️ Thực tế ${city.name}: ${data.liveTempC}°C • Mưa ${data.liveRainMm}mm/h • Sông ${data.estimatedRiverLevelM}m`;
    }

    if (applyImmediately) {
      this.state.isRealDataMode = true;
      this.state.rainMmPerHour = data.liveRainMm;
      this.state.riverLevelM = data.estimatedRiverLevelM;
      this.syncDemoSliders();
      await this.recalculateAll(false, true);
    }
  },

  async setRealOrDemoMode(isReal) {
    this.state.isRealDataMode = isReal;
    const city = this.getCurrentCity();
    city.hotspots.forEach((h) => {
      delete h.manualOverrideCm;
    });

    document.getElementById('btn-mode-real')?.classList.toggle('bg-emerald-500', isReal);
    document.getElementById('btn-mode-real')?.classList.toggle('text-slate-950', isReal);
    document.getElementById('btn-mode-demo')?.classList.toggle('bg-amber-400', !isReal);
    document.getElementById('btn-mode-demo')?.classList.toggle('text-slate-950', !isReal);

    const bubbleBadge = document.getElementById('demo-bubble-label');
    if (bubbleBadge) {
      bubbleBadge.textContent = isReal ? 'THẬT' : 'DEMO';
    }

    if (isReal) {
      await this.syncLivePublicData(true);
    } else {
      // Mức mưa bão đủ lớn (85 mm/h trong 45 phút) để các rốn ngập Hà Nội & TP.HCM ngập 24cm-36cm, kích hoạt tự động né ngập rõ rệt
      this.state.rainMmPerHour = 85;
      this.state.rainDurationMin = 45;
      this.state.riverLevelM = city.riverStation.warningLevelM + 0.2;
      this.syncDemoSliders();
      await this.recalculateAll(true, true);
    }
  },

  syncDemoSliders() {
    const r = document.getElementById('demo-slider-rain');
    const d = document.getElementById('demo-slider-duration');
    const rv = document.getElementById('demo-slider-river');
    if (r) r.value = this.state.rainMmPerHour;
    if (d) d.value = this.state.rainDurationMin;
    if (rv) {
      const rs = this.getCurrentCity().riverStation;
      rv.min = rs.minSliderM;
      rv.max = rs.maxSliderM;
      rv.value = this.state.riverLevelM;
    }
    this.updateDemoLabels();
  },

  updateDemoLabels() {
    const lr = document.getElementById('demo-val-rain');
    const ld = document.getElementById('demo-val-duration');
    const lrv = document.getElementById('demo-val-river');
    if (lr) lr.textContent = `${this.state.rainMmPerHour} mm/h`;
    if (ld) ld.textContent = `${this.state.rainDurationMin} phút`;
    if (lrv) lrv.textContent = `${Number(this.state.riverLevelM).toFixed(2)} m`;
  },

  async recalculateAll(announceVoice = false, recomputeRoute = false) {
    const city = this.getCurrentCity();
    const vehicle = this.getCurrentVehicle();
    const effectiveDuration = this.state.rainDurationMin + this.state.forecastOffsetMin;

    const preds = {};
    city.hotspots.forEach((h) => {
      preds[h.id] = window.HydroAI.predictHotspotFlood(
        h,
        this.state.rainMmPerHour,
        effectiveDuration,
        this.state.riverLevelM,
        city.riverStation,
        vehicle
      );
    });
    this.state.predictions = preds;
    this.updateDemoLabels();

    if (recomputeRoute || this.state.computedRoutes.activeCoords.length === 0) {
      await this.calculateAndRenderRoute(announceVoice);
    } else {
      this.renderMapLayers();
    }
    this.updateForecastImpactSummary();
  },

  toggleCity() {
    const nextCity = this.state.cityId === 'hanoi' ? 'hcmc' : 'hanoi';
    this.switchCity(nextCity);
  },

  updateCityUIBadges() {
    const city = this.getCurrentCity();
    const isHanoi = this.state.cityId === 'hanoi';

    const headerPill = document.getElementById('header-city-pill');
    if (headerPill) headerPill.textContent = isHanoi ? 'Hà Nội' : 'TP.HCM';

    const chipActive = document.getElementById('chip-active-city-name');
    const chipNext = document.getElementById('chip-next-city-name');
    if (chipActive) chipActive.textContent = isHanoi ? 'Hà Nội' : 'TP. Hồ Chí Minh';
    if (chipNext) chipNext.textContent = isHanoi ? 'TP.HCM' : 'Hà Nội';

    const chipCamLabel = document.getElementById('chip-camera-label');
    if (chipCamLabel) {
      chipCamLabel.textContent = isHanoi ? '🌧️ Quan trắc & Cam HSDC' : '📹 Camera thực tế TP.HCM';
    }

    const menuHn = document.getElementById('menu-btn-city-hanoi');
    const menuHcm = document.getElementById('menu-btn-city-hcmc');
    if (menuHn) {
      menuHn.className = isHanoi
        ? 'py-1.5 px-3 rounded-xl bg-sky-500/35 border border-sky-400 text-white font-extrabold shadow'
        : 'py-1.5 px-3 rounded-xl bg-white/10 border border-white/20 text-slate-300 font-bold hover:bg-white/15';
    }
    if (menuHcm) {
      menuHcm.className = !isHanoi
        ? 'py-1.5 px-3 rounded-xl bg-sky-500/35 border border-sky-400 text-white font-extrabold shadow'
        : 'py-1.5 px-3 rounded-xl bg-white/10 border border-white/20 text-slate-300 font-bold hover:bg-white/15';
    }

    const searchHn = document.getElementById('search-city-btn-hanoi');
    const searchHcm = document.getElementById('search-city-btn-hcmc');
    if (searchHn) {
      searchHn.className = isHanoi
        ? 'px-2.5 py-1 rounded-xl text-xs font-bold transition bg-blue-600 text-white shadow-sm'
        : 'px-2.5 py-1 rounded-xl text-xs font-bold transition bg-slate-200 text-slate-700 hover:bg-slate-300';
    }
    if (searchHcm) {
      searchHcm.className = !isHanoi
        ? 'px-2.5 py-1 rounded-xl text-xs font-bold transition bg-blue-600 text-white shadow-sm'
        : 'px-2.5 py-1 rounded-xl text-xs font-bold transition bg-slate-200 text-slate-700 hover:bg-slate-300';
    }

    const topSearchText = document.getElementById('top-search-pill-text');
    if (topSearchText) {
      topSearchText.textContent = `Tìm đường đi, địa điểm tại ${city.name}...`;
    }
  },

  async switchCity(cityId, silent = false) {
    if (!window.ATLANTIS_DATA.cities[cityId]) return;
    this.state.cityId = cityId;
    try {
      localStorage.setItem('atlantis_selected_city', cityId);
    } catch (e) {}

    const city = this.getCurrentCity();
    this.state.riverLevelM = city.riverStation.currentRealLevelM;
    this.state.selectedHotspotId = city.hotspots[0].id;
    this.state.routeQuery = {
      fromName: city.defaultOrigin.name,
      fromCoords: [city.defaultOrigin.lat, city.defaultOrigin.lng],
      toName: city.defaultDestination.name,
      toCoords: [city.defaultDestination.lat, city.defaultDestination.lng]
    };

    this.updateCityUIBadges();
    this.loadSearchHistory();
    this.syncRouteHeaderInputs();
    if (this.map && !silent) {
      this.map.flyTo(city.center, city.zoom, { duration: 0.85 });
    }
    await this.syncLivePublicData(this.state.isRealDataMode);
    document.getElementById('top-more-menu')?.classList.add('hidden');

    if (this.state.screenMode === 'search') {
      this.renderSearchHistoryList(document.getElementById('search-destination-input')?.value || '');
    }

    this.showToast(`🏙️ Đã chuyển sang ${city.name}`);
  },

  initDraggableDemoBubble() {
    const bubble = document.getElementById('floating-demo-bubble');
    if (!bubble) return;

    let isDragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = window.innerWidth - 64;
    let initialTop = window.innerHeight * 0.42;

    bubble.style.left = `${initialLeft}px`;
    bubble.style.top = `${initialTop}px`;

    const onStart = (clientX, clientY) => {
      isDragging = true;
      moved = false;
      startX = clientX;
      startY = clientY;
      const rect = bubble.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
    };

    const onMove = (clientX, clientY) => {
      if (!isDragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (Math.hypot(dx, dy) > 6) moved = true;
      const newLeft = Math.max(8, Math.min(window.innerWidth - 58, initialLeft + dx));
      const newTop = Math.max(60, Math.min(window.innerHeight - 80, initialTop + dy));
      bubble.style.left = `${newLeft}px`;
      bubble.style.top = `${newTop}px`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      if (!moved) {
        document.getElementById('modal-demo-controller')?.classList.toggle('hidden');
      }
    };

    bubble.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    bubble.addEventListener(
      'touchstart',
      (e) => {
        const t = e.touches[0];
        onStart(t.clientX, t.clientY);
      },
      { passive: true }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!isDragging) return;
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
      },
      { passive: true }
    );
    window.addEventListener('touchend', onEnd);
  },

  toggleWetScreenLock(lockState) {
    this.state.wetScreenLocked = lockState;
    document.getElementById('wet-screen-lock-overlay')?.classList.toggle('hidden', !lockState);
    if (lockState) {
      this.speakVietnamese('Đã khóa cảm ứng chống nước mưa.');
    }
  },

  speakVietnamese(text) {
    if (!this.state.voiceEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },

  startVoiceSearch() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      this.openSearchForTarget('to');
      this.speakVietnamese('Hãy chọn hoặc nhập địa điểm cần tìm.');
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'vi-VN';
    rec.start();
    rec.onresult = (e) => {
      const spoken = e.results[0][0].transcript;
      this.openSearchForTarget('to');
      const input = document.getElementById('search-destination-input');
      if (input) {
        input.value = spoken;
        this.renderSearchHistoryList(spoken);
        this.triggerLiveGeocodeAutocomplete(spoken);
      }
    };
  },

  bindEvents() {
    const searchInput = document.getElementById('search-destination-input');
    const clearBtn = document.getElementById('btn-clear-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (clearBtn) {
          clearBtn.classList.toggle('hidden', !val.trim());
        }
        this.renderSearchHistoryList(val);
        this.triggerLiveGeocodeAutocomplete(val);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitCustomSearchInput();
        }
      });
    }

    const rSlider = document.getElementById('demo-slider-rain');
    const dSlider = document.getElementById('demo-slider-duration');
    const rvSlider = document.getElementById('demo-slider-river');

    if (rSlider) {
      rSlider.addEventListener('input', (e) => {
        this.state.rainMmPerHour = Number(e.target.value);
        this.updateDemoLabels();
      });
      rSlider.addEventListener('change', () => {
        this.state.isRealDataMode = false;
        const b = document.getElementById('demo-bubble-label');
        if (b) b.textContent = 'DEMO';
        this.recalculateAll(false, true);
      });
    }

    if (dSlider) {
      dSlider.addEventListener('input', (e) => {
        this.state.rainDurationMin = Number(e.target.value);
        this.updateDemoLabels();
      });
      dSlider.addEventListener('change', () => {
        this.state.isRealDataMode = false;
        const b = document.getElementById('demo-bubble-label');
        if (b) b.textContent = 'DEMO';
        this.recalculateAll(false, true);
      });
    }

    if (rvSlider) {
      rvSlider.addEventListener('input', (e) => {
        this.state.riverLevelM = Number(e.target.value);
        this.updateDemoLabels();
      });
      rvSlider.addEventListener('change', () => {
        this.state.isRealDataMode = false;
        const b = document.getElementById('demo-bubble-label');
        if (b) b.textContent = 'DEMO';
        this.recalculateAll(false, true);
      });
    }

    const fileInput = document.getElementById('camera-upload-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
          const previewEl = document.getElementById('uploaded-photo-preview');
          if (previewEl) {
            previewEl.src = img.src;
            previewEl.classList.remove('hidden');
          }
          const analysis = window.CameraAI.analyzeImageElement(img);
          const resultEl = document.getElementById('ai-photo-analysis-result');
          if (resultEl) {
            resultEl.classList.remove('hidden');
            resultEl.innerHTML = `<b>🤖 Kết quả AI đo từ ảnh thực tế:</b> Mực nước ước tính <b>${analysis.estimatedCm} cm</b> (Độ tin cậy ${analysis.confidencePct}%). ${analysis.summary}`;
          }
          this.submitUserReport(analysis.estimatedCm);
        };
        img.src = URL.createObjectURL(file);
      });
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.AtlantisApp.init();
});
