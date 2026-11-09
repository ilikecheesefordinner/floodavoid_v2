/**
 * ATLANTIS - Mô-đun AI Thủy Văn Đa Biến & Đồng bộ Dữ liệu Quan trắc Thực tế
 * Tính toán độ sâu ngập dựa trên:
 * 1. Lưu lượng mưa I (mm/h)
 * 2. Thời gian mưa kéo dài t (phút)
 * 3. Mực nước sông thực tế H_river (m) -> Hiệu ứng nước dâng cản thoát nước (Backwater Effect)
 * 4. Đồng bộ API thực tế từ Open-Meteo, GloFAS & HSDC Hà Nội (/ungngap/api/flood/getflood)
 */

window.HydroAI = {
  async fetchPublicWeatherAndRiver(cityConfig) {
    const [lat, lng] = cityConfig.center;
    const rs = cityConfig.riverStation;
    const result = {
      liveRainMm: 0,
      liveTempC: 28,
      humidity: 78,
      windSpeedKmh: 10,
      riverDischargeM3s: 140,
      estimatedRiverLevelM: rs.currentRealLevelM || rs.normalLevelM,
      hsdcActiveFloodMap: {},
      sourceStatus: 'LIVE_PUBLIC_API'
    };

    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,wind_speed_10m&timezone=Asia%2FBangkok`;
      const floodUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lng}&daily=river_discharge&forecast_days=1`;

      const tasks = [
        fetch(weatherUrl).then((r) => r.json()),
        fetch(floodUrl).then((r) => r.json())
      ];

      // Nếu đang ở Hà Nội, gọi thêm API 45 trạm giám sát ngập thực tế của Công ty Thoát nước Hà Nội (HSDC)
      if (cityConfig.id === 'hanoi') {
        tasks.push(
          fetch('/api/hanoi-flood-live')
            .then((r) => r.json())
            .catch(() => null)
        );
      }

      const [weatherRes, floodRes, hsdcRes] = await Promise.allSettled(tasks);

      if (weatherRes.status === 'fulfilled' && weatherRes.value && weatherRes.value.current) {
        const cur = weatherRes.value.current;
        result.liveRainMm = Number((cur.precipitation || cur.rain || 0).toFixed(1));
        result.liveTempC = Math.round(cur.temperature_2m ?? 28);
        result.humidity = Math.round(cur.relative_humidity_2m ?? 78);
        result.windSpeedKmh = Math.round(cur.wind_speed_10m ?? 10);
      }

      if (floodRes.status === 'fulfilled' && floodRes.value && floodRes.value.daily) {
        const discharges = floodRes.value.daily.river_discharge;
        if (Array.isArray(discharges) && discharges.length > 0 && discharges[0] != null) {
          result.riverDischargeM3s = Math.round(discharges[0]);
          const normalizedRatio = Math.min(1.0, Math.max(0, Math.log10(Math.max(10, result.riverDischargeM3s)) / 3.8));
          result.estimatedRiverLevelM = Number(
            (rs.normalLevelM + (rs.criticalLevelM - rs.normalLevelM) * normalizedRatio * 0.55).toFixed(2)
          );
        }
      }

      if (
        hsdcRes &&
        hsdcRes.status === 'fulfilled' &&
        hsdcRes.value &&
        Array.isArray(hsdcRes.value.Content)
      ) {
        hsdcRes.value.Content.forEach((station) => {
          if (station && station.TramId) {
            result.hsdcActiveFloodMap[String(station.TramId)] = station;
          }
        });
      }
    } catch (e) {
      result.sourceStatus = 'OFFLINE_CACHE';
    }

    return result;
  },

  predictHotspotFlood(hotspot, rainMmPerHour, durationMin, riverLevelM, riverStation, vehicleProfile) {
    // Nếu người dùng vừa báo cáo trực tiếp tại điểm này
    if (typeof hotspot.manualOverrideCm === 'number' && hotspot.manualOverrideCm > 0) {
      const d = Math.round(hotspot.manualOverrideCm);
      return this.formatPredictionResult(hotspot, d, 65, durationMin, vehicleProfile);
    }

    const drainageCap = hotspot.drainageCapacityMmH || 35;
    const basinFactor = hotspot.basinFactor || 1.35;
    const riverWeight = hotspot.riverProximityWeight || 0.8;

    // 1. Tính hệ số cản thoát nước do mực nước sông dâng (Backwater Effect)
    const riverSpan = Math.max(0.2, riverStation.criticalLevelM - riverStation.normalLevelM);
    const riverExcess = Math.max(0, riverLevelM - riverStation.normalLevelM);
    const riverRatio = riverExcess / riverSpan;

    const rawGamma = 1 - Math.pow(riverRatio * riverWeight, 1.3);
    const gammaRiver = Number(Math.max(-0.25, Math.min(1.0, rawGamma)).toFixed(2));
    const drainageEfficiencyPct = Math.max(0, Math.round(gammaRiver * 100));

    // Công suất tiêu thoát thực tế của cống (mm/h)
    const effectiveDrainageMmH = drainageCap * Math.max(0, gammaRiver);

    // Nước sông/triều cường tràn ngược khi vượt mức nguy cấp (cm)
    const riverBackflowCm =
      riverLevelM > riverStation.criticalLevelM
        ? Math.round((riverLevelM - riverStation.criticalLevelM) * 28 * riverWeight)
        : 0;

    // 2. Nếu trời không mưa (rainMmPerHour <= 2) và sông chưa tràn bờ -> Mặt đường khô ráo (0cm)
    if (rainMmPerHour <= 2 && riverBackflowCm === 0) {
      return this.formatPredictionResult(hotspot, 0, drainageEfficiencyPct, durationMin, vehicleProfile);
    }

    // 3. Tích tụ nước mưa trên mặt đường theo cường độ mưa I (mm/h) và thời gian mưa t (phút)
    const inflowMmH = rainMmPerHour * basinFactor;
    const netRateMmH = inflowMmH - effectiveDrainageMmH;
    const initialPipeStorageMm = 10 * Math.max(0.2, gammaRiver);

    let rainDepthCm = 0;
    if (netRateMmH > 0) {
      const accumulatedMm = netRateMmH * (durationMin / 60) - initialPipeStorageMm;
      if (accumulatedMm > 0) {
        rainDepthCm = accumulatedMm * 0.42;
      }
    }

    const totalDepthCm = Math.max(0, Math.min(95, Math.round(rainDepthCm + riverBackflowCm)));
    return this.formatPredictionResult(hotspot, totalDepthCm, drainageEfficiencyPct, durationMin, vehicleProfile);
  },

  formatPredictionResult(hotspot, predictedDepthCm, drainageEfficiencyPct, durationMin, vehicleProfile) {
    const safeCm = vehicleProfile ? vehicleProfile.safeDepthCm : 18;
    const critCm = vehicleProfile ? vehicleProfile.criticalDepthCm : 26;
    const vehicleName = vehicleProfile ? vehicleProfile.name : 'Phương tiện';

    let status = 'SAFE';
    let statusLabel = 'Khô ráo / Di chuyển an toàn';
    let colorHex = '#10B981';

    if (predictedDepthCm >= critCm) {
      status = 'DANGER';
      statusLabel = `NGUY HIỂM: Vượt ngưỡng ${critCm}cm của ${vehicleName} (Cấm đi)`;
      colorHex = '#EF4444';
    } else if (predictedDepthCm >= safeCm || predictedDepthCm >= 10) {
      status = 'WARNING';
      statusLabel = `CẢNH BÁO: Ngập ${predictedDepthCm}cm (Đi chậm số thấp)`;
      colorHex = '#F59E0B';
    }

    // Bán kính vùng ngập (m) mở rộng theo độ sâu ngập
    const radiusScale = predictedDepthCm > 0 ? Math.min(1.3, 0.45 + predictedDepthCm / 55) : 0.5;
    const activeRadiusM = Math.round((hotspot.maxRadiusM || 280) * radiusScale);

    return {
      hotspotId: hotspot.id,
      predictedDepthCm,
      drainageEfficiencyPct,
      activeRadiusM,
      status,
      statusLabel,
      colorHex
    };
  }
};
