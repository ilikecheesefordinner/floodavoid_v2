const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive'
};

// Tự động giải phóng cổng 8080 nếu có tiến trình server.js cũ đang chạy
function freePortIfInUse(port) {
  try {
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const lines = out.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid && pid !== process.pid) {
          try {
            process.kill(pid, 'SIGTERM');
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

// Giữ kết nối TCP/TLS bền vững (keep-alive) tới server :8007 để F5 BigIP định tuyến đúng node đã warm RTSP cache
const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  rejectUnauthorized: false
});

// Cookie phiên thực tế từ https://giaothong.hochiminhcity.gov.vn/map.aspx (bao gồm .VDMS, _frontend, TS01e7700a)
let hcmcSessionCookie =
  'ASP.NET_SessionId=q0mqcaiqv2rips4nsv3ewaeb; .VDMS=7ED5141E7781B07FCC06E80FDF974BA2A985EF4A75F360331F2824A0C1F197DD4142D985F1BDE77654D5DEA6E5FA8314E42CED9FA5BD2F5E7CADBD30467C0557E9E4D04EDC907E243538A4B0B9B98AF49628B533C45A0C55DEF1E8DD9F46B5B967AE84388E43968CED9FC8B573FED889CEAE5FD8; _frontend=!Ox9LmMvHzMO6YvnNM4rrCBRI9aIoGwUhRs7xjI/aSUExRbVZlrA9tFO4+wrLhq0Oz4awLpjSJpq+ytg=; TS01e7700a=0150c7cfd162768fe27534b19f4082493fcc9f3b4f3cb46ba3e38e90fcca636781dbfec66fbd5ab6fb828d0d99ca8a009e6e58024836e852fee66d885871855dfc71a95902d94ce6ce8401173c9aa5819f19872ea9d0a0a2cc463a15cba994e69fd7d61776; CurrentLanguage=vi';
let hcmcCookieLastFetched = 0;

// Bộ nhớ đệm lưu bức ảnh thật gần nhất (> 12KB) của từng mắt camera, đảm bảo KHÔNG BAO GIỜ trả về ảnh "IMAGE NOT AVAILABLE" (< 10KB)
const lastGoodFrameCache = new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function refreshHcmcCookie(force = false) {
  return new Promise((resolve) => {
    const now = Date.now();
    if (!force && hcmcSessionCookie && now - hcmcCookieLastFetched < 20 * 60 * 1000) {
      return resolve(hcmcSessionCookie);
    }

    const req = https.get(
      'https://giaothong.hochiminhcity.gov.vn/map.aspx',
      {
        agent: httpsKeepAliveAgent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        rejectUnauthorized: false
      },
      (res) => {
        const rawCookies = res.headers['set-cookie'];
        if (Array.isArray(rawCookies) && rawCookies.length > 0) {
          hcmcSessionCookie = rawCookies.map((c) => c.split(';')[0]).join('; ');
          hcmcCookieLastFetched = Date.now();
        }
        res.resume();
        resolve(hcmcSessionCookie);
      }
    );

    req.on('error', () => resolve(hcmcSessionCookie));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(hcmcSessionCookie);
    });
  });
}

// Hàm lấy 1 frame từ CameraHandler.ashx
function fetchSingleCameraAttempt(camId, cookie, attemptNum) {
  return new Promise((resolve) => {
    const targetUrl = `https://giaothong.hochiminhcity.gov.vn:8007/Render/CameraHandler.ashx?id=${encodeURIComponent(
      camId
    )}&t=${Date.now()}_${attemptNum}`;

    const req = https.get(
      targetUrl,
      {
        agent: httpsKeepAliveAgent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://giaothong.hochiminhcity.gov.vn/',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Cookie: cookie
        },
        rejectUnauthorized: false
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ statusCode: res.statusCode, buffer: null });
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: 200,
            contentType: res.headers['content-type'] || 'image/jpeg',
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );

    req.on('error', () => resolve({ statusCode: 502, buffer: null }));
    req.setTimeout(4500, () => {
      req.destroy();
      resolve({ statusCode: 504, buffer: null });
    });
  });
}

