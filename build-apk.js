/**
 * ATLANTIS AI - Trình đóng gói Android APK độc lập (Pure Node.js APK Compiler)
 * Tạo trực tiếp file cài đặt ATLANTIS-AI.apk (chứa AXML AndroidManifest.xml, Dalvik classes.dex,
 * toàn bộ tài nguyên web trong assets/public/, chữ ký số APK Signature Scheme v2 + JAR v1).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = __dirname;

// ============================================================================
// 1. ĐỒNG BỘ TÀI NGUYÊN WEB SANG android-app/www VÀ android/app/src/main/assets/public
// ============================================================================
function syncWebAssets() {
  const targets = [
    path.join(ROOT, 'android-app', 'www'),
    path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'public')
  ];

  const filesToCopy = [
    'index.html',
    'manifest.json',
    'sw.js',
    path.join('css', 'liquid-glass.css'),
    path.join('js', 'data.js'),
    path.join('js', 'hydro-ai.js'),
    path.join('js', 'camera-ai.js'),
    path.join('js', 'app.js')
  ];

  for (const baseDir of targets) {
    for (const rel of filesToCopy) {
      const src = path.join(ROOT, rel);
      const dst = path.join(baseDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
  return filesToCopy;
}

// ============================================================================
// 2. TRÌNH BIÊN DỊCH NHỊ PHÂN ANDROID MANIFEST (AXML FORMAT)
// ============================================================================
function buildBinaryAndroidManifest() {
  const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

  // Các thuộc tính có Resource ID của hệ thống Android (sắp xếp tăng dần theo mã hex)
  const attrResTable = [
    { name: 'theme', id: 0x01010000 },
    { name: 'label', id: 0x01010001 },
    { name: 'name', id: 0x01010003 },
    { name: 'exported', id: 0x01010010 },
    { name: 'launchMode', id: 0x0101001d },
    { name: 'configChanges', id: 0x0101001f },
    { name: 'minSdkVersion', id: 0x0101020c },
    { name: 'versionCode', id: 0x0101021b },
    { name: 'versionName', id: 0x0101021c },
    { name: 'targetSdkVersion', id: 0x01010270 },
    { name: 'allowBackup', id: 0x01010280 },
    { name: 'hardwareAccelerated', id: 0x010102d3 },
    { name: 'supportsRtl', id: 0x010103af },
    { name: 'usesCleartextTraffic', id: 0x010104ec }
  ];

  const otherStrings = [
    'android',
    ANDROID_NS,
    'manifest',
    'package',
    'vn.atlantis.floodai',
    '3.8.0',
    'uses-sdk',
    'uses-permission',
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'application',
    'ATLANTIS AI',
    'activity',
    'vn.atlantis.floodai.MainActivity',
    'intent-filter',
    'action',
    'android.intent.action.MAIN',
    'category',
    'android.intent.category.LAUNCHER'
  ];

  const allStrings = [...attrResTable.map((a) => a.name), ...otherStrings];
  const strIdx = (s) => {
    const idx = allStrings.indexOf(s);
    if (idx < 0) throw new Error(`Missing AXML string: ${s}`);
    return idx;
  };

  // --- Chunk 1: String Pool (UTF-16LE) ---
  const encodedStrings = allStrings.map((s) => {
    const u16 = Buffer.from(s, 'utf16le');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(s.length, 0);
    const nul = Buffer.alloc(2, 0);
    return Buffer.concat([lenBuf, u16, nul]);
  });

  const offsets = [];
  let curOffset = 0;
  for (const b of encodedStrings) {
    offsets.push(curOffset);
    curOffset += b.length;
  }
  const stringsDataRaw = Buffer.concat(encodedStrings);
  const padLen = (4 - (stringsDataRaw.length % 4)) % 4;
  const stringsData = Buffer.concat([stringsDataRaw, Buffer.alloc(padLen, 0)]);

  const stringPoolHeaderSize = 28;
  const offsetsSize = allStrings.length * 4;
  const stringsStart = stringPoolHeaderSize + offsetsSize;
  const stringPoolChunkSize = stringsStart + stringsData.length;

  const spBuf = Buffer.alloc(stringPoolChunkSize);
  spBuf.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  spBuf.writeUInt16LE(stringPoolHeaderSize, 2);
  spBuf.writeUInt32LE(stringPoolChunkSize, 4);
  spBuf.writeUInt32LE(allStrings.length, 8);
  spBuf.writeUInt32LE(0, 12); // styleCount
  spBuf.writeUInt32LE(0, 16); // flags = UTF-16
  spBuf.writeUInt32LE(stringsStart, 20);
  spBuf.writeUInt32LE(0, 24); // stylesStart
  offsets.forEach((off, i) => spBuf.writeUInt32LE(off, 28 + i * 4));
  stringsData.copy(spBuf, stringsStart);

  // --- Chunk 2: Resource Map ---
  const resMapChunkSize = 8 + attrResTable.length * 4;
  const rmBuf = Buffer.alloc(resMapChunkSize);
  rmBuf.writeUInt16LE(0x0180, 0); // RES_XML_RESOURCE_MAP_TYPE
  rmBuf.writeUInt16LE(8, 2);
  rmBuf.writeUInt32LE(resMapChunkSize, 4);
  attrResTable.forEach((a, i) => rmBuf.writeUInt32LE(a.id, 8 + i * 4));

  // Helpers cho các nút XML
  let lineNo = 1;
  const makeStartNs = (prefix, uri) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0100, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(lineNo++, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(strIdx(prefix), 16);
    b.writeInt32LE(strIdx(uri), 20);
    return b;
  };

  const makeEndNs = (prefix, uri) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0101, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(lineNo++, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(strIdx(prefix), 16);
    b.writeInt32LE(strIdx(uri), 20);
    return b;
  };

  // attr: { ns: ANDROID_NS | null, name, type, data, rawValueStr }
  const makeStartEl = (tagName, attrs = []) => {
    // Sắp xếp thuộc tính có Resource ID tăng dần, thuộc tính không có ns để cuối
    const sorted = attrs.slice().sort((a, b) => {
      const ia = a.ns ? strIdx(a.name) : 999999;
      const ib = b.ns ? strIdx(b.name) : 999999;
      return ia - ib;
    });

    const chunkSize = 36 + sorted.length * 20;
    const b = Buffer.alloc(chunkSize);
    b.writeUInt16LE(0x0102, 0); // RES_XML_START_ELEMENT_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(chunkSize, 4);
    b.writeUInt32LE(lineNo++, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(-1, 16); // elem ns
    b.writeInt32LE(strIdx(tagName), 20);
    b.writeUInt16LE(20, 24); // attributeStart
    b.writeUInt16LE(20, 26); // attributeSize
    b.writeUInt16LE(sorted.length, 28);
    b.writeUInt16LE(0, 30);
    b.writeUInt16LE(0, 32);
    b.writeUInt16LE(0, 34);

    sorted.forEach((at, i) => {
      const off = 36 + i * 20;
      b.writeInt32LE(at.ns ? strIdx(at.ns) : -1, off);
      b.writeInt32LE(strIdx(at.name), off + 4);
      b.writeInt32LE(at.rawValueStr ? strIdx(at.rawValueStr) : -1, off + 8);
      b.writeUInt16LE(8, off + 12); // size of Res_value
      b.writeUInt8(0, off + 14); // res0
      b.writeUInt8(at.type, off + 15);
      b.writeUInt32LE(at.data >>> 0, off + 16);
    });
    return b;
  };

  const makeEndEl = (tagName) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0103, 0); // RES_XML_END_ELEMENT_TYPE
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(lineNo++, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(-1, 16);
    b.writeInt32LE(strIdx(tagName), 20);
    return b;
  };

  const attrStr = (ns, name, val) => ({
    ns,
    name,
    type: 0x03, // TYPE_STRING
    data: strIdx(val),
    rawValueStr: val
  });
  const attrInt = (ns, name, val) => ({
    ns,
    name,
    type: 0x10, // TYPE_INT_DEC
    data: val >>> 0,
    rawValueStr: null
  });
  const attrHex = (ns, name, val) => ({
    ns,
    name,
    type: 0x11, // TYPE_INT_HEX
    data: val >>> 0,
    rawValueStr: null
  });
  const attrBool = (ns, name, boolVal) => ({
    ns,
    name,
    type: 0x12, // TYPE_INT_BOOLEAN
    data: boolVal ? 0xffffffff : 0,
    rawValueStr: null
  });
  const attrRef = (ns, name, refId) => ({
    ns,
    name,
    type: 0x01, // TYPE_REFERENCE
    data: refId >>> 0,
    rawValueStr: null
  });

  const xmlNodes = [
    makeStartNs('android', ANDROID_NS),
    makeStartEl('manifest', [
      attrInt(ANDROID_NS, 'versionCode', 38),
      attrStr(ANDROID_NS, 'versionName', '3.8.0'),
      attrStr(null, 'package', 'vn.atlantis.floodai')
    ]),
    makeStartEl('uses-sdk', [
      attrInt(ANDROID_NS, 'minSdkVersion', 21),
      attrInt(ANDROID_NS, 'targetSdkVersion', 28)
    ]),
    makeEndEl('uses-sdk'),
    ...[
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO'
    ].flatMap((perm) => [
      makeStartEl('uses-permission', [attrStr(ANDROID_NS, 'name', perm)]),
      makeEndEl('uses-permission')
    ]),
    makeStartEl('application', [
      attrRef(ANDROID_NS, 'theme', 0x0103012a), // @android:style/Theme.DeviceDefault.NoActionBar
      attrStr(ANDROID_NS, 'label', 'ATLANTIS AI'),
      attrBool(ANDROID_NS, 'allowBackup', true),
      attrBool(ANDROID_NS, 'hardwareAccelerated', true),
      attrBool(ANDROID_NS, 'supportsRtl', true),
      attrBool(ANDROID_NS, 'usesCleartextTraffic', true)
    ]),
    makeStartEl('activity', [
      attrStr(ANDROID_NS, 'name', 'vn.atlantis.floodai.MainActivity'),
      attrBool(ANDROID_NS, 'exported', true),
      attrInt(ANDROID_NS, 'launchMode', 2), // singleTask
      attrHex(ANDROID_NS, 'configChanges', 0x000004b4)
    ]),
    makeStartEl('intent-filter', []),
    makeStartEl('action', [attrStr(ANDROID_NS, 'name', 'android.intent.action.MAIN')]),
    makeEndEl('action'),
    makeStartEl('category', [attrStr(ANDROID_NS, 'name', 'android.intent.category.LAUNCHER')]),
    makeEndEl('category'),
    makeEndEl('intent-filter'),
    makeEndEl('activity'),
    makeEndEl('application'),
    makeEndEl('manifest'),
    makeEndNs('android', ANDROID_NS)
  ];

  const body = Buffer.concat([spBuf, rmBuf, ...xmlNodes]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);

  return Buffer.concat([header, body]);
}

// ============================================================================
// 3. TRÌNH BIÊN DỊCH DALVIK BYTECODE (classes.dex) CHO MainActivity & GeoChromeClient
// ============================================================================
function uleb128(val) {
  const bytes = [];
  let v = val >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function adler32(buf) {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function buildClassesDex() {
  // Danh sách chuỗi trong DEX (sẽ được sắp xếp theo chuẩn từ điển UTF-8)
  const rawStrings = [
    '<init>',
    'I',
    'L',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Build$VERSION;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/webkit/GeolocationPermissions$Callback;',
    'Landroid/webkit/PermissionRequest;',
    'Landroid/webkit/WebChromeClient;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'Lvn/atlantis/floodai/GeoChromeClient;',
    'Lvn/atlantis/floodai/MainActivity;',
    'SDK_INT',
    'V',
    'VJ',
    'VL',
    'VLI',
    'VLL',
    'VLZZ',
    'VZ',
    'Z',
    '[Ljava/lang/String;',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'canGoBack',
    'checkSelfPermission',
    'file:///android_asset/public/index.html',
    'getResources',
    'getSettings',
    'goBack',
    'grant',
    'invoke',
    'loadUrl',
    'onBackPressed',
    'onCreate',
    'onGeolocationPermissionsShowPrompt',
    'onPermissionRequest',
    'requestPermissions',
    'setAllowContentAccess',
    'setAllowFileAccess',
    'setAllowFileAccessFromFileURLs',
    'setAllowUniversalAccessFromFileURLs',
    'setContentView',
    'setDatabaseEnabled',
    'setDomStorageEnabled',
    'setGeolocationEnabled',
    'setJavaScriptEnabled',
    'setMediaPlaybackRequiresUserGesture',
    'setWebChromeClient',
    'setWebViewClient',
    'webView'
  ];

  const strings = Array.from(new Set(rawStrings)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sIdx = (s) => {
    const i = strings.indexOf(s);
    if (i < 0) throw new Error(`Missing DEX string: ${s}`);
    return i;
  };

  // Danh sách kiểu (Types) sắp xếp tăng dần theo descriptor string index
  const typeDescriptors = [
    'I',
    'Landroid/app/Activity;',
    'Landroid/content/Context;',
    'Landroid/os/Build$VERSION;',
    'Landroid/os/Bundle;',
    'Landroid/view/View;',
    'Landroid/webkit/GeolocationPermissions$Callback;',
    'Landroid/webkit/PermissionRequest;',
    'Landroid/webkit/WebChromeClient;',
    'Landroid/webkit/WebSettings;',
    'Landroid/webkit/WebView;',
    'Landroid/webkit/WebViewClient;',
    'Ljava/lang/Object;',
    'Ljava/lang/String;',
    'Lvn/atlantis/floodai/GeoChromeClient;',
    'Lvn/atlantis/floodai/MainActivity;',
    'V',
    'Z',
    '[Ljava/lang/String;'
  ].sort((a, b) => sIdx(a) - sIdx(b));

  const tIdx = (t) => {
    const i = typeDescriptors.indexOf(t);
    if (i < 0) throw new Error(`Missing DEX type: ${t}`);
    return i;
  };

  // Danh sách Prototype (Protos) sắp xếp theo (return_type_idx, params)
  const rawProtos = [
    { shorty: 'V', ret: 'V', params: [] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/content/Context;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/view/View;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/webkit/PermissionRequest;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/webkit/WebChromeClient;'] },
    { shorty: 'VL', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { shorty: 'VL', ret: 'V', params: ['Ljava/lang/String;'] },
    { shorty: 'VL', ret: 'V', params: ['[Ljava/lang/String;'] },
    { shorty: 'VLI', ret: 'V', params: ['[Ljava/lang/String;', 'I'] },
    { shorty: 'VLL', ret: 'V', params: ['Ljava/lang/String;', 'Landroid/webkit/GeolocationPermissions$Callback;'] },
    { shorty: 'VLZZ', ret: 'V', params: ['Ljava/lang/String;', 'Z', 'Z'] },
    { shorty: 'VZ', ret: 'V', params: ['Z'] },
    { shorty: 'I', ret: 'I', params: ['Ljava/lang/String;'] },
    { shorty: 'L', ret: 'Landroid/webkit/WebSettings;', params: [] },
    { shorty: 'L', ret: '[Ljava/lang/String;', params: [] },
    { shorty: 'Z', ret: 'Z', params: [] }
  ];

  const protos = rawProtos.slice().sort((a, b) => {
    const rDiff = tIdx(a.ret) - tIdx(b.ret);
    if (rDiff !== 0) return rDiff;
    const len = Math.min(a.params.length, b.params.length);
    for (let i = 0; i < len; i++) {
      const pDiff = tIdx(a.params[i]) - tIdx(b.params[i]);
      if (pDiff !== 0) return pDiff;
    }
    return a.params.length - b.params.length;
  });

  const pIdx = (ret, params) => {
    const i = protos.findIndex(
      (p) => p.ret === ret && p.params.length === params.length && p.params.every((x, idx) => x === params[idx])
    );
    if (i < 0) throw new Error(`Missing DEX proto: ${ret}(${params.join(',')})`);
    return i;
  };

  // Danh sách Fields sắp xếp theo (class_idx, name_idx, type_idx)
  const fields = [
    { cls: 'Landroid/os/Build$VERSION;', type: 'I', name: 'SDK_INT' },
    { cls: 'Lvn/atlantis/floodai/MainActivity;', type: 'Landroid/webkit/WebView;', name: 'webView' }
  ].sort((a, b) => {
    if (tIdx(a.cls) !== tIdx(b.cls)) return tIdx(a.cls) - tIdx(b.cls);
    if (sIdx(a.name) !== sIdx(b.name)) return sIdx(a.name) - sIdx(b.name);
    return tIdx(a.type) - tIdx(b.type);
  });

  const fIdx = (cls, name, type) => {
    const i = fields.findIndex((f) => f.cls === cls && f.name === name && f.type === type);
    if (i < 0) throw new Error(`Missing DEX field: ${cls}->${name}`);
    return i;
  };

  // Danh sách Methods sắp xếp theo (class_idx, name_idx, proto_idx)
  const rawMethods = [
    { cls: 'Landroid/app/Activity;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Landroid/app/Activity;', name: 'checkSelfPermission', ret: 'I', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/app/Activity;', name: 'onBackPressed', ret: 'V', params: [] },
    { cls: 'Landroid/app/Activity;', name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: 'Landroid/app/Activity;', name: 'requestPermissions', ret: 'V', params: ['[Ljava/lang/String;', 'I'] },
    { cls: 'Landroid/app/Activity;', name: 'setContentView', ret: 'V', params: ['Landroid/view/View;'] },
    { cls: 'Landroid/webkit/GeolocationPermissions$Callback;', name: 'invoke', ret: 'V', params: ['Ljava/lang/String;', 'Z', 'Z'] },
    { cls: 'Landroid/webkit/PermissionRequest;', name: 'getResources', ret: '[Ljava/lang/String;', params: [] },
    { cls: 'Landroid/webkit/PermissionRequest;', name: 'grant', ret: 'V', params: ['[Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebChromeClient;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowContentAccess', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowFileAccess', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowFileAccessFromFileURLs', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setAllowUniversalAccessFromFileURLs', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDatabaseEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setGeolocationEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMediaPlaybackRequiresUserGesture', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebView;', name: '<init>', ret: 'V', params: ['Landroid/content/Context;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'canGoBack', ret: 'Z', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'getSettings', ret: 'Landroid/webkit/WebSettings;', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'goBack', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'loadUrl', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebChromeClient', ret: 'V', params: ['Landroid/webkit/WebChromeClient;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebViewClient', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { cls: 'Landroid/webkit/WebViewClient;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Lvn/atlantis/floodai/GeoChromeClient;', name: '<init>', ret: 'V', params: [] },
    {
      cls: 'Lvn/atlantis/floodai/GeoChromeClient;',
      name: 'onGeolocationPermissionsShowPrompt',
      ret: 'V',
      params: ['Ljava/lang/String;', 'Landroid/webkit/GeolocationPermissions$Callback;']
    },
    {
      cls: 'Lvn/atlantis/floodai/GeoChromeClient;',
      name: 'onPermissionRequest',
      ret: 'V',
      params: ['Landroid/webkit/PermissionRequest;']
    },
    { cls: 'Lvn/atlantis/floodai/MainActivity;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Lvn/atlantis/floodai/MainActivity;', name: 'onBackPressed', ret: 'V', params: [] },
    { cls: 'Lvn/atlantis/floodai/MainActivity;', name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] }
  ];

  const methods = rawMethods.slice().sort((a, b) => {
    if (tIdx(a.cls) !== tIdx(b.cls)) return tIdx(a.cls) - tIdx(b.cls);
    if (sIdx(a.name) !== sIdx(b.name)) return sIdx(a.name) - sIdx(b.name);
    return pIdx(a.ret, a.params) - pIdx(b.ret, b.params);
  });

  const mIdx = (cls, name, ret, params) => {
    const i = methods.findIndex(
      (m) =>
        m.cls === cls &&
        m.name === name &&
        m.ret === ret &&
        m.params.length === params.length &&
        m.params.every((x, idx) => x === params[idx])
    );
    if (i < 0) throw new Error(`Missing DEX method: ${cls}->${name}`);
    return i;
  };

  // Helpers tạo lệnh Dalvik (16-bit code units)
  const insn35c = (op, count, idx, regs = []) => {
    const r = [regs[0] || 0, regs[1] || 0, regs[2] || 0, regs[3] || 0, regs[4] || 0];
    const b = Buffer.alloc(6);
    b.writeUInt8(op, 0);
    b.writeUInt8(((count & 0x0f) << 4) | (r[4] & 0x0f), 1);
    b.writeUInt16LE(idx, 2);
    b.writeUInt8((r[0] & 0x0f) | ((r[1] & 0x0f) << 4), 4);
    b.writeUInt8((r[2] & 0x0f) | ((r[3] & 0x0f) << 4), 5);
    return b;
  };
  const insn21c = (op, regA, idx) => {
    const b = Buffer.alloc(4);
    b.writeUInt8(op, 0);
    b.writeUInt8(regA & 0xff, 1);
    b.writeUInt16LE(idx, 2);
    return b;
  };
  const insn22c = (op, regA, regB, idx) => {
    const b = Buffer.alloc(4);
    b.writeUInt8(op, 0);
    b.writeUInt8((regA & 0x0f) | ((regB & 0x0f) << 4), 1);
    b.writeUInt16LE(idx, 2);
    return b;
  };
  const insn11n = (op, regA, lit4) => Buffer.from([op, (regA & 0x0f) | ((lit4 & 0x0f) << 4)]);
  const insn11x = (op, regA) => Buffer.from([op, regA & 0xff]);
  const insn10x = (op) => Buffer.from([op, 0x00]);
  const insn21t = (op, regA, branchOffsetUnits) => {
    const b = Buffer.alloc(4);
    b.writeUInt8(op, 0);
    b.writeUInt8(regA & 0xff, 1);
    b.writeInt16LE(branchOffsetUnits, 2);
    return b;
  };

  const makeCodeItem = (registersSize, insSize, outsSize, insnBuf) => {
    const insnsUnits = insnBuf.length / 2;
    const header = Buffer.alloc(16);
    header.writeUInt16LE(registersSize, 0);
    header.writeUInt16LE(insSize, 2);
    header.writeUInt16LE(outsSize, 4);
    header.writeUInt16LE(0, 6); // tries_size
    header.writeUInt32LE(0, 8); // debug_info_off
    header.writeUInt32LE(insnsUnits, 12);
    const raw = Buffer.concat([header, insnBuf]);
    const pad = (4 - (raw.length % 4)) % 4;
    return Buffer.concat([raw, Buffer.alloc(pad, 0)]);
  };

  // --- Bytecode cho GeoChromeClient ---
  // 1) GeoChromeClient.<init>()V (regs=1, ins=1, outs=1)
  const codeGeoInit = makeCodeItem(
    1,
    1,
    1,
    Buffer.concat([
      insn35c(0x70, 1, mIdx('Landroid/webkit/WebChromeClient;', '<init>', 'V', []), [0]),
      insn10x(0x0e)
    ])
  );

  // 2) GeoChromeClient.onGeolocationPermissionsShowPrompt(String, Callback)V (regs=5, ins=3, outs=4)
  // p0=v2, p1(origin)=v3, p2(callback)=v4; v0=1(true), v1=0(false)
  const codeGeoPrompt = makeCodeItem(
    5,
    3,
    4,
    Buffer.concat([
      insn11n(0x12, 0, 1), // const/4 v0, 1
      insn11n(0x12, 1, 0), // const/4 v1, 0
      insn35c(
        0x72, // invoke-interface
        4,
        mIdx('Landroid/webkit/GeolocationPermissions$Callback;', 'invoke', 'V', ['Ljava/lang/String;', 'Z', 'Z']),
        [4, 3, 0, 1]
      ),
      insn10x(0x0e)
    ])
  );

  // 3) GeoChromeClient.onPermissionRequest(PermissionRequest)V (regs=3, ins=2, outs=2)
  // p0=v1, p1(req)=v2
  const codeGeoPermReq = makeCodeItem(
    3,
    2,
    2,
    Buffer.concat([
      insn35c(0x6e, 1, mIdx('Landroid/webkit/PermissionRequest;', 'getResources', '[Ljava/lang/String;', []), [2]),
      insn11x(0x0c, 0), // move-result-object v0
      insn35c(0x6e, 2, mIdx('Landroid/webkit/PermissionRequest;', 'grant', 'V', ['[Ljava/lang/String;']), [2, 0]),
      insn10x(0x0e)
    ])
  );

  // --- Bytecode cho MainActivity ---
  // 4) MainActivity.<init>()V (regs=1, ins=1, outs=1)
  const codeMainInit = makeCodeItem(
    1,
    1,
    1,
    Buffer.concat([
      insn35c(0x70, 1, mIdx('Landroid/app/Activity;', '<init>', 'V', []), [0]),
      insn10x(0x0e)
    ])
  );

  // 5) MainActivity.onCreate(Bundle)V (regs=6, ins=2, outs=2)
  // p0(this)=v4, p1(bundle)=v5
  const codeMainOnCreate = makeCodeItem(
    6,
    2,
    2,
    Buffer.concat([
      // super.onCreate(savedInstanceState)
      insn35c(0x6f, 2, mIdx('Landroid/app/Activity;', 'onCreate', 'V', ['Landroid/os/Bundle;']), [4, 5]),
      // v0 = new WebView(this)
      insn21c(0x22, 0, tIdx('Landroid/webkit/WebView;')),
      insn35c(0x70, 2, mIdx('Landroid/webkit/WebView;', '<init>', 'V', ['Landroid/content/Context;']), [0, 4]),
      // this.webView = v0
      insn22c(0x5b, 0, 4, fIdx('Lvn/atlantis/floodai/MainActivity;', 'webView', 'Landroid/webkit/WebView;')),
      // this.setContentView(v0)
      insn35c(0x6e, 2, mIdx('Landroid/app/Activity;', 'setContentView', 'V', ['Landroid/view/View;']), [4, 0]),
      // v1 = v0.getSettings()
      insn35c(0x6e, 1, mIdx('Landroid/webkit/WebView;', 'getSettings', 'Landroid/webkit/WebSettings;', []), [0]),
      insn11x(0x0c, 1),
      // v2 = 1 (true), v3 = 0 (false)
      insn11n(0x12, 2, 1),
      insn11n(0x12, 3, 0),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setDatabaseEnabled', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setGeolocationEnabled', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setAllowFileAccess', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setAllowContentAccess', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setAllowFileAccessFromFileURLs', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setAllowUniversalAccessFromFileURLs', 'V', ['Z']), [1, 2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebSettings;', 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']), [1, 3]),
      // v2 = new WebViewClient(); v0.setWebViewClient(v2)
      insn21c(0x22, 2, tIdx('Landroid/webkit/WebViewClient;')),
      insn35c(0x70, 1, mIdx('Landroid/webkit/WebViewClient;', '<init>', 'V', []), [2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebView;', 'setWebViewClient', 'V', ['Landroid/webkit/WebViewClient;']), [0, 2]),
      // v2 = new GeoChromeClient(); v0.setWebChromeClient(v2)
      insn21c(0x22, 2, tIdx('Lvn/atlantis/floodai/GeoChromeClient;')),
      insn35c(0x70, 1, mIdx('Lvn/atlantis/floodai/GeoChromeClient;', '<init>', 'V', []), [2]),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebView;', 'setWebChromeClient', 'V', ['Landroid/webkit/WebChromeClient;']), [0, 2]),
      // v2 = "file:///android_asset/public/index.html"; v0.loadUrl(v2)
      insn21c(0x1a, 2, sIdx('file:///android_asset/public/index.html')),
      insn35c(0x6e, 2, mIdx('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']), [0, 2]),
      insn10x(0x0e)
    ])
  );

  // 6) MainActivity.onBackPressed()V (regs=3, ins=1, outs=1)
  // p0(this)=v2
  // 0000: iget-object v0, v2, MainActivity.webView (2 units)
  // 0002: if-eqz v0, +10 (to 000c) (2 units)
  // 0004: invoke-virtual {v0}, WebView.canGoBack()Z (3 units)
  // 0007: move-result v1 (1 unit)
  // 0008: if-eqz v1, +4 (to 000c) (2 units)
  // 000a: invoke-virtual {v0}, WebView.goBack()V (3 units) -- wait: 0004+3=0007, +1=0008, +2=000a, +3=000d, +1=000e!
  // Let's check exact unit offsets:
  // 0: iget-object (2 units) -> next=2
  // 2: if-eqz v0, +12 (jumps to 2+12 = 14) (2 units) -> next=4
  // 4: invoke-virtual canGoBack (3 units) -> next=7
  // 7: move-result v1 (1 unit) -> next=8
  // 8: if-eqz v1, +6 (jumps to 8+6 = 14) (2 units) -> next=10
  // 10: invoke-virtual goBack (3 units) -> next=13
  // 13: return-void (1 unit) -> next=14
  // 14: invoke-super onBackPressed (3 units) -> next=17
  // 17: return-void (1 unit) -> total=18 units
  const codeMainBack = makeCodeItem(
    3,
    1,
    1,
    Buffer.concat([
      insn22c(0x54, 0, 2, fIdx('Lvn/atlantis/floodai/MainActivity;', 'webView', 'Landroid/webkit/WebView;')),
      insn21t(0x38, 0, 12),
      insn35c(0x6e, 1, mIdx('Landroid/webkit/WebView;', 'canGoBack', 'Z', []), [0]),
      insn11x(0x0a, 1),
      insn21t(0x38, 1, 6),
      insn35c(0x6e, 1, mIdx('Landroid/webkit/WebView;', 'goBack', 'V', []), [0]),
      insn10x(0x0e),
      insn35c(0x6f, 1, mIdx('Landroid/app/Activity;', 'onBackPressed', 'V', []), [2]),
      insn10x(0x0e)
    ])
  );

  // --- Lắp ráp bố cục file DEX ---
  // Header: 112 bytes (0x70)
  const headerSize = 0x70;
  const stringIdsSize = strings.length * 4;
  const typeIdsSize = typeDescriptors.length * 4;
  const protoIdsSize = protos.length * 12;
  const fieldIdsSize = fields.length * 8;
  const methodIdsSize = methods.length * 8;
  const classDefsSize = 2 * 32; // 2 classes: GeoChromeClient, MainActivity

  const stringIdsOff = headerSize;
  const typeIdsOff = stringIdsOff + stringIdsSize;
  const protoIdsOff = typeIdsOff + typeIdsSize;
  const fieldIdsOff = protoIdsOff + protoIdsSize;
  const methodIdsOff = fieldIdsOff + fieldIdsSize;
  const classDefsOff = methodIdsOff + methodIdsSize;
  const dataOff = classDefsOff + classDefsSize;

  let curOff = dataOff;
  const chunks = [];
  const pushChunk = (buf, align = 1) => {
    if (align > 1) {
      const pad = (align - (curOff % align)) % align;
      if (pad > 0) {
        chunks.push(Buffer.alloc(pad, 0));
        curOff += pad;
      }
    }
    const off = curOff;
    chunks.push(buf);
    curOff += buf.length;
    return off;
  };

  // 1. type_list (cho các proto có tham số)
  const uniqueParamKeys = new Map();
  const protoParamsOff = protos.map((p) => {
    if (p.params.length === 0) return 0;
    const key = p.params.join('|');
    if (uniqueParamKeys.has(key)) return uniqueParamKeys.get(key);
    const b = Buffer.alloc(4 + p.params.length * 2);
    b.writeUInt32LE(p.params.length, 0);
    p.params.forEach((pt, idx) => b.writeUInt16LE(tIdx(pt), 4 + idx * 2));
    const off = pushChunk(b, 4);
    uniqueParamKeys.set(key, off);
    return off;
  });

  // 2. code_item (4-byte aligned)
  const offCodeGeoInit = pushChunk(codeGeoInit, 4);
  const offCodeGeoPrompt = pushChunk(codeGeoPrompt, 4);
  const offCodeGeoPerm = pushChunk(codeGeoPermReq, 4);
  const offCodeMainInit = pushChunk(codeMainInit, 4);
  const offCodeMainCreate = pushChunk(codeMainOnCreate, 4);
  const offCodeMainBack = pushChunk(codeMainBack, 4);

  // 3. string_data_item
  const stringDataOffs = strings.map((s) => {
    const utf8 = Buffer.from(s, 'utf8');
    const lenUleb = uleb128(s.length);
    const b = Buffer.concat([lenUleb, utf8, Buffer.from([0])]);
    return pushChunk(b, 1);
  });

  // 4. class_data_item
  const encodeClassData = (staticFields, instanceFields, directMethods, virtualMethods) => {
    const parts = [
      uleb128(staticFields.length),
      uleb128(instanceFields.length),
      uleb128(directMethods.length),
      uleb128(virtualMethods.length)
    ];
    let prevF = 0;
    for (const f of instanceFields) {
      parts.push(uleb128(f.fieldIdx - prevF), uleb128(f.accessFlags));
      prevF = f.fieldIdx;
    }
    let prevM = 0;
    for (const m of directMethods) {
      parts.push(uleb128(m.methodIdx - prevM), uleb128(m.accessFlags), uleb128(m.codeOff));
      prevM = m.methodIdx;
    }
    prevM = 0;
    for (const m of virtualMethods) {
      parts.push(uleb128(m.methodIdx - prevM), uleb128(m.accessFlags), uleb128(m.codeOff));
      prevM = m.methodIdx;
    }
    return Buffer.concat(parts);
  };

  const geoClassDataOff = pushChunk(
    encodeClassData(
      [],
      [],
      [
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/GeoChromeClient;', '<init>', 'V', []),
          accessFlags: 0x10001, // ACC_PUBLIC | ACC_CONSTRUCTOR
          codeOff: offCodeGeoInit
        }
      ],
      [
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/GeoChromeClient;', 'onGeolocationPermissionsShowPrompt', 'V', [
            'Ljava/lang/String;',
            'Landroid/webkit/GeolocationPermissions$Callback;'
          ]),
          accessFlags: 0x0001, // ACC_PUBLIC
          codeOff: offCodeGeoPrompt
        },
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/GeoChromeClient;', 'onPermissionRequest', 'V', [
            'Landroid/webkit/PermissionRequest;'
          ]),
          accessFlags: 0x0001, // ACC_PUBLIC
          codeOff: offCodeGeoPerm
        }
      ].sort((a, b) => a.methodIdx - b.methodIdx)
    ),
    1
  );

  const mainClassDataOff = pushChunk(
    encodeClassData(
      [],
      [
        {
          fieldIdx: fIdx('Lvn/atlantis/floodai/MainActivity;', 'webView', 'Landroid/webkit/WebView;'),
          accessFlags: 0x0002 // ACC_PRIVATE
        }
      ],
      [
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/MainActivity;', '<init>', 'V', []),
          accessFlags: 0x10001, // ACC_PUBLIC | ACC_CONSTRUCTOR
          codeOff: offCodeMainInit
        }
      ],
      [
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/MainActivity;', 'onBackPressed', 'V', []),
          accessFlags: 0x0001, // ACC_PUBLIC
          codeOff: offCodeMainBack
        },
        {
          methodIdx: mIdx('Lvn/atlantis/floodai/MainActivity;', 'onCreate', 'V', ['Landroid/os/Bundle;']),
          accessFlags: 0x0004, // ACC_PROTECTED
          codeOff: offCodeMainCreate
        }
      ].sort((a, b) => a.methodIdx - b.methodIdx)
    ),
    1
  );

  // 5. map_list (4-byte aligned, nằm cuối vùng data)
  const mapEntries = [
    { type: 0x0000, size: 1, offset: 0 },
    { type: 0x0001, size: strings.length, offset: stringIdsOff },
    { type: 0x0002, size: typeDescriptors.length, offset: typeIdsOff },
    { type: 0x0003, size: protos.length, offset: protoIdsOff },
    { type: 0x0004, size: fields.length, offset: fieldIdsOff },
    { type: 0x0005, size: methods.length, offset: methodIdsOff },
    { type: 0x0006, size: 2, offset: classDefsOff },
    { type: 0x1001, size: uniqueParamKeys.size, offset: dataOff },
    { type: 0x2001, size: 6, offset: offCodeGeoInit },
    { type: 0x2002, size: strings.length, offset: stringDataOffs[0] },
    { type: 0x2000, size: 2, offset: geoClassDataOff },
    { type: 0x1000, size: 1, offset: 0 } // placeholder cho chính mapOff
  ];
  const mapBuf = Buffer.alloc(4 + mapEntries.length * 12);
  const mapOff = pushChunk(mapBuf, 4);
  mapEntries[mapEntries.length - 1].offset = mapOff;
  mapBuf.writeUInt32LE(mapEntries.length, 0);
  mapEntries.forEach((m, i) => {
    const o = 4 + i * 12;
    mapBuf.writeUInt16LE(m.type, o);
    mapBuf.writeUInt16LE(0, o + 2);
    mapBuf.writeUInt32LE(m.size, o + 4);
    mapBuf.writeUInt32LE(m.offset, o + 8);
  });

  const fileSize = curOff;
  const dex = Buffer.alloc(fileSize, 0);

  // Ghi các bảng cố định
  stringDataOffs.forEach((off, i) => dex.writeUInt32LE(off, stringIdsOff + i * 4));
  typeDescriptors.forEach((t, i) => dex.writeUInt32LE(sIdx(t), typeIdsOff + i * 4));
  protos.forEach((p, i) => {
    const o = protoIdsOff + i * 12;
    dex.writeUInt32LE(sIdx(p.shorty), o);
    dex.writeUInt32LE(tIdx(p.ret), o + 4);
    dex.writeUInt32LE(protoParamsOff[i], o + 8);
  });
  fields.forEach((f, i) => {
    const o = fieldIdsOff + i * 8;
    dex.writeUInt16LE(tIdx(f.cls), o);
    dex.writeUInt16LE(tIdx(f.type), o + 2);
    dex.writeUInt32LE(sIdx(f.name), o + 4);
  });
  methods.forEach((m, i) => {
    const o = methodIdsOff + i * 8;
    dex.writeUInt16LE(tIdx(m.cls), o);
    dex.writeUInt16LE(pIdx(m.ret, m.params), o + 2);
    dex.writeUInt32LE(sIdx(m.name), o + 4);
  });

  // Ghi 2 class_def_item
  const writeClassDef = (idx, clsDesc, superDesc, classDataOffset) => {
    const o = classDefsOff + idx * 32;
    dex.writeUInt32LE(tIdx(clsDesc), o);
    dex.writeUInt32LE(0x0001, o + 4); // ACC_PUBLIC
    dex.writeUInt32LE(tIdx(superDesc), o + 8);
    dex.writeUInt32LE(0, o + 12); // interfaces_off
    dex.writeInt32LE(-1, o + 16); // source_file_idx = NO_INDEX
    dex.writeUInt32LE(0, o + 20); // annotations_off
    dex.writeUInt32LE(classDataOffset, o + 24);
    dex.writeUInt32LE(0, o + 28); // static_values_off
  };
  writeClassDef(0, 'Lvn/atlantis/floodai/GeoChromeClient;', 'Landroid/webkit/WebChromeClient;', geoClassDataOff);
  writeClassDef(1, 'Lvn/atlantis/floodai/MainActivity;', 'Landroid/app/Activity;', mainClassDataOff);

  // Copy vùng data
  Buffer.concat(chunks).copy(dex, dataOff);

  // Ghi Header DEX
  Buffer.from('dex\n035\0', 'ascii').copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(headerSize, 36);
  dex.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
  dex.writeUInt32LE(0, 44); // link_size
  dex.writeUInt32LE(0, 48); // link_off
  dex.writeUInt32LE(mapOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(typeDescriptors.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(fields.length, 80);
  dex.writeUInt32LE(fieldIdsOff, 84);
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(2, 96);
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(fileSize - dataOff, 104);
  dex.writeUInt32LE(dataOff, 108);

  // Tính SHA-1 signature (bytes 32..end) và Adler32 checksum (bytes 12..end)
  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);
  const chk = adler32(dex.subarray(12));
  dex.writeUInt32LE(chk, 8);

  return dex;
}

// ============================================================================
// 4. TẠO CHỨNG CHỈ X.509 DER & CHỮ KÝ SỐ PKCS#7 (v1) + APK SIGNATURE SCHEME V2
// ============================================================================
function asn1Len(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let v = len;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function asn1Tag(tag, content) {
  return Buffer.concat([Buffer.from([tag]), asn1Len(content.length), content]);
}
function asn1Seq(...items) {
  return asn1Tag(0x30, Buffer.concat(items));
}
function asn1Set(...items) {
  return asn1Tag(0x31, Buffer.concat(items));
}
function asn1Int(bufOrNum) {
  let b = typeof bufOrNum === 'number' ? Buffer.from([bufOrNum]) : Buffer.from(bufOrNum);
  while (b.length > 1 && b[0] === 0 && (b[1] & 0x80) === 0) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return asn1Tag(0x02, b);
}
function asn1Oid(oidBytes) {
  return asn1Tag(0x06, Buffer.from(oidBytes));
}
function asn1UtcTime(str) {
  return asn1Tag(0x17, Buffer.from(str, 'ascii'));
}
function asn1Utf8(str) {
  return asn1Tag(0x0c, Buffer.from(str, 'utf8'));
}
function asn1BitString(buf) {
  return asn1Tag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}
function asn1OctetString(buf) {
  return asn1Tag(0x04, buf);
}

function generateSigningCredentials() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001
  });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });

  // OID sha256WithRSAEncryption: 1.2.840.113549.1.1.11
  const algSha256Rsa = asn1Seq(
    asn1Oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
    Buffer.from([0x05, 0x00])
  );
  // CN=Atlantis AI Android
  const rdnCn = asn1Set(asn1Seq(asn1Oid([0x55, 0x04, 0x03]), asn1Utf8('Atlantis AI Android')));
  const nameSeq = asn1Seq(rdnCn);
  const validity = asn1Seq(asn1UtcTime('250101000000Z'), asn1UtcTime('491231235959Z'));
  const serial = Buffer.from([0x01, 0x20, 0x26, 0x11, 0x09]);

  const tbsCert = asn1Seq(
    asn1Tag(0xa0, asn1Int(2)), // v3
    asn1Int(serial),
    algSha256Rsa,
    nameSeq,
    validity,
    nameSeq,
    spkiDer
  );

  const sig = crypto.sign('sha256', tbsCert, privateKey);
  const certDer = asn1Seq(tbsCert, algSha256Rsa, asn1BitString(sig));

  return { privateKey, certDer, nameSeq, serial };
}

function buildPkcs7CertRsa(sfBytes, creds) {
  const sig = crypto.sign('sha256', sfBytes, creds.privateKey);
  // OID data: 1.2.840.113549.1.7.1
  const oidData = asn1Oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01]);
  // OID signedData: 1.2.840.113549.1.7.2
  const oidSignedData = asn1Oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);
  // OID sha256: 2.16.840.1.101.3.4.2.1
  const algSha256 = asn1Seq(
    asn1Oid([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]),
    Buffer.from([0x05, 0x00])
  );
  // OID rsaEncryption: 1.2.840.113549.1.1.1
  const algRsa = asn1Seq(
    asn1Oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
    Buffer.from([0x05, 0x00])
  );

  const signerInfo = asn1Seq(
    asn1Int(1),
    asn1Seq(creds.nameSeq, asn1Int(creds.serial)),
    algSha256,
    algRsa,
    asn1OctetString(sig)
  );

  const signedData = asn1Seq(
    asn1Int(1),
    asn1Set(algSha256),
    asn1Seq(oidData),
    asn1Tag(0xa0, creds.certDer),
    asn1Set(signerInfo)
  );

  return asn1Seq(oidSignedData, asn1Tag(0xa0, signedData));
}

// ============================================================================
// 5. ĐÓNG GÓI ZIP + CHỮ KÝ APK SIGNATURE SCHEME V2 (APK Sig Block 42)
// ============================================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function computeApkV2ContentDigest(sections) {
  const CHUNK_SIZE = 1024 * 1024;
  const chunkDigests = [];
  for (const sec of sections) {
    let offset = 0;
    while (offset < sec.length) {
      const slice = sec.subarray(offset, Math.min(offset + CHUNK_SIZE, sec.length));
      const hdr = Buffer.alloc(5);
      hdr.writeUInt8(0xa5, 0);
      hdr.writeUInt32LE(slice.length, 1);
      chunkDigests.push(crypto.createHash('sha256').update(hdr).update(slice).digest());
      offset += slice.length;
    }
  }
  const topHdr = Buffer.alloc(5);
  topHdr.writeUInt8(0x5a, 0);
  topHdr.writeUInt32LE(chunkDigests.length, 1);
  return crypto
    .createHash('sha256')
    .update(topHdr)
    .update(Buffer.concat(chunkDigests))
    .digest();
}

function lenPrefixed(buf) {
  const l = Buffer.alloc(4);
  l.writeUInt32LE(buf.length, 0);
  return Buffer.concat([l, buf]);
}

function buildApkSigningBlockV2(beforeCentralDir, centralDir, eocdTemplate, creds) {
  // eocdForDigest: trong tính toán digest v2, trường offset của Central Directory tại byte 16..20 của EOCD
  // phải giữ nguyên giá trị bằng beforeCentralDir.length (trước khi chèn khối APK Sig Block)
  const eocdForDigest = Buffer.from(eocdTemplate);
  eocdForDigest.writeUInt32LE(beforeCentralDir.length, 16);

  const digest = computeApkV2ContentDigest([beforeCentralDir, centralDir, eocdForDigest]);

  // Signature Algorithm ID: 0x0103 = SIGNATURE_RSA_PKCS1_V1_5_WITH_SHA256
  const algIdBuf = Buffer.alloc(4);
  algIdBuf.writeUInt32LE(0x0103, 0);

  const digestEntry = lenPrefixed(Buffer.concat([algIdBuf, lenPrefixed(digest)]));
  const digestsSeq = lenPrefixed(digestEntry);
  const certsSeq = lenPrefixed(lenPrefixed(creds.certDer));
  const attrsSeq = lenPrefixed(Buffer.alloc(0));

  const signedData = Buffer.concat([digestsSeq, certsSeq, attrsSeq]);
  const sigBytes = crypto.sign('sha256', signedData, creds.privateKey);

  const sigEntry = lenPrefixed(Buffer.concat([algIdBuf, lenPrefixed(sigBytes)]));
  const signaturesSeq = lenPrefixed(sigEntry);
  const publicKeySpki = creds.privateKey
    ? crypto.createPublicKey(creds.privateKey).export({ type: 'spki', format: 'der' })
    : Buffer.alloc(0);

  const signer = lenPrefixed(Buffer.concat([lenPrefixed(signedData), signaturesSeq, lenPrefixed(publicKeySpki)]));
  const signersSeq = lenPrefixed(signer);

  // Pair ID 0x7109871a (APK Signature Scheme v2 Block)
  const pairValue = signersSeq;
  const pairLen = 4 + pairValue.length;
  const pairHeader = Buffer.alloc(12);
  pairHeader.writeBigUInt64LE(BigInt(pairLen), 0);
  pairHeader.writeUInt32LE(0x7109871a, 8);
  const pairBuf = Buffer.concat([pairHeader, pairValue]);

  // Căn lề khối APK Signing Block bội số 4096 bytes để tối ưu trên Android mới
  const baseBlockSize = 8 + pairBuf.length + 8 + 16;
  const padNeeded = (4096 - (baseBlockSize % 4096)) % 4096;
  let paddingPair = Buffer.alloc(0);
  if (padNeeded >= 12) {
    const padValLen = padNeeded - 12;
    const padHdr = Buffer.alloc(12);
    padHdr.writeBigUInt64LE(BigInt(4 + padValLen), 0);
    padHdr.writeUInt32LE(0x42726577, 8); // VERITY_PADDING_BLOCK_ID
    paddingPair = Buffer.concat([padHdr, Buffer.alloc(padValLen, 0)]);
  }

  const pairsAll = Buffer.concat([pairBuf, paddingPair]);
  const sizeOfBlockField = BigInt(pairsAll.length + 8 + 16);

  const headSizeBuf = Buffer.alloc(8);
  headSizeBuf.writeBigUInt64LE(sizeOfBlockField, 0);
  const tailSizeBuf = Buffer.alloc(8);
  tailSizeBuf.writeBigUInt64LE(sizeOfBlockField, 0);
  const magicBuf = Buffer.from('APK Sig Block 42', 'ascii');

  return Buffer.concat([headSizeBuf, pairsAll, tailSizeBuf, magicBuf]);
}

function buildSignedApk(entries, creds) {
  // Bước 1: Tạo META-INF/MANIFEST.MF, META-INF/CERT.SF, META-INF/CERT.RSA (Chữ ký v1 JAR)
  const manifestLines = ['Manifest-Version: 1.0', 'Created-By: Atlantis AI APK Builder', ''];
  for (const e of entries) {
    const sha = crypto.createHash('sha256').update(e.data).digest('base64');
    manifestLines.push(`Name: ${e.name}`, `SHA-256-Digest: ${sha}`, '');
  }
  const mfBytes = Buffer.from(manifestLines.join('\r\n'), 'utf8');

  const mfFullDigest = crypto.createHash('sha256').update(mfBytes).digest('base64');
  const sfLines = [
    'Signature-Version: 1.0',
    'Created-By: Atlantis AI APK Builder',
    `SHA-256-Digest-Manifest: ${mfFullDigest}`,
    ''
  ];
  for (const e of entries) {
    const sectionStr = `Name: ${e.name}\r\nSHA-256-Digest: ${crypto.createHash('sha256').update(e.data).digest('base64')}\r\n\r\n`;
    const secDigest = crypto.createHash('sha256').update(Buffer.from(sectionStr, 'utf8')).digest('base64');
    sfLines.push(`Name: ${e.name}`, `SHA-256-Digest: ${secDigest}`, '');
  }
  const sfBytes = Buffer.from(sfLines.join('\r\n'), 'utf8');
  const rsaBytes = buildPkcs7CertRsa(sfBytes, creds);

  const allEntries = [
    ...entries,
    { name: 'META-INF/MANIFEST.MF', data: mfBytes, store: false },
    { name: 'META-INF/CERT.SF', data: sfBytes, store: false },
    { name: 'META-INF/CERT.RSA', data: rsaBytes, store: false }
  ];

  // Bước 2: Đóng gói Local File Headers (căn chỉnh 4-byte cho các file lưu không nén)
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  for (const item of allEntries) {
    const nameBuf = Buffer.from(item.name, 'utf8');
    const uncompressedSize = item.data.length;
    const crc = crc32(item.data);
    const compressedData = item.store ? item.data : zlib.deflateRawSync(item.data, { level: 9 });
    const method = item.store ? 0 : 8;

    // Căn lề 4-byte (zipalign) cho các entry không nén
    let extraLen = 0;
    if (item.store) {
      const dataStart = offset + 30 + nameBuf.length;
      extraLen = (4 - (dataStart % 4)) % 4;
    }
    const extraBuf = Buffer.alloc(extraLen, 0);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0x0000, 10); // mod time
    lfh.writeUInt16LE(0x5421, 12); // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressedData.length, 18);
    lfh.writeUInt32LE(uncompressedSize, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(extraBuf.length, 28);

    const localEntry = Buffer.concat([lfh, nameBuf, extraBuf, compressedData]);
    localChunks.push(localEntry);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0x0000, 12);
    cdh.writeUInt16LE(0x5421, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressedData.length, 20);
    cdh.writeUInt32LE(uncompressedSize, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra len in CD
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34); // disk
    cdh.writeUInt16LE(0, 36); // int attrs
    cdh.writeUInt32LE(0, 38); // ext attrs
    cdh.writeUInt32LE(offset, 42); // local header offset

    cdChunks.push(Buffer.concat([cdh, nameBuf]));
    offset += localEntry.length;
  }

  const beforeCentralDir = Buffer.concat(localChunks);
  const centralDir = Buffer.concat(cdChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(allEntries.length, 8);
  eocd.writeUInt16LE(allEntries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(beforeCentralDir.length, 16);
  eocd.writeUInt16LE(0, 20);

  // Bước 3: Chèn khối chữ ký APK Signature Scheme v2 ngay trước Central Directory
  const v2SigBlock = buildApkSigningBlockV2(beforeCentralDir, centralDir, eocd, creds);
  eocd.writeUInt32LE(beforeCentralDir.length + v2SigBlock.length, 16);

  return Buffer.concat([beforeCentralDir, v2SigBlock, centralDir, eocd]);
}

// ============================================================================
// 6. CHẠY QUY TRÌNH ĐÓNG GÓI VÀ XUẤT FILE ATLANTIS-AI.apk
// ============================================================================
function main() {
  console.log('🔄 1/4: Đồng bộ mã nguồn web mới nhất vào thư mục đóng gói Android...');
  const webFiles = syncWebAssets();

  console.log('🔄 2/4: Biên dịch nhị phân AndroidManifest.xml (AXML) và Dalvik Bytecode (classes.dex)...');
  const axmlBuf = buildBinaryAndroidManifest();
  const dexBuf = buildClassesDex();

  const entries = [
    { name: 'AndroidManifest.xml', data: axmlBuf, store: true },
    { name: 'classes.dex', data: dexBuf, store: true }
  ];

  for (const rel of webFiles) {
    const zipName = 'assets/public/' + rel.replace(/\\/g, '/');
    const data = fs.readFileSync(path.join(ROOT, rel));
    entries.push({ name: zipName, data, store: false });
  }

  console.log('🔄 3/4: Tạo khóa RSA-2048 & ký số kép (JAR v1 PKCS#7 + APK Signature Scheme v2)...');
  const creds = generateSigningCredentials();
  const apkBuf = buildSignedApk(entries, creds);

  const outApkPath = path.join(ROOT, 'ATLANTIS-AI.apk');
  fs.writeFileSync(outApkPath, apkBuf);

  const outDebugDir = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug');
  fs.mkdirSync(outDebugDir, { recursive: true });
  fs.writeFileSync(path.join(outDebugDir, 'app-debug.apk'), apkBuf);

  console.log('================================================================');
  console.log('✅ 4/4: ĐÃ XUẤT THÀNH CÔNG FILE CÀI ĐẶT ANDROID APK!');
  console.log(`📦 Đường dẫn chính: ${outApkPath}`);
  console.log(`📦 Bản sao Gradle:  ${path.join(outDebugDir, 'app-debug.apk')}`);
  console.log(`📏 Dung lượng APK:  ${(apkBuf.length / 1024).toFixed(1)} KB`);
  console.log('================================================================');
}

main();