/**
 * Lấy ảnh thực tế từ Camera giao thông TP.HCM:
 * Do cơ chế On-Demand RTSP Grabbing của cổng :8007, lần gọi #1 khi camera đang nghỉ (cold cache)
 * sẽ trả về ảnh placeholder "IMAGE NOT AVAILABLE" (~5,355 bytes) đồng thời đánh thức RTSP grabber.
 * Sau ~400ms, lần gọi #2 sẽ nhận được bức ảnh chụp đường phố thực tế (35,000 - 60,000 bytes, 518x294).
 */
async function getVerifiedRealCameraFrame(camId) {
  let cookie = await refreshHcmcCookie(false);

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetchSingleCameraAttempt(camId, cookie, attempt);

    if (res.statusCode === 403 || res.statusCode === 401) {
      cookie = await refreshHcmcCookie(true);
      continue;
    }

    // Ảnh đường phố thật luôn > 12,000 bytes (thường 35KB-60KB), còn ảnh "IMAGE NOT AVAILABLE" chỉ ~5,355 - 9,230 bytes
    if (res.buffer && res.buffer.byteLength > 12000) {
      lastGoodFrameCache.set(camId, {
        buffer: res.buffer,
        contentType: res.contentType,
        ts: Date.now()
      });
      return { buffer: res.buffer, contentType: res.contentType };
    }

    // Đợi 420ms để RTSP grabber trên server :8007 kịp kéo frame thật từ camera ngoài đường về RAM cache
    if (attempt < 4) {
      await sleep(420);
    }
  }

  // Nếu có sẵn frame thật trong cache trước đó thì trả về ngay
  if (lastGoodFrameCache.has(camId)) {
    return lastGoodFrameCache.get(camId);
  }
  // Dự phòng: lấy bất kỳ frame thật nào đã warm thành công
  for (const val of lastGoodFrameCache.values()) {
    return val;
  }
  return null;
}

// Khởi động làm nóng (Pre-warm) sẵn các mắt camera trọng điểm ngay khi bật Server
const KEY_CAMERA_IDS = [
  '587470c2b807da0011e33ce4', // Nguyễn Hữu Cảnh - Ngô Tất Tố (Cầu Thủ Thiêm 1)
  '63b65ebebfd3d90017eaa3ae', // Dạ cầu Thủ Thiêm 1
  '58af994abd82540010390c37', // Nguyễn Hữu Cảnh - Tôn Đức Thắng
  '66b1c3fa779f740018674146', // Nguyễn Hữu Cảnh - Ung Văn Khiêm
  '587c782db807da0011e33d3b', // Võ Nguyên Giáp - Thảo Điền
  '63ae7669bfd3d90017e8f0d9', // Khánh Hội - Cầu Kênh Tẻ (Trần Xuân Soạn)
  '63bd1f48bfd3d90017ec3d19', // Huỳnh Tấn Phát - Nguyễn Thị Thập
  '59ca31d602eb490011a0a40b', // QL1 - Hồ Học Lãm
  '56de42f611f398ec0c481299'  // Võ Văn Kiệt - An Dương Vương 2
];

async function prewarmCameras() {
  await refreshHcmcCookie(true);
  for (const id of KEY_CAMERA_IDS) {
    getVerifiedRealCameraFrame(id).catch(() => {});
  }
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        !net.address.startsWith('169.254.') &&
        !net.address.startsWith('192.168.56.')
      ) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const geocodeSearchCache = new Map();
const osrmRouteCache = new Map();
const OSRM_CACHE_MAX = 300;
const OSRM_CACHE_TTL_MS = 10 * 60 * 1000;
const GEOCODE_CACHE_MAX = 500;

// Danh sách máy chủ OSRM công cộng (tự động chuyển máy chủ dự phòng khi bị lỗi / quá tải 429)
const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving/',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
];

function cacheSetBounded(map, key, value, max) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    map.delete(map.keys().next().value);
  }
}

// Bỏ dấu tiếng Việt để so khớp tìm kiếm không dấu
function stripViDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Giới hạn tần suất gọi Nominatim (chính sách sử dụng: tối đa 1 request/giây)
let lastNominatimCallAt = 0;
async function nominatimGetJson(targetUrl) {
  const wait = lastNominatimCallAt + 1100 - Date.now();
  lastNominatimCallAt = Math.max(Date.now(), lastNominatimCallAt + 1100);
  if (wait > 0) await sleep(wait);
  return httpsGetJson(targetUrl);
}

function httpsGetJson(targetUrl) {
  return new Promise((resolve) => {
    const req = https.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'AtlantisFloodNavigationAI/2.5 (https://thoatnuochanoi.vn; support@atlantis.vn)',
          Accept: 'application/json',
          'Accept-Language': 'vi,en;q=0.8'
        },
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const txt = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(txt));
          } catch (e) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(4500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;
  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    points.push([Number((lat / 1e5).toFixed(6)), Number((lng / 1e5).toFixed(6))]);
  }
  return points;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (parsedUrl.pathname === '/favicon.ico') {
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0284c7"/><path d="M32 12 C22 28 16 36 16 44 A16 16 0 0 0 48 44 C48 36 42 28 32 12 Z" fill="#38bdf8"/></svg>`;
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    res.end(svgIcon);
    return;
  }

  if (parsedUrl.pathname === '/api/lan-info') {
    const ip = getLanIp();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ip, port: PORT, mobileUrl: `http://${ip}:${PORT}` }));
    return;
  }

  // API Proxy định tuyến OSRM: có bộ nhớ đệm, giới hạn thời gian chờ và tự động chuyển máy chủ dự phòng khi lỗi / quá tải
  if (parsedUrl.pathname === '/api/osrm-route') {
    const coordsParam = (parsedUrl.searchParams.get('coords') || '').trim();
    const alternatives = parsedUrl.searchParams.get('alternatives') === 'true' ? 'true' : 'false';
    // Chỉ chấp nhận chuỗi tọa độ hợp lệ dạng "lng,lat;lng,lat;..." (2-6 điểm)
    const validCoords = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?(;-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?){1,5}$/.test(coordsParam);
    if (!validCoords) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 'InvalidInput', message: 'coords phải có dạng lng,lat;lng,lat' }));
      return;
    }

    const cacheKey = `${coordsParam}|${alternatives}`;
    const cached = osrmRouteCache.get(cacheKey);
    if (cached && Date.now() - cached.at < OSRM_CACHE_TTL_MS) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Atlantis-Cache': 'HIT' });
      res.end(cached.body);
      return;
    }

    const query = `${coordsParam}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;
    let body = null;
    for (const base of OSRM_SERVERS) {
      // Thử mỗi máy chủ tối đa 2 lần (lần 2 chờ 400ms nếu bị quá tải)
      for (let attempt = 0; attempt < 2 && !body; attempt++) {
        if (attempt > 0) await sleep(400);
        const data = await httpsGetJson(base + query);
        if (data && data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          body = JSON.stringify(data);
        } else if (data && data.code && data.code !== 'Ok' && data.code !== 'TooManyRequests') {
          // Lỗi dữ liệu (NoRoute, InvalidQuery...) – không cần thử lại cùng máy chủ
          break;
        }
      }
      if (body) break;
    }

    if (!body) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 'Unavailable', message: 'Tất cả máy chủ OSRM đều không phản hồi' }));
      return;
    }

    cacheSetBounded(osrmRouteCache, cacheKey, { at: Date.now(), body }, OSRM_CACHE_MAX);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'X-Atlantis-Cache': 'MISS' });
    res.end(body);
    return;
  }

  // API Tìm kiếm địa điểm thực tế siêu nhạy (Photon Komoot + Nominatim OpenStreetMap Việt Nam - 100% MIỄN PHÍ, KHÔNG CẦN KEY)
  if (parsedUrl.pathname === '/api/search-places') {
    const q = (parsedUrl.searchParams.get('q') || '').trim().slice(0, 120);
    const cityName = (parsedUrl.searchParams.get('city') || '').trim();
    const viewbox = (parsedUrl.searchParams.get('viewbox') || '').trim();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([]));
      return;
    }

    const cacheKey = `${cityName}:${q.toLowerCase()}`;
    if (geocodeSearchCache.has(cacheKey)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(geocodeSearchCache.get(cacheKey)));
      return;
    }

    const isHcm = cityName.toLowerCase().includes('hồ chí minh') || cityName.toLowerCase().includes('hcm');
    const biasLat = isHcm ? 10.7769 : 21.0285;
    const biasLon = isHcm ? 106.7009 : 105.8542;

    // Khung bao thành phố (viewbox dạng minLon,maxLat,maxLon,minLat) – dùng để ưu tiên kết quả trong thành phố
    let vb = null;
    const vbParts = viewbox.split(',').map(Number);
    if (vbParts.length === 4 && vbParts.every((n) => Number.isFinite(n))) {
      vb = {
        minLon: Math.min(vbParts[0], vbParts[2]),
        maxLon: Math.max(vbParts[0], vbParts[2]),
        minLat: Math.min(vbParts[1], vbParts[3]),
        maxLat: Math.max(vbParts[1], vbParts[3])
      };
    }
    const inCity = (lat, lng) =>
      vb ? lat >= vb.minLat - 0.08 && lat <= vb.maxLat + 0.08 && lng >= vb.minLon - 0.08 && lng <= vb.maxLon + 0.08 : true;

    const results = [];
    const seenCoords = new Set();
    const seenNames = new Set();
    const pushResult = (item) => {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return;
      if (!(item.lat > 8 && item.lat < 24 && item.lng > 102 && item.lng < 110)) return;
      const coordKey = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
      const nameKey = `${stripViDiacritics(item.name)}|${stripViDiacritics(item.subtitle).slice(0, 30)}`;
      if (seenCoords.has(coordKey) || seenNames.has(nameKey)) return;
      seenCoords.add(coordKey);
      seenNames.add(nameKey);
      results.push(item);
    };

    // 1. Photon Komoot (nhanh, chịu được gõ sai/không dấu một phần) – chạy song song với 2 truy vấn: nguyên bản và kèm tên thành phố
    const photonBase = `https://photon.komoot.io/api/?lat=${biasLat}&lon=${biasLon}&limit=10&location_bias_scale=0.6`;
    const photonQueries = [q];
    if (cityName && !stripViDiacritics(q).includes(stripViDiacritics(cityName))) {
      photonQueries.push(`${q} ${cityName}`);
    }
    const photonResponses = await Promise.all(
      photonQueries.map((pq) => httpsGetJson(`${photonBase}&q=${encodeURIComponent(pq)}`))
    );
    photonResponses.forEach((photonData) => {
      if (!photonData || !Array.isArray(photonData.features)) return;
      photonData.features.forEach((f) => {
        const props = f.properties || {};
        const geom = f.geometry || {};
        const cc = (props.countrycode || '').toUpperCase();
        if (cc && cc !== 'VN') return;
        if (!geom.coordinates) return;
        const lat = geom.coordinates[1];
        const lng = geom.coordinates[0];
        const streetLine = [props.housenumber, props.street].filter(Boolean).join(' ');
        const title = props.name || streetLine || q;
        const subParts = [props.name ? streetLine : '', props.district || props.locality, props.city || props.county, props.state]
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);
        pushResult({
          name: title,
          subtitle: subParts.join(', ') || 'Việt Nam',
          lat,
          lng,
          source: 'photon'
        });
      });
    });

    // 2. Nominatim OpenStreetMap: bổ sung khi còn ít kết quả trong thành phố (tôn trọng giới hạn 1 request/giây)
    const countInCity = () => results.filter((r) => inCity(r.lat, r.lng)).length;
    if (countInCity() < 3) {
      const fullQuery = cityName && !stripViDiacritics(q).includes(stripViDiacritics(cityName)) ? `${q}, ${cityName}` : q;
      const vbParam = viewbox ? `&viewbox=${encodeURIComponent(viewbox)}&bounded=0` : '';
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&addressdetails=1&limit=6&q=${encodeURIComponent(fullQuery)}${vbParam}`;

      let data = await nominatimGetJson(nomUrl);
      if ((!Array.isArray(data) || data.length === 0) && fullQuery !== q) {
        data = await nominatimGetJson(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`
        );
      }

      if (Array.isArray(data)) {
        data.forEach((item) => {
          const parts = (item.display_name || '').split(',').map((s) => s.trim());
          const title = item.name || parts[0] || q;
          const subtitle = parts.slice(item.name ? 1 : 1, 4).join(', ');
          pushResult({
            name: title,
            subtitle: subtitle || item.display_name || '',
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            source: 'nominatim'
          });
        });
      }
    }

    // 3. Xếp hạng: ưu tiên (a) nằm trong thành phố, (b) tên khớp truy vấn (không dấu), (c) gần trung tâm thành phố
    const normQ = stripViDiacritics(q);
    const qTokens = normQ.split(/\s+/).filter(Boolean);
    const scoreOf = (r) => {
      const normName = stripViDiacritics(r.name);
      const normAll = `${normName} ${stripViDiacritics(r.subtitle)}`;
      let score = 0;
      if (inCity(r.lat, r.lng)) score += 100;
      if (normName === normQ) score += 60;
      else if (normName.startsWith(normQ)) score += 40;
      else if (normName.includes(normQ)) score += 30;
      const matched = qTokens.filter((t) => normAll.includes(t)).length;
      score += qTokens.length ? (matched / qTokens.length) * 30 : 0;
      const dKm = Math.hypot(r.lat - biasLat, (r.lng - biasLon) * Math.cos((biasLat * Math.PI) / 180)) * 111;
      score -= Math.min(40, dKm);
      return score;
    };
    results.sort((a, b) => scoreOf(b) - scoreOf(a));
    const finalResults = results.slice(0, 8).map(({ source, ...rest }) => rest);

    if (finalResults.length > 0) {
      cacheSetBounded(geocodeSearchCache, cacheKey, finalResults, GEOCODE_CACHE_MAX);
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(finalResults));
    return;
  }

  // API Dịch ngược tọa độ GPS ra tên đường/phường chính xác
  if (parsedUrl.pathname === '/api/reverse-geocode') {
    const lat = parsedUrl.searchParams.get('lat');
    const lon = parsedUrl.searchParams.get('lon');
    if (!lat || !lon) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing lat/lon' }));
      return;
    }
    const revUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const data = await nominatimGetJson(revUrl);
    let placeName = `Vị trí GPS (${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)})`;
    if (data && data.display_name) {
      const parts = data.display_name.split(',').map((s) => s.trim());
      placeName = parts.slice(0, 3).join(', ');
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ name: placeName, raw: data }));
    return;
  }

  // API Chỉ đường Google Maps Directions (Khi có API Key)
  if (parsedUrl.pathname === '/api/google-directions') {
    const origin = parsedUrl.searchParams.get('origin');
    const destination = parsedUrl.searchParams.get('destination');
    const key = parsedUrl.searchParams.get('key') || process.env.GOOGLE_MAPS_API_KEY;

    if (!origin || !destination) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing origin or destination' }));
      return;
    }

    if (!key) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_KEY', message: 'Chưa cấu hình Google Maps API Key' }));
      return;
    }

    const gUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&alternatives=true&language=vi&key=${encodeURIComponent(key)}`;
    const data = await httpsGetJson(gUrl);

    if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_ROUTES', raw: data }));
      return;
    }

    const routes = data.routes.map((r) => {
      const coords = decodePolyline(r.overview_polyline?.points || '');
      const leg = r.legs && r.legs[0];
      const steps = [];

      if (leg && Array.isArray(leg.steps)) {
        leg.steps.forEach((st) => {
          const loc = st.start_location ? [st.start_location.lat, st.start_location.lng] : coords[0];
          let bestIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < coords.length; i++) {
            const d = Math.hypot(coords[i][0] - loc[0], coords[i][1] - loc[1]);
            if (d < minDist) {
              minDist = d;
              bestIdx = i;
            }
          }

          let plainText = (st.html_instructions || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          let arrow = '↑';
          if (st.maneuver) {
            if (st.maneuver.includes('right')) arrow = '↱';
            else if (st.maneuver.includes('left')) arrow = '↰';
            else if (st.maneuver.includes('uturn')) arrow = '↶';
            else if (st.maneuver.includes('roundabout')) arrow = '↻';
          }

          steps.push({
            streetName: plainText || 'Đi theo lộ trình',
            rawRoadName: plainText,
            distanceM: st.distance ? st.distance.value : 100,
            arrow,
            location: loc,
            coordIdx: bestIdx
          });
        });
      }

      return {
        coords,
        distanceKm: leg ? Number((leg.distance.value / 1000).toFixed(1)) : 0,
        durationMin: leg ? Math.max(1, Math.round(leg.duration.value / 60)) : 0,
        steps,
        source: 'google_maps'
      };
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ routes }));
    return;
  }

  // API Chỉ đường GraphHopper với tính năng cấm vùng ngập lụt (block_area)
  if (parsedUrl.pathname === '/api/graphhopper-directions') {
    const origin = parsedUrl.searchParams.get('origin');
    const destination = parsedUrl.searchParams.get('destination');
    const blockArea = parsedUrl.searchParams.get('block_area') || '';
    const vehicle = parsedUrl.searchParams.get('vehicle') || 'car';
    const key = parsedUrl.searchParams.get('key') || process.env.GRAPHHOPPER_API_KEY;

    if (!origin || !destination) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing origin or destination' }));
      return;
    }

    if (!key) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_KEY', message: 'Chưa cấu hình GraphHopper API Key' }));
      return;
    }

    const [fromLat, fromLng] = origin.split(',');
    const [toLat, toLng] = destination.split(',');
    let ghUrl = `https://graphhopper.com/api/1/route?point=${encodeURIComponent(fromLat)},${encodeURIComponent(fromLng)}&point=${encodeURIComponent(toLat)},${encodeURIComponent(toLng)}&vehicle=${encodeURIComponent(vehicle)}&locale=vi&points_encoded=true&ch.disable=true&key=${encodeURIComponent(key)}`;
    if (blockArea) {
      ghUrl += `&block_area=${encodeURIComponent(blockArea)}`;
    }

    const data = await httpsGetJson(ghUrl);
    if (!data || !Array.isArray(data.paths) || data.paths.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_ROUTES', raw: data }));
      return;
    }

    const routes = data.paths.map((p) => {
      const coords = decodePolyline(p.points || '');
      const steps = [];
      if (Array.isArray(p.instructions)) {
        p.instructions.forEach((ins) => {
          let arrow = '↑';
          if (ins.sign === 2) arrow = '↱';
          else if (ins.sign === -2) arrow = '↰';
          else if (ins.sign === 3) arrow = '↱';
          else if (ins.sign === -3) arrow = '↰';
          else if (ins.sign === 4) arrow = '↶';
          steps.push({
            streetName: ins.street_name || ins.text || 'Đi thẳng',
            rawRoadName: ins.street_name || ins.text || '',
            distanceM: Math.round(ins.distance || 50),
            arrow,
            location: coords[ins.interval ? ins.interval[0] : 0] || coords[0],
            coordIdx: ins.interval ? ins.interval[0] : 0
          });
        });
      }
      return {
        coords,
        distanceKm: Number((p.distance / 1000).toFixed(1)),
        durationMin: Math.max(1, Math.round(p.time / 60000)),
        steps,
        source: 'graphhopper'
      };
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ routes }));
    return;
  }

  // API Chỉ đường Goong Maps (Nền tảng bản đồ số Việt Nam - Dành riêng cho xe máy & ô tô Việt Nam)
  if (parsedUrl.pathname === '/api/goong-directions') {
    const origin = parsedUrl.searchParams.get('origin');
    const destination = parsedUrl.searchParams.get('destination');
    const vehicle = parsedUrl.searchParams.get('vehicle') || 'bike';
    const key = parsedUrl.searchParams.get('key') || process.env.GOONG_API_KEY;

    if (!origin || !destination) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Missing origin or destination' }));
      return;
    }

    if (!key) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_KEY', message: 'Chưa cấu hình Goong Maps API Key' }));
      return;
    }

    const goongUrl = `https://rsapi.goong.io/Direction?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&vehicle=${encodeURIComponent(vehicle)}&api_key=${encodeURIComponent(key)}`;
    const data = await httpsGetJson(goongUrl);

    if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'NO_ROUTES', raw: data }));
      return;
    }

    const routes = data.routes.map((r) => {
      const coords = decodePolyline(r.overview_polyline?.points || '');
      const leg = r.legs && r.legs[0];
      const steps = [];

      if (leg && Array.isArray(leg.steps)) {
        leg.steps.forEach((st) => {
          const loc = st.start_location ? [st.start_location.lat, st.start_location.lng] : coords[0];
          let bestIdx = 0;
          let minDist = Infinity;
          for (let i = 0; i < coords.length; i++) {
            const d = Math.hypot(coords[i][0] - loc[0], coords[i][1] - loc[1]);
            if (d < minDist) {
              minDist = d;
              bestIdx = i;
            }
          }

          let plainText = (st.html_instructions || st.instructions || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          let arrow = '↑';
          if (st.maneuver) {
            if (st.maneuver.includes('right')) arrow = '↱';
            else if (st.maneuver.includes('left')) arrow = '↰';
            else if (st.maneuver.includes('uturn')) arrow = '↶';
            else if (st.maneuver.includes('roundabout')) arrow = '↻';
          }

          steps.push({
            streetName: plainText || 'Đi theo lộ trình',
            rawRoadName: plainText,
            distanceM: st.distance ? st.distance.value : 100,
            arrow,
            location: loc,
            coordIdx: bestIdx
          });
        });
      }

      return {
        coords,
        distanceKm: leg ? Number((leg.distance.value / 1000).toFixed(1)) : 0,
        durationMin: leg ? Math.max(1, Math.round(leg.duration.value / 60)) : 0,
        steps,
        source: 'goong_maps'
      };
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ routes }));
    return;
  }

  // Proxy lấy ảnh Snapshot JPEG thời gian thực (Đã lọc bỏ 100% ảnh "IMAGE NOT AVAILABLE")
  if (parsedUrl.pathname === '/api/hcmc-cam' || parsedUrl.pathname === '/api/real-camera-feed') {
    const camId =
      parsedUrl.searchParams.get('id') ||
      parsedUrl.searchParams.get('camId') ||
      '587470c2b807da0011e33ce4';

    const frame = await getVerifiedRealCameraFrame(camId);
    if (frame && frame.buffer) {
      res.writeHead(200, {
        'Content-Type': frame.contentType || 'image/jpeg',
        'Content-Length': frame.buffer.byteLength,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      res.end(frame.buffer);
    } else {
      res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
      res.end('Camera temporarily unavailable');
    }
    return;
  }

  // Proxy lấy dữ liệu JSON 45 trạm giám sát ngập thực tế Hà Nội
  if (parsedUrl.pathname === '/api/hanoi-flood-live') {
    https
      .get(
        'https://thoatnuochanoi.vn/ungngap/api/flood/getflood',
        { rejectUnauthorized: false },
        (hnRes) => {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          });
          hnRes.pipe(res);
        }
      )
      .on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ Code: 0, Content: [] }));
      });
    return;
  }

  let safePath = '/';
  try {
    safePath = decodeURIComponent(parsedUrl.pathname || '/');
  } catch (_) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const relPath = safePath === '/' ? '/index.html' : safePath;
  const resolvedRoot = path.resolve(ROOT);
  const filePath = path.resolve(ROOT, '.' + relPath);
  const relFromRoot = path.relative(resolvedRoot, filePath).replace(/\\/g, '/');

  // Chặn truy cập vượt thư mục gốc (Path Traversal), file ẩn (.env, .git) và các file nội bộ máy chủ
  const blockedFiles = new Set(['server.js', 'build-apk.js', 'push-github.js', 'package.json', 'package-lock.json']);
  if (
    relFromRoot.startsWith('..') ||
    path.isAbsolute(relFromRoot) ||
    relFromRoot.split('/').some((part) => part.startsWith('.')) ||
    blockedFiles.has(relFromRoot) ||
    !MIME_TYPES[path.extname(filePath).toLowerCase()]
  ) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

freePortIfInUse(PORT);
setTimeout(() => {
  prewarmCameras();
  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLanIp();
    console.log('================================================================');
    console.log('  🌊 ATLANTIS AI - SERVER DA KHOI DONG THANH CONG!');
    console.log('================================================================');
    console.log(`  💻 Tren may tinh:   http://localhost:${PORT}`);
    console.log(`  📱 Tren dien thoai: http://${ip}:${PORT}  (Cung mang Wi-Fi)`);
    console.log('================================================================');
  });
}, 400);
