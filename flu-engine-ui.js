/**
 * ==============================================================================
 * Front-end Controller & UI Manager for Wells-Riley Influenza Modeling Engine
 * ==============================================================================
 * Handles Form Controls, Presets, Time-Series Charts, Toasts, Reset, and PDF Export.
 */

(function () {
  'use strict';

  const STORAGE_RESULT_KEY = 'wellsRiley_lastResult';
  const STORAGE_FORM_KEY = 'wellsRiley_lastForm';

  // Preset scenarios database
  const PRESET_SCENARIOS = {
    classroom: {
      name: 'Lớp học / Văn phòng kín',
      infected_count: 1,
      susceptible_count: 35,
      activity_preset: 'speaking',
      breathing_rate: 0.75,
      quanta_preset: 'speaking_normal',
      quanta_rate: 50.0,
      vent_mode: 'cadr',
      cadr: 120.0,
      vol: 150.0,
      ach: 1.5,
      mask_f0: 'none',
      mask_susceptible: 'none',
      kd: '1.0',
      kh: '0.7',
      t: 4.0,
    },
    cafe: {
      name: 'Quán cafe / Thoáng khí',
      infected_count: 1,
      susceptible_count: 20,
      activity_preset: 'standing',
      breathing_rate: 0.60,
      quanta_preset: 'speaking_quiet',
      quanta_rate: 20.0,
      vent_mode: 'cadr',
      cadr: 600.0,
      vol: 180.0,
      ach: 4.0,
      mask_f0: 'cloth',
      mask_susceptible: 'none',
      kd: '0.6',
      kh: '1.0',
      t: 1.5,
    },
    clinic: {
      name: 'Phòng khám y tế chuẩn',
      infected_count: 1,
      susceptible_count: 15,
      activity_preset: 'resting',
      breathing_rate: 0.50,
      quanta_preset: 'coughing_sneezing',
      quanta_rate: 150.0,
      vent_mode: 'volume_ach',
      cadr: 900.0,
      vol: 150.0,
      ach: 6.0,
      mask_f0: 'n95',
      mask_susceptible: 'n95',
      kd: '0.6',
      kh: '1.2',
      t: 1.0,
    },
    gym: {
      name: 'Phòng Gym / Vận động mạnh',
      infected_count: 2,
      susceptible_count: 25,
      activity_preset: 'heavy_exercise',
      breathing_rate: 1.80,
      quanta_preset: 'speaking_loud',
      quanta_rate: 100.0,
      vent_mode: 'cadr',
      cadr: 300.0,
      vol: 250.0,
      ach: 2.0,
      mask_f0: 'none',
      mask_susceptible: 'none',
      kd: '1.0',
      kh: '1.0',
      t: 2.0,
    },
  };

  // State
  let isApiOnline = false;
  let cachedPresets = null;
  let lastPredictionData = null;
  let lastTimeSeriesData = null;
  let lastUsedPayload = null;

  // DOM Elements cache
  let elForm, elBtnCalculate, elBtnReset, elBtnPresets, elBtnExportPdf, elBtnExportPdfQuick;
  let elStatusBadge, elResultsPanel, elToastContainer, chartCanvas;

  /**
   * Initialize on DOM Content Loaded
   */
  document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initEventListeners();
    checkBackendHealth();
    restorePreviousState();
  });

  function initElements() {
    elForm = document.getElementById('wrAiForm');
    elBtnCalculate = document.getElementById('btnCalculateWr');
    elBtnReset = document.getElementById('btnResetWr');
    elBtnPresets = document.getElementById('btnLoadPresets');
    elBtnExportPdf = document.getElementById('btnExportPdf');
    elBtnExportPdfQuick = document.getElementById('btnExportPdfQuick');
    elStatusBadge = document.getElementById('apiStatusBadge');
    elResultsPanel = document.getElementById('wrResultsContainer');
    elToastContainer = document.getElementById('toastContainer');
    chartCanvas = document.getElementById('wrTimeSeriesCanvas');
  }

  function initEventListeners() {
    if (elBtnCalculate) {
      elBtnCalculate.addEventListener('click', handleCalculate);
    }

    if (elBtnReset) {
      elBtnReset.addEventListener('click', handleReset);
    }

    if (elBtnPresets) {
      elBtnPresets.addEventListener('click', handleLoadPresets);
    }

    if (elBtnExportPdf) {
      elBtnExportPdf.addEventListener('click', handleExportPdf);
    }

    if (elBtnExportPdfQuick) {
      elBtnExportPdfQuick.addEventListener('click', handleExportPdf);
    }

    // Scenario Presets Click
    const scenarioPills = document.querySelectorAll('.scenario-pill');
    scenarioPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const scKey = pill.getAttribute('data-scenario');
        if (scKey && PRESET_SCENARIOS[scKey]) {
          applyScenarioPreset(scKey);
        }
      });
    });

    // Ventilation mode switch (CADR vs Volume+ACH)
    const ventRadios = document.querySelectorAll('input[name="wr_vent_mode"]');
    ventRadios.forEach(radio => {
      radio.addEventListener('change', e => {
        setVentilationMode(e.target.value);
      });
    });

    // Auto-update breathing rate when activity preset changes
    const activitySelect = document.getElementById('wr_activity_preset');
    if (activitySelect) {
      activitySelect.addEventListener('change', e => {
        const pInput = document.getElementById('wr_p_input');
        const map = { resting: 0.5, standing: 0.6, speaking: 0.75, light_exercise: 1.25, heavy_exercise: 1.8 };
        if (pInput && map[e.target.value]) pInput.value = map[e.target.value];
      });
    }

    // Auto-update quanta when vocalization preset changes
    const quantaSelect = document.getElementById('wr_quanta_preset');
    if (quantaSelect) {
      quantaSelect.addEventListener('change', e => {
        const qInput = document.getElementById('wr_q_input');
        const map = { oral_breathing: 5, speaking_quiet: 20, speaking_normal: 50, speaking_loud: 100, coughing_sneezing: 150 };
        if (qInput && map[e.target.value]) qInput.value = map[e.target.value];
      });
    }

    // Exposure time slider sync
    const tSlider = document.getElementById('wr_t_slider');
    const tInput = document.getElementById('wr_t_input');
    const tDisplay = document.getElementById('wr_t_display');
    if (tSlider && tInput) {
      tSlider.addEventListener('input', () => {
        tInput.value = tSlider.value;
        if (tDisplay) tDisplay.innerHTML = `<strong>${parseFloat(tSlider.value).toFixed(1)}</strong> giờ`;
      });
      tInput.addEventListener('input', () => {
        tSlider.value = tInput.value;
        if (tDisplay) tDisplay.innerHTML = `<strong>${parseFloat(tInput.value || 0).toFixed(1)}</strong> giờ`;
      });
    }
  }

  function setVentilationMode(mode) {
    const cadrGroup = document.getElementById('wrGroupCadr');
    const achGroup = document.getElementById('wrGroupAch');
    if (mode === 'cadr') {
      if (cadrGroup) cadrGroup.style.display = 'block';
      if (achGroup) achGroup.style.display = 'none';
    } else {
      if (cadrGroup) cadrGroup.style.display = 'none';
      if (achGroup) achGroup.style.display = 'grid';
    }
  }

  /**
   * Applies a preset scenario to the form
   */
  function applyScenarioPreset(scKey) {
    const sc = PRESET_SCENARIOS[scKey];
    if (!sc) return;

    // Update active pill
    document.querySelectorAll('.scenario-pill').forEach(p => p.classList.remove('active'));
    const activePill = document.querySelector(`.scenario-pill[data-scenario="${scKey}"]`);
    if (activePill) activePill.classList.add('active');

    // Fill Inputs
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('wr_infected_input', sc.infected_count);
    setVal('wr_susceptible_input', sc.susceptible_count);
    setVal('wr_activity_preset', sc.activity_preset);
    setVal('wr_p_input', sc.breathing_rate);
    setVal('wr_quanta_preset', sc.quanta_preset);
    setVal('wr_q_input', sc.quanta_rate);
    setVal('wr_mask_f0', sc.mask_f0);
    setVal('wr_mask_susceptible', sc.mask_susceptible);
    setVal('wr_kd_select', sc.kd);
    setVal('wr_kh_select', sc.kh);
    setVal('wr_t_slider', sc.t);
    setVal('wr_t_input', sc.t);
    setVal('wr_cadr_input', sc.cadr);
    setVal('wr_vol_input', sc.vol);
    setVal('wr_ach_input', sc.ach);

    const tDisplay = document.getElementById('wr_t_display');
    if (tDisplay) tDisplay.innerHTML = `<strong>${sc.t.toFixed(1)}</strong> giờ`;

    // Radio
    const radio = document.querySelector(`input[name="wr_vent_mode"][value="${sc.vent_mode}"]`);
    if (radio) {
      radio.checked = true;
      setVentilationMode(sc.vent_mode);
    }

    showToast(`⚡ Đã tải kịch bản: ${sc.name}`, 'info');

    // Automatically calculate scenario
    handleCalculate();
  }

  /**
   * Resets form & clears result state
   */
  function handleReset() {
    // 1. Reset inputs to default
    document.querySelectorAll('.scenario-pill').forEach(p => p.classList.remove('active'));

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('wr_infected_input', '1');
    setVal('wr_susceptible_input', '30');
    setVal('wr_activity_preset', 'resting');
    setVal('wr_p_input', '0.5');
    setVal('wr_quanta_preset', 'speaking_normal');
    setVal('wr_q_input', '50');
    setVal('wr_mask_f0', 'none');
    setVal('wr_mask_susceptible', 'none');
    setVal('wr_kd_select', '1.0');
    setVal('wr_kh_select', '1.0');
    setVal('wr_t_slider', '3.0');
    setVal('wr_t_input', '3.0');
    setVal('wr_cadr_input', '300');
    setVal('wr_vol_input', '150');
    setVal('wr_ach_input', '2.0');

    const tDisplay = document.getElementById('wr_t_display');
    if (tDisplay) tDisplay.innerHTML = '<strong>3.0</strong> giờ';

    const defaultRadio = document.querySelector('input[name="wr_vent_mode"][value="cadr"]');
    if (defaultRadio) {
      defaultRadio.checked = true;
      setVentilationMode('cadr');
    }

    // 2. Reset results panel
    const elProbVal = document.getElementById('resProbPercent');
    const elRiskBadge = document.getElementById('resRiskBadge');
    const elCasesVal = document.getElementById('resExpectedCases');
    const elRtVal = document.getElementById('resRtValue');
    const elDoseVal = document.getElementById('resDoseValue');
    const elAirVal = document.getElementById('resAirFlow');
    const progBar = document.getElementById('resProgressBar');

    if (elProbVal) elProbVal.textContent = '0.0%';
    if (elRiskBadge) {
      elRiskBadge.className = 'risk-badge-big risk-low';
      elRiskBadge.textContent = 'Đã đặt lại';
    }
    if (elCasesVal) elCasesVal.textContent = '—';
    if (elRtVal) elRtVal.textContent = '—';
    if (elDoseVal) elDoseVal.textContent = '—';
    if (elAirVal) elAirVal.textContent = '—';
    if (progBar) {
      progBar.style.width = '0%';
      progBar.style.background = '#10b981';
    }

    // 3. Clear canvas chart
    if (chartCanvas) {
      const ctx = chartCanvas.getContext('2d');
      ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
    }

    // 4. Clear Recommendations & Mitigation Matrix
    const recsList = document.getElementById('wrRecommendationsList');
    if (recsList) {
      recsList.innerHTML = '<li class="rec-item">Bấm "Tính Toán & Mô Phỏng Ngay" để hệ thống phân tích và sinh khuyến nghị can thiệp.</li>';
    }
    const mitCards = document.getElementById('wrMitigationCards');
    if (mitCards) mitCards.innerHTML = '';

    // 5. Clear Storage
    try {
      localStorage.removeItem(STORAGE_RESULT_KEY);
      localStorage.removeItem(STORAGE_FORM_KEY);
    } catch (_) {}

    lastPredictionData = null;
    lastTimeSeriesData = null;
    lastUsedPayload = null;

    showToast('🔄 Đã đặt lại toàn bộ thông số và kết quả về mặc định!', 'success');
  }

  /**
   * Health check to detect live backend
   */
  async function checkBackendHealth() {
    updateApiStatus('checking', '🔄 Đang kết nối Backend...');
    try {
      const res = await FluApiClient.checkHealth();
      if (res && res.status === 'healthy') {
        isApiOnline = true;
        updateApiStatus('online', `🟢 Backend Online (v${res.version || '1.0'})`);
      } else {
        throw new Error('Unhealthy status');
      }
    } catch (err) {
      isApiOnline = false;
      const hostDisplay = FluApiClient?.baseURL ? FluApiClient.baseURL.replace(/^https?:\/\//, '').replace(/\/api\/v1\/?$/, '') : 'Backend';
      updateApiStatus('offline', `🔴 Backend Offline (${hostDisplay})`);
    }
  }

  function updateApiStatus(status, text) {
    if (!elStatusBadge) return;
    elStatusBadge.className = `api-status-badge ${status}`;
    const retryBtn = status === 'offline' ? '<button onclick="window.FluUi.checkBackendHealth()" class="btn-retry-api">Thử lại</button>' : '';
    const configBtn = '<button onclick="window.FluUi.promptCustomApiUrl()" class="btn-config-api" title="Cấu hình URL Backend Render/Cloud">⚙️ Cấu hình API</button>';
    elStatusBadge.innerHTML = `<span>${text}</span> ${retryBtn} ${configBtn}`;
  }

  function promptCustomApiUrl() {
    const current = FluApiClient.baseURL;
    const input = prompt('Nhập địa chỉ API Backend (Render / Railway / VPS):\nVí dụ: https://your-backend.onrender.com/api/v1', current);
    if (input !== null && input.trim()) {
      const cleanUrl = input.trim().replace(/\/+$/, '');
      try {
        localStorage.setItem('API_BASE_URL', cleanUrl);
      } catch (_) {}
      FluApiClient.setBaseURL(cleanUrl);
      showToast(`Đã đổi API URL thành: ${cleanUrl}`, 'info');
      checkBackendHealth();
    }
  }


  /**
   * Load presets from backend
   */
  async function handleLoadPresets() {
    try {
      showToast('Đang tải danh mục hệ số dịch tễ từ máy chủ...', 'info');
      const presets = await FluApiClient.getPresets();
      cachedPresets = presets;
      showToast('✅ Đã nạp thành công bộ tham số dịch tễ chuẩn!', 'success');
    } catch (err) {
      showToast(`Không thể tải tham số: ${err.message}`, 'error');
    }
  }

  /**
   * Collects and validates form inputs into API payload
   */
  function collectFormData() {
    const infectedCount = parseInt(document.getElementById('wr_infected_input')?.value || '1', 10);
    const susceptibleCount = parseInt(document.getElementById('wr_susceptible_input')?.value || '30', 10);
    const breathingRate = parseFloat(document.getElementById('wr_p_input')?.value || '0.5');
    const quantaRate = parseFloat(document.getElementById('wr_q_input')?.value || '50');
    const exposureTime = parseFloat(document.getElementById('wr_t_input')?.value || '3');
    const distanceFactor = parseFloat(document.getElementById('wr_kd_select')?.value || '1.0');
    const maskF0 = document.getElementById('wr_mask_f0')?.value || 'none';
    const maskSusceptible = document.getElementById('wr_mask_susceptible')?.value || 'none';
    const ventilationKh = parseFloat(document.getElementById('wr_kh_select')?.value || '1.0');

    // Ventilation config
    const ventMode = document.querySelector('input[name="wr_vent_mode"]:checked')?.value || 'cadr';
    let ventilationPayload = {};
    if (ventMode === 'cadr') {
      const cadr = parseFloat(document.getElementById('wr_cadr_input')?.value || '300');
      ventilationPayload = { clean_air_delivery_rate: Math.max(1.0, cadr) };
    } else {
      const volume = parseFloat(document.getElementById('wr_vol_input')?.value || '150');
      const ach = parseFloat(document.getElementById('wr_ach_input')?.value || '2.0');
      ventilationPayload = { room_volume_m3: Math.max(10.0, volume), air_changes_per_hour: Math.max(0.1, ach) };
    }

    // Validate
    if (isNaN(infectedCount) || infectedCount < 1) {
      throw new Error('Số ca F0 (infected_count) phải từ 1 người trở lên.');
    }
    if (isNaN(susceptibleCount) || susceptibleCount < 1) {
      throw new Error('Số người nhạy cảm (susceptible_count) phải từ 1 người trở lên.');
    }
    if (isNaN(exposureTime) || exposureTime <= 0) {
      throw new Error('Thời gian tiếp xúc phải lớn hơn 0 giờ.');
    }

    const predictPayload = {
      infected_count: infectedCount,
      susceptible_count: susceptibleCount,
      breathing_rate: breathingRate,
      quanta_generation_rate: quantaRate,
      exposure_time_hours: exposureTime,
      ventilation: ventilationPayload,
      distance_factor: distanceFactor,
      mask_config: {
        mask_type_f0: maskF0,
        mask_type_susceptible: maskSusceptible,
      },
      ventilation_distribution_factor: ventilationKh,
    };

    const timeSeriesPayload = {
      ...predictPayload,
      start_time_hours: 0.5,
      max_time_hours: Math.max(4.0, exposureTime * 1.5),
      time_step_hours: 0.5,
    };

    return { predictPayload, timeSeriesPayload };
  }

  /**
   * Main calculation handler
   */
  async function handleCalculate(e) {
    if (e) e.preventDefault();

    let payloads;
    try {
      payloads = collectFormData();
    } catch (valErr) {
      showToast(valErr.message, 'warning');
      return;
    }

    setLoading(true);
    lastUsedPayload = payloads.predictPayload;

    try {
      const { prediction, timeSeries } = await FluApiClient.runFullAssessment(
        payloads.predictPayload,
        payloads.timeSeriesPayload
      );

      lastPredictionData = prediction;
      lastTimeSeriesData = timeSeries;

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify({ prediction, timeSeries }));
        localStorage.setItem(STORAGE_FORM_KEY, JSON.stringify(payloads.predictPayload));
      } catch (_) {}

      // Render UI
      renderPredictionResults(prediction);
      renderTimeSeriesChart(timeSeries);
      renderRecommendations(prediction.recommendations);
      renderMitigationMatrix(prediction.mitigation_options);

      // Scroll smoothly to results
      if (elResultsPanel) {
        elResultsPanel.style.display = 'block';
      }

      showToast('🎉 Đã tính toán và mô phỏng thành công!', 'success');
    } catch (err) {
      console.error('Prediction Error:', err);
      let msg = err.message;
      if (err.details && Array.isArray(err.details)) {
        msg += `:\n${err.details.join('\n')}`;
      }
      showToast(`Lỗi: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Renders risk metrics
   */
  function renderPredictionResults(data) {
    const elProbVal = document.getElementById('resProbPercent');
    const elRiskBadge = document.getElementById('resRiskBadge');
    const elCasesVal = document.getElementById('resExpectedCases');
    const elRtVal = document.getElementById('resRtValue');
    const elDoseVal = document.getElementById('resDoseValue');
    const elAirVal = document.getElementById('resAirFlow');

    if (elProbVal) elProbVal.textContent = `${data.infection_probability_percent.toFixed(1)}%`;
    if (elCasesVal) elCasesVal.textContent = `${data.expected_new_cases} ca`;
    if (elRtVal) elRtVal.textContent = data.effective_reproductive_number;
    if (elDoseVal && data.parameters_used) elDoseVal.textContent = data.parameters_used.inhaled_quanta_dose.toFixed(4);
    if (elAirVal && data.parameters_used) elAirVal.textContent = `${data.parameters_used.clean_air_flow_Q_m3h} m³/h`;

    if (elRiskBadge) {
      const riskClass = data.risk_level.toLowerCase();
      elRiskBadge.className = `risk-badge-big risk-${riskClass}`;
      elRiskBadge.textContent = `Mức độ: ${data.risk_level} (${data.risk_level_label_vi})`;
    }

    // Animate progress bar
    const progBar = document.getElementById('resProgressBar');
    if (progBar) {
      progBar.style.width = `${Math.min(100, Math.max(3, data.infection_probability_percent))}%`;
      const colors = { LOW: '#10B981', MODERATE: '#F59E0B', HIGH: '#EF4444', CRITICAL: '#991B1B' };
      progBar.style.background = colors[data.risk_level] || '#6366F1';
    }
  }

  /**
   * Renders Time-Series Line Chart using HTML5 Canvas
   */
  function renderTimeSeriesChart(tsData) {
    if (!chartCanvas || !tsData || !tsData.chart_dataset) return;

    const ctx = chartCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = chartCanvas.getBoundingClientRect();
    const width = (chartCanvas.width = (rect.width || 600) * dpr);
    const height = (chartCanvas.height = 320 * dpr);
    ctx.scale(dpr, dpr);

    const W = rect.width || 600;
    const H = 320;
    const padding = { top: 30, right: 30, bottom: 50, left: 55 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    ctx.clearRect(0, 0, W, H);

    const points = tsData.time_series || [];
    if (points.length === 0) return;

    const maxT = points[points.length - 1].time_hours || 8.0;
    const maxP = Math.max(50, Math.ceil(Math.max(...points.map(p => p.infection_probability_percent)) / 10) * 10);

    // Draw Grid & Y-Axis
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.font = '12px Space Grotesk, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    const ySteps = 5;
    for (let i = 0; i <= ySteps; i++) {
      const yVal = (maxP / ySteps) * i;
      const yPos = padding.top + chartH - (chartH * (yVal / maxP));
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(padding.left + chartW, yPos);
      ctx.stroke();
      ctx.fillText(`${yVal.toFixed(0)}%`, padding.left - 8, yPos + 4);
    }

    // Danger Threshold Line at 20%
    if (maxP >= 20) {
      const y20 = padding.top + chartH - (chartH * (20 / maxP));
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, y20);
      ctx.lineTo(padding.left + chartW, y20);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'left';
      ctx.fillText('Ngưỡng Cảnh Báo (20%)', padding.left + 8, y20 - 6);
      ctx.restore();
    }

    // Safe Threshold Line at 5%
    if (maxP >= 5) {
      const y5 = padding.top + chartH - (chartH * (5 / maxP));
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(padding.left, y5);
      ctx.lineTo(padding.left + chartW, y5);
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.textAlign = 'left';
      ctx.fillText('Ngưỡng An Toàn (5%)', padding.left + 8, y5 - 6);
      ctx.restore();
    }

    // X-Axis
    ctx.textAlign = 'center';
    points.forEach((pt, i) => {
      if (i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) {
        const xPos = padding.left + (chartW * (pt.time_hours / maxT));
        ctx.fillText(`${pt.time_hours}h`, xPos, padding.top + chartH + 20);
      }
    });

    // Draw Gradient Area under Curve
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
    grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');

    ctx.beginPath();
    points.forEach((pt, i) => {
      const x = padding.left + (chartW * (pt.time_hours / maxT));
      const y = padding.top + chartH - (chartH * (pt.infection_probability_percent / maxP));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Curve Line
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((pt, i) => {
      const x = padding.left + (chartW * (pt.time_hours / maxT));
      const y = padding.top + chartH - (chartH * (pt.infection_probability_percent / maxP));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Data Points with risk colors
    points.forEach(pt => {
      const x = padding.left + (chartW * (pt.time_hours / maxT));
      const y = padding.top + chartH - (chartH * (pt.infection_probability_percent / maxP));

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = pt.risk_color || '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  /**
   * Renders recommendations list
   */
  function renderRecommendations(recs) {
    const listEl = document.getElementById('wrRecommendationsList');
    if (!listEl) return;
    if (!recs || recs.length === 0) {
      listEl.innerHTML = '<li class="rec-item">Không có khuyến nghị đặc biệt.</li>';
      return;
    }

    listEl.innerHTML = recs.map(rec => `<li class="rec-item">${escapeHtml(rec)}</li>`).join('');
  }

  /**
   * Renders mitigation what-if comparison cards
   */
  function renderMitigationMatrix(options) {
    const container = document.getElementById('wrMitigationCards');
    if (!container) return;
    if (!options || options.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = options.map(opt => `
      <div class="mitigation-card">
        <div class="mit-header">
          <h4>${escapeHtml(opt.intervention_name)}</h4>
          <span class="mit-reduction-badge">-${opt.risk_reduction_percent}%</span>
        </div>
        <p class="mit-desc">${escapeHtml(opt.description_vi)}</p>
        <div class="mit-footer">
          <span>Nguy cơ mới:</span>
          <strong>${opt.new_probability_percent}%</strong>
        </div>
      </div>
    `).join('');
  }

  /**
   * Export Professional PDF Report
   */
  async function handleExportPdf() {
    if (!lastPredictionData || !lastTimeSeriesData) {
      showToast('⚠️ Vui lòng bấm "Tính Toán & Mô Phỏng Ngay" trước khi xuất báo cáo!', 'warning');
      return;
    }

    if (typeof html2pdf === 'undefined') {
      showToast('❌ Thư viện tạo PDF (html2pdf.js) chưa được tải xong. Vui lòng kiểm tra kết nối internet!', 'error');
      return;
    }

    showToast('⏳ Đang tổng hợp và tạo file PDF chất lượng cao...', 'info');

    try {
      const pred = lastPredictionData;
      const ts = lastTimeSeriesData;
      const params = pred.parameters_used || {};

      // 1. Populate metadata
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} - ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`;
      const elPdfTime = document.getElementById('pdfTimeStr');
      if (elPdfTime) elPdfTime.textContent = timeStr;

      const elPdfCase = document.getElementById('pdfCaseId');
      if (elPdfCase) elPdfCase.textContent = `#WR-${Math.floor(100000 + Math.random() * 900000)}`;

      // 2. Summary Box
      const elPdfProb = document.getElementById('pdfRiskProb');
      const elPdfTier = document.getElementById('pdfRiskTierBadge');
      const elPdfCases = document.getElementById('pdfCasesVal');
      const elPdfRt = document.getElementById('pdfRtVal');
      const elPdfDose = document.getElementById('pdfDoseVal');
      const elPdfAir = document.getElementById('pdfAirVal');

      if (elPdfProb) elPdfProb.textContent = `${pred.infection_probability_percent.toFixed(1)}%`;
      if (elPdfTier) {
        elPdfTier.textContent = `MỨC ĐỘ: ${pred.risk_level} (${pred.risk_level_label_vi.toUpperCase()})`;
        const colors = { LOW: '#059669', MODERATE: '#d97706', HIGH: '#dc2626', CRITICAL: '#991b1b' };
        elPdfTier.style.background = colors[pred.risk_level] || '#6366f1';
        elPdfTier.style.color = '#ffffff';
      }
      if (elPdfCases) elPdfCases.textContent = `${pred.expected_new_cases} ca`;
      if (elPdfRt) elPdfRt.textContent = `${pred.effective_reproductive_number}`;
      if (elPdfDose) elPdfDose.textContent = `${params.inhaled_quanta_dose ? params.inhaled_quanta_dose.toFixed(4) : '—'} quanta`;
      if (elPdfAir) elPdfAir.textContent = `${params.clean_air_flow_Q_m3h || '—'} m³/h`;

      // 3. Input Parameters Table
      const elTableBody = document.getElementById('pdfInputParamsBody');
      if (elTableBody) {
        const maskLabels = { none: 'Không đeo', cloth: 'Khẩu trang vải', surgical: 'Khẩu trang Y tế', kn95: 'Khẩu trang KN95', n95: 'Khẩu trang N95' };
        elTableBody.innerHTML = `
          <tr>
            <td><strong>Số người mang mầm bệnh (F0)</strong></td>
            <td><code>I</code></td>
            <td><strong>${params.infected_count_I || 1}</strong> người</td>
            <td>Nguồn phát tán virus trong phòng kín</td>
          </tr>
          <tr>
            <td><strong>Số người khỏe mạnh nhạy cảm</strong></td>
            <td><code>S</code></td>
            <td><strong>${params.susceptible_count_S || 30}</strong> người</td>
            <td>Đối tượng có nguy cơ bị lây nhiễm</td>
          </tr>
          <tr>
            <td><strong>Lưu lượng hô hấp trung bình</strong></td>
            <td><code>p</code></td>
            <td><strong>${params.breathing_rate_p_m3h || 0.5}</strong> m³/h</td>
            <td>Phản ánh cường độ hoạt động thể chất</td>
          </tr>
          <tr>
            <td><strong>Tốc độ phát tán hạt mầm bệnh</strong></td>
            <td><code>q</code></td>
            <td><strong>${params.quanta_rate_q_per_h || 50}</strong> quanta/h</td>
            <td>Phát tán qua hơi thở, trò chuyện hoặc ho</td>
          </tr>
          <tr>
            <td><strong>Thời gian tiếp xúc liên tục</strong></td>
            <td><code>t</code></td>
            <td><strong>${params.exposure_time_t_hours || 3.0}</strong> giờ</td>
            <td>Tổng thời lượng ở chung trong phòng</td>
          </tr>
          <tr>
            <td><strong>Lưu lượng cấp khí sạch</strong></td>
            <td><code>Q</code></td>
            <td><strong>${params.clean_air_flow_Q_m3h || 300}</strong> m³/h</td>
            <td>Tốc độ pha loãng và loại bỏ aerosol</td>
          </tr>
          <tr>
            <td><strong>Hệ số lọc khẩu trang 2 chiều</strong></td>
            <td><code>k_m</code></td>
            <td><strong>${params.mask_factor_km || 1.0}</strong></td>
            <td>Hiệu quả lọc hạt virus của khẩu trang</td>
          </tr>
          <tr>
            <td><strong>Hệ số khoảng cách tiếp xúc</strong></td>
            <td><code>k_d</code></td>
            <td><strong>${params.distance_factor_kd || 1.0}</strong></td>
            <td>Khoảng cách vật lý giữa các cá thể</td>
          </tr>
          <tr>
            <td><strong>Hệ số phân bổ luồng thông khí</strong></td>
            <td><code>k_h</code></td>
            <td><strong>${params.ventilation_distribution_kh || 1.0}</strong></td>
            <td>Đặc tính lưu thông và đối lưu khí</td>
          </tr>
        `;
      }

      // 4. Capture Time-Series Canvas to DataURL Image
      const elPdfChartImg = document.getElementById('pdfChartImage');
      if (chartCanvas && elPdfChartImg) {
        elPdfChartImg.src = chartCanvas.toDataURL('image/png', 1.0);
      }

      // 5. Mitigation Scenarios Table
      const elMitBody = document.getElementById('pdfMitigationTableBody');
      if (elMitBody && pred.mitigation_options) {
        elMitBody.innerHTML = pred.mitigation_options.map(opt => `
          <tr>
            <td><strong>${escapeHtml(opt.intervention_name)}</strong></td>
            <td>${escapeHtml(opt.description_vi)}</td>
            <td><strong style="color:#059669;">${opt.new_probability_percent}%</strong></td>
            <td><span class="pdf-tag-green">Giảm ${opt.risk_reduction_percent}%</span></td>
          </tr>
        `).join('');
      }

      // 6. Recommendations List
      const elRecBox = document.getElementById('pdfRecommendationsBox');
      if (elRecBox && pred.recommendations) {
        elRecBox.innerHTML = pred.recommendations.map(r => `
          <div class="pdf-rec-item">• ${escapeHtml(r)}</div>
        `).join('');
      }

      // 7. Render PDF using html2pdf.js
      const printElement = document.getElementById('pdfDocumentContent');
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Bao_Cao_Nguy_Co_Cum_Wells_Riley_${now.toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(printElement).save();
      showToast('✅ Đã tải xuống báo cáo PDF thành công!', 'success');
    } catch (pdfErr) {
      console.error('PDF Export Error:', pdfErr);
      showToast(`Không thể tạo file PDF: ${pdfErr.message}`, 'error');
    }
  }

  /**
   * Loading state helper
   */
  function setLoading(loading) {
    if (elBtnCalculate) {
      elBtnCalculate.disabled = loading;
      elBtnCalculate.innerHTML = loading
        ? '<span class="spinner-inline"></span> Đang phân tích...'
        : '⚡ Tính Toán & Mô Phỏng Ngay';
    }
  }

  /**
   * Toast notification utility
   */
  function showToast(message, type = 'info') {
    if (!elToastContainer) {
      let c = document.createElement('div');
      c.id = 'toastContainer';
      c.className = 'toast-container';
      document.body.appendChild(c);
      elToastContainer = c;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
      <div class="toast-msg">${escapeHtml(message)}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fadeout');
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  /**
   * Restores cached state from LocalStorage
   */
  function restorePreviousState() {
    try {
      const savedRes = localStorage.getItem(STORAGE_RESULT_KEY);
      if (savedRes) {
        const { prediction, timeSeries } = JSON.parse(savedRes);
        if (prediction) {
          lastPredictionData = prediction;
          renderPredictionResults(prediction);
          renderRecommendations(prediction.recommendations);
          renderMitigationMatrix(prediction.mitigation_options);
        }
        if (timeSeries) {
          lastTimeSeriesData = timeSeries;
          setTimeout(() => renderTimeSeriesChart(timeSeries), 300);
        }
        if (elResultsPanel && prediction) elResultsPanel.style.display = 'block';
      }
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ==============================================================================
  // AGENT-BASED 7-DAY EPIDEMIC SIMULATION & DÃY - BÀN - GHẾ CLASSROOM ENGINE
  // ==============================================================================

  const VIETNAMESE_NAMES = [
    'An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hùng', 'Khoa',
    'Linh', 'Minh', 'Nam', 'Oanh', 'Phúc', 'Quỳnh', 'Sơn', 'Thảo',
    'Tuấn', 'Uyên', 'Vân', 'Yến', 'Bảo', 'Cường', 'Dương', 'Hải',
    'Hương', 'Khánh', 'Long', 'Mai', 'Nga', 'Phong', 'Quân', 'Tâm',
    'Trang', 'Tú', 'Việt', 'Vũ', 'Đạt', 'Đức', 'Phương', 'Lan',
    'Trí', 'Bích', 'Loan', 'Thịnh', 'Trọng', 'Bách', 'Cẩm', 'Diệp'
  ];

  // Independent Room Layout Configurations (Morning vs Afternoon)
  let morningLayout = {
    cols: 3,         // 3 Dãy
    rows: 5,         // 5 Bàn / dãy
    seatsPerDesk: 2, // 2 bạn / bàn
  }; // Sức chứa: 30 chỗ

  let afternoonLayout = {
    cols: 4,         // 4 Dãy (Phòng thực hành / Lab)
    rows: 4,         // 4 Bàn / dãy
    seatsPerDesk: 2, // 2 bạn / bàn
  }; // Sức chứa: 32 chỗ

  // Fixed Class Roster Size (N students: 1..N)
  let classRosterSize = 30;
  let crTotalStudents = 30;

  // Session & Risk View State
  let currentSessionView = 'morning'; // 'morning' | 'afternoon'
  let riskViewMode = 'combined';       // 'combined' | 'morning' | 'afternoon'

  // Afternoon Seating Array: index -> studentId (1..N) or null (Empty)
  let afternoonSeatAssignment = [];

  // Initial F0 Student IDs on Day 0 (Set of Student IDs, e.g. {1})
  let initialF0StudentIds = new Set([1]);

  // Simulation Timeline State (Day 0 to Day 7)
  let currentSimDay = 0;
  let simHistory = []; // Array of 8 day snapshots: [Day 0, Day 1, ..., Day 7]
  let playbackTimer = null;
  let isPlaying = false;

  function initClassroomModule() {
    const elCols = document.getElementById('crNumCols');
    const elRows = document.getElementById('crNumRows');
    const elSeats = document.getElementById('crSeatsPerDesk');
    const elSlider = document.getElementById('simDaySlider');

    // Morning and Afternoon environmental parameters
    const elTMorning = document.getElementById('cr_t_morning');
    const elQMorning = document.getElementById('cr_Q_morning');
    const elTAfternoon = document.getElementById('cr_t_afternoon');
    const elQAfternoon = document.getElementById('cr_Q_afternoon');
    const elKm = document.getElementById('cr_km');
    const elQgen = document.getElementById('cr_q');

    const elStudentCount = document.getElementById('crStudentCountInput');

    if (elCols && elRows && elSeats) {
      const handleLayoutChange = () => {
        const colsVal = parseInt(elCols.value, 10) || 3;
        const rowsVal = parseInt(elRows.value, 10) || 5;
        const seatsVal = parseInt(elSeats.value, 10) || 2;

        if (currentSessionView === 'morning') {
          morningLayout.cols = colsVal;
          morningLayout.rows = rowsVal;
          morningLayout.seatsPerDesk = seatsVal;
        } else {
          afternoonLayout.cols = colsVal;
          afternoonLayout.rows = rowsVal;
          afternoonLayout.seatsPerDesk = seatsVal;
        }

        if (elStudentCount && elStudentCount.value) {
          classRosterSize = Math.max(1, parseInt(elStudentCount.value, 10) || 30);
        }

        syncLayoutDropdownsToActiveSession();
        generateDefaultAfternoonAssignment();
        run7DaySimulation();
      };

      elCols.addEventListener('change', handleLayoutChange);
      elRows.addEventListener('change', handleLayoutChange);
      elSeats.addEventListener('change', handleLayoutChange);
    }

    if (elStudentCount) {
      const handleStudentCountChange = () => {
        const countVal = Math.max(1, parseInt(elStudentCount.value, 10) || 30);
        classRosterSize = countVal;
        generateDefaultAfternoonAssignment();
        run7DaySimulation();
      };
      elStudentCount.addEventListener('input', handleStudentCountChange);
      elStudentCount.addEventListener('change', handleStudentCountChange);
    }

    if (elSlider) {
      elSlider.addEventListener('input', e => {
        jumpToSimDay(parseInt(e.target.value, 10) || 0);
      });
    }

    [elTMorning, elQMorning, elTAfternoon, elQAfternoon, elKm, elQgen].forEach(input => {
      if (input) {
        input.addEventListener('input', () => {
          run7DaySimulation();
        });
        input.addEventListener('change', () => {
          run7DaySimulation();
        });
      }
    });

    syncLayoutDropdownsToActiveSession();
    generateDefaultAfternoonAssignment();

    // Run initial 7-day simulation and render immediately
    run7DaySimulation();

  }

  /**
   * Synchronizes layout dropdowns to show settings for the active room (Morning vs Afternoon)
   */
  function syncLayoutDropdownsToActiveSession() {
    const layout = currentSessionView === 'morning' ? morningLayout : afternoonLayout;
    const elCols = document.getElementById('crNumCols');
    const elRows = document.getElementById('crNumRows');
    const elSeats = document.getElementById('crSeatsPerDesk');
    const elTag = document.getElementById('currentRoomConfigTag');
    const elCap = document.getElementById('crCalculatedCapacity');
    const elTableCap = document.getElementById('tableCapacitySpan');

    if (elCols) elCols.value = layout.cols;
    if (elRows) elRows.value = layout.rows;
    if (elSeats) elSeats.value = layout.seatsPerDesk;

    const capacity = layout.cols * layout.rows * layout.seatsPerDesk;
    if (elCap) elCap.textContent = capacity;
    if (elTableCap) elTableCap.textContent = classRosterSize;

    if (elTag) {
      if (currentSessionView === 'morning') {
        elTag.textContent = '🌅 Phòng Ca Sáng (Chính)';
        elTag.style.color = '#b45309';
      } else {
        elTag.textContent = '🌇 Phòng Ca Chiều (Lab / Chức Năng)';
        elTag.style.color = '#6d28d9';
      }
    }
  }

  /**
   * Generates default afternoon seating assignment (distributing N students into afternoon capacity)
   */
  function generateDefaultAfternoonAssignment() {
    const afternoonCap = afternoonLayout.cols * afternoonLayout.rows * afternoonLayout.seatsPerDesk;
    afternoonSeatAssignment = new Array(afternoonCap).fill(null);

    // Place all active students
    for (let i = 0; i < Math.min(classRosterSize, afternoonCap); i++) {
      afternoonSeatAssignment[i] = i + 1;
    }

    // Default pairwise swap for functional group interaction
    for (let i = 0; i < Math.min(classRosterSize, afternoonCap) - 1; i += 2) {
      const temp = afternoonSeatAssignment[i];
      afternoonSeatAssignment[i] = afternoonSeatAssignment[i + 1];
      afternoonSeatAssignment[i + 1] = temp;
    }
  }

  /**
   * Shuffles afternoon seating layout randomly among available seats
   */
  function shuffleAfternoonSeating() {
    const afternoonCap = afternoonLayout.cols * afternoonLayout.rows * afternoonLayout.seatsPerDesk;
    const seatIndices = [];
    for (let i = 0; i < afternoonCap; i++) seatIndices.push(i);

    // Shuffle seat positions
    for (let i = seatIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [seatIndices[i], seatIndices[j]] = [seatIndices[j], seatIndices[i]];
    }

    afternoonSeatAssignment = new Array(afternoonCap).fill(null);
    for (let studentId = 1; studentId <= classRosterSize && studentId <= afternoonCap; studentId++) {
      const seatPos = seatIndices[studentId - 1];
      afternoonSeatAssignment[seatPos] = studentId;
    }

    switchSessionView('afternoon');
    run7DaySimulation();
    showToast('🔀 Đã xáo trộn chỗ ngồi học nhóm / đổi phòng cho Ca Chiều!', 'info');
  }

  /**
   * Syncs afternoon seating layout to sequential student order
   */
  function syncAfternoonWithMorningSeating() {
    const afternoonCap = afternoonLayout.cols * afternoonLayout.rows * afternoonLayout.seatsPerDesk;
    afternoonSeatAssignment = new Array(afternoonCap).fill(null);
    for (let i = 0; i < Math.min(classRosterSize, afternoonCap); i++) {
      afternoonSeatAssignment[i] = i + 1;
    }
    run7DaySimulation();
    showToast('🔄 Đã đồng bộ chỗ ngồi Ca Chiều giống Ca Sáng!', 'success');
  }

  /**
   * Switches visual seating view between Morning and Afternoon
   */
  function switchSessionView(session) {
    currentSessionView = session;
    const tabM = document.getElementById('tabSessionMorning');
    const tabA = document.getElementById('tabSessionAfternoon');
    const ind = document.getElementById('roomSessionIndicator');

    if (tabM && tabA) {
      if (session === 'morning') {
        tabM.classList.add('active');
        tabA.classList.remove('active');
        if (ind) ind.innerHTML = `🌅 SƠ ĐỒ CHỖ NGỒI: CA SÁNG (${morningLayout.cols} Dãy · ${morningLayout.rows} Bàn · ${morningLayout.seatsPerDesk} Ghế)`;
      } else {
        tabA.classList.add('active');
        tabM.classList.remove('active');
        if (ind) ind.innerHTML = `🌇 SƠ ĐỒ CHỖ NGỒI: CA CHIỀU (${afternoonLayout.cols} Dãy · ${afternoonLayout.rows} Bàn · ${afternoonLayout.seatsPerDesk} Ghế)`;
      }
    }

    syncLayoutDropdownsToActiveSession();

    if (simHistory.length > 0) {
      renderSimDayView(currentSimDay);
    }
  }

  /**
   * Changes risk view filter mode: 'combined' | 'morning' | 'afternoon'
   */
  function handleRiskViewModeChange(mode) {
    riskViewMode = mode;
    if (simHistory.length > 0) {
      renderSimDayView(currentSimDay);
    }
  }

  /**
   * Constructs Base Student Roster with coordinates for BOTH Morning and Afternoon rooms
   */
  function createStudentRoster() {
    const students = [];
    crTotalStudents = classRosterSize;

    // 1. Calculate Morning Room Coordinates for each student (1..N)
    const morningCap = morningLayout.cols * morningLayout.rows * morningLayout.seatsPerDesk;
    const studentMorningPos = new Map();

    let mSeatIdx = 0;
    for (let c = 0; c < morningLayout.cols; c++) {
      for (let r = 0; r < morningLayout.rows; r++) {
        for (let s = 0; s < morningLayout.seatsPerDesk; s++) {
          const colNum = c + 1;
          const rowNum = r + 1;
          const seatNum = s + 1;
          const seatKey = `D${colNum}-B${rowNum}-G${seatNum}`;
          const posX = c * (morningLayout.seatsPerDesk * 0.6 + 1.3) + s * 0.6;
          const posY = r * 1.0;

          if (mSeatIdx < classRosterSize) {
            const studentId = mSeatIdx + 1;
            studentMorningPos.set(studentId, {
              seatKey,
              col: colNum,
              row: rowNum,
              seat: seatNum,
              x: posX,
              y: posY,
            });
          }
          mSeatIdx++;
        }
      }
    }

    // 2. Calculate Afternoon Room Coordinates for each student from afternoonSeatAssignment
    const studentAfternoonPos = new Map();
    let aSeatIdx = 0;
    for (let c = 0; c < afternoonLayout.cols; c++) {
      for (let r = 0; r < afternoonLayout.rows; r++) {
        for (let s = 0; s < afternoonLayout.seatsPerDesk; s++) {
          const colNum = c + 1;
          const rowNum = r + 1;
          const seatNum = s + 1;
          const seatKey = `D${colNum}-B${rowNum}-G${seatNum}`;
          const posX = c * (afternoonLayout.seatsPerDesk * 0.6 + 1.3) + s * 0.6;
          const posY = r * 1.0;

          const studentId = afternoonSeatAssignment[aSeatIdx];
          if (studentId) {
            studentAfternoonPos.set(studentId, {
              seatKey,
              col: colNum,
              row: rowNum,
              seat: seatNum,
              x: posX,
              y: posY,
            });
          }
          aSeatIdx++;
        }
      }
    }

    // 3. Build comprehensive Student Agent objects
    for (let id = 1; id <= classRosterSize; id++) {
      const padId = String(id).padStart(2, '0');
      const name = `STT ${id}`;
      const isInitialF0 = initialF0StudentIds.has(id);


      const mPos = studentMorningPos.get(id) || { seatKey: 'Chưa xếp', col: 1, row: 1, seat: 1, x: 0, y: 0 };
      const aPos = studentAfternoonPos.get(id) || { seatKey: 'Chưa xếp', col: 1, row: 1, seat: 1, x: 0, y: 0 };

      students.push({
        id,
        name,
        isInitialF0,
        status: isInitialF0 ? 'INFECTED' : 'HEALTHY',
        morningPos: mPos,
        afternoonPos: aPos,
        morningSeatKey: mPos.seatKey,
        afternoonSeatKey: aPos.seatKey,
        risk: 0.0,
        riskMorning: 0.0,
        riskAfternoon: 0.0,
        riskCombined: 0.0,
      });
    }

    return students;
  }

  /**
   * Core Agent-Based Multi-Session 7-Day Simulation Algorithm
   * Integrates:
   * 1. Morning Session Wells-Riley ($t_{morning}, Q_{morning}, \vec{X}_{morning, i}$)
   * 2. Afternoon Session Wells-Riley ($t_{afternoon}, Q_{afternoon}, \vec{X}_{afternoon, i}$)
   * 3. Combined Daily Non-Transmission Formula: $(1 - P_{m})(1 - P_{a})$
   * 4. Stochastic Bernoulli Trials per day
   */
  // Forecast Horizon (7 to 30 days)
  let simHorizonDays = 7;

  function setForecastHorizon(days) {
    const d = Math.max(7, Math.min(30, parseInt(days) || 7));
    simHorizonDays = d;

    // Update segmented buttons
    ['btnHorizon7', 'btnHorizon14', 'btnHorizon30'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    if (d === 7) document.getElementById('btnHorizon7')?.classList.add('active');
    else if (d === 14) document.getElementById('btnHorizon14')?.classList.add('active');
    else if (d === 30) document.getElementById('btnHorizon30')?.classList.add('active');

    // Update custom slider & badges
    const slider = document.getElementById('horizonCustomSlider');
    if (slider) slider.value = d;
    const sliderVal = document.getElementById('horizonSliderValue');
    if (sliderVal) sliderVal.textContent = `${d} ngày`;

    const displayBadge = document.getElementById('horizonDisplayBadge');
    if (displayBadge) {
      displayBadge.textContent = d === 7 ? '7 ngày (Chu kỳ ngắn)' : (d === 14 ? '14 ngày (2 tuần)' : (d === 30 ? '30 ngày (1 tháng)' : `${d} ngày tùy chỉnh`));
    }

    const tableHorizonSpan = document.getElementById('tableHorizonSpan');
    if (tableHorizonSpan) tableHorizonSpan.textContent = d;

    const simDaySlider = document.getElementById('simDaySlider');
    if (simDaySlider) {
      simDaySlider.max = d;
      if (currentSimDay > d) currentSimDay = d;
    }

    updatePlayButtonUI(false);
    runEpidemicSimulation();
    showToast(`⏱️ Đã chuyển chu kỳ dự báo sang ${d} ngày!`, 'info');
  }

  function handleHorizonSliderChange(val) {
    const d = parseInt(val) || 7;
    setForecastHorizon(d);
  }

  /**
   * Generates dynamic slider ticks for the timeline slider
   */
  function renderSliderTicks(horizon, activeDay) {
    const container = document.getElementById('simSliderTicksContainer');
    if (!container) return;

    let step = 1;
    if (horizon > 20) step = 5;
    else if (horizon > 10) step = 2;

    const tickDays = [];
    for (let i = 0; i <= horizon; i += step) {
      tickDays.push(i);
    }
    if (tickDays[tickDays.length - 1] !== horizon) {
      tickDays.push(horizon);
    }

    let html = '';
    tickDays.forEach(d => {
      const isActive = d === activeDay ? 'active' : '';
      let subLabel = '';
      if (d === 0) subLabel = 'F0 Có Mặt';
      else if (d === 2) subLabel = 'Phát Bệnh';
      else if (d === 7) subLabel = 'Tuần 1';
      else if (d === 14) subLabel = 'Tuần 2';
      else if (d === 30) subLabel = '1 Tháng';

      html += `
        <span class="tick ${isActive}" onclick="window.jumpToSimDay(${d})">
          <strong>Ngày ${d}</strong>
          ${subLabel ? `<small>${subLabel}</small>` : ''}
        </span>
      `;
    });

    container.innerHTML = html;
  }

  function getDayTitle(dayIndex, horizon) {
    if (dayIndex === 0) return 'Ngày 0: Khởi phát ổ dịch (F0 có mặt trong lớp)';
    if (dayIndex === 1) return 'Ngày 1: F0 ban đầu nghỉ cách ly ở nhà, các ca lây bắt đầu ủ bệnh';
    if (dayIndex === 2) return 'Ngày 2: Ca F0 thứ phát phát bệnh trong lớp (+2 ngày ủ bệnh)';
    if (dayIndex === 3) return 'Ngày 3: Ca F0 thứ phát nghỉ cách ly, theo dõi tiếp xúc 2 ca';
    if (dayIndex <= 5) return `Ngày ${dayIndex}: Tiếp tục theo dõi chu kỳ ủ bệnh & cách ly điều trị`;
    if (dayIndex === 7) return `Ngày 7: F0 ban đầu bắt đầu hồi phục, xuất hiện kháng thể`;
    if (dayIndex <= 10) return `Ngày ${dayIndex}: Đợt lây nhiễm đạt đỉnh (Peak) và bắt đầu thoái trào`;
    if (dayIndex <= 14) return `Ngày ${dayIndex}: Đa số ca cách ly đã khỏi bệnh, số ca trong lớp giảm rõ rệt`;
    return `Ngày ${dayIndex}: Ổ dịch thoái lui hoàn toàn, lớp học an toàn trở lại`;
  }

  /**
   * Executes Epidemic Simulation over the specified horizon (7 to 30 days)
   * Integrates:
   * 1. Morning Session Wells-Riley ($t_{morning}, Q_{morning}, \vec{X}_{morning, i}$)
   * 2. Afternoon Session Wells-Riley ($t_{afternoon}, Q_{afternoon}, \vec{X}_{afternoon, i}$)
   * 3. Combined Daily Formula: $P = 1 - (1 - P_m)(1 - P_a)$
   * 4. Extended SEIR Dynamics: Susceptible -> Exposed (2d) -> Infectious (1d in class) -> Isolated (5d at home) -> Recovered (Immune)
   */
  function runEpidemicSimulation() {
    const km = parseFloat(document.getElementById('cr_km')?.value || '1.0');
    const kh = 1.0;
    const p = 0.50;
    const q = parseFloat(document.getElementById('cr_q')?.value || '10.0');

    // Morning Session Parameters
    const tMorning = parseFloat(document.getElementById('cr_t_morning')?.value || '4.0');
    const QMorning = Math.max(20.0, parseFloat(document.getElementById('cr_Q_morning')?.value || '380.0'));

    // Afternoon Session Parameters
    const tAfternoon = parseFloat(document.getElementById('cr_t_afternoon')?.value || '3.5');
    const QAfternoon = Math.max(20.0, parseFloat(document.getElementById('cr_Q_afternoon')?.value || '200.0'));

    const baseStudents = createStudentRoster();
    const totalN = baseStudents.length;
    crTotalStudents = totalN;

    simHistory = [];

    // Track infection day: student.id -> dayInfected
    const studentInfectionDay = new Map();
    baseStudents.forEach(st => {
      if (initialF0StudentIds.has(st.id)) {
        studentInfectionDay.set(st.id, -2);
      } else {
        studentInfectionDay.set(st.id, null);
      }
    });

    let seed = 54321;
    function pseudoRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    let avgMorningRiskDay0 = 0;
    let avgAfternoonRiskDay0 = 0;
    let avgCombinedRiskDay0 = 0;
    let countedSusceptibleDay0 = 0;

    // Step through Day 0 to Day simHorizonDays
    for (let day = 0; day <= simHorizonDays; day++) {
      let newlyInfectedToday = 0;

      // 1. Determine each student's health status on `day` (SEIR + Recovery Rule)
      const currentDayStudents = baseStudents.map(st => {
        const infDay = studentInfectionDay.get(st.id);
        let status = 'HEALTHY';

        if (infDay !== null) {
          const daysSinceInfection = day - infDay;
          if (daysSinceInfection < 2) {
            status = 'EXPOSED'; // Ủ bệnh (2 ngày đầu, chưa có triệu chứng)
          } else if (daysSinceInfection === 2) {
            status = 'INFECTED'; // Phát bệnh & lây lan trong lớp học ngày hôm nay
          } else if (daysSinceInfection > 2 && daysSinceInfection <= 7) {
            status = 'ISOLATED'; // Cách ly nghỉ học tại nhà 5 ngày
          } else {
            status = 'RECOVERED'; // Khỏi bệnh sau 7 ngày nhiễm, có kháng thể miễn dịch, an toàn & không tái nhiễm
          }
        }

        return {
          ...st,
          status,
          isInitialF0: day === 0 && initialF0StudentIds.has(st.id),
          dayInfected: infDay,
          risk: 0.0,
          riskMorning: 0.0,
          riskAfternoon: 0.0,
          riskCombined: 0.0,
        };
      });

      // Active F0 in classroom today (chỉ người đang INFECTED mới có mặt trong lớp và phát tán aerosol)
      const activeF0Students = currentDayStudents.filter(s => s.status === 'INFECTED');

      // 2. Compute Multi-Session Infection Exposure if F0 is present in class
      if (activeF0Students.length > 0 && day < simHorizonDays) {
        currentDayStudents.forEach(agent => {
          if (agent.status === 'HEALTHY' && studentInfectionDay.get(agent.id) === null) {
            // A. Morning Session Dose Calculation
            let morningDose = 0.0;
            activeF0Students.forEach(f0 => {
              const distM = Math.sqrt(Math.pow(agent.morningPos.x - f0.morningPos.x, 2) + Math.pow(agent.morningPos.y - f0.morningPos.y, 2));
              let kdM = 0.20;
              if (distM < 0.85) kdM = 1.0;
              else if (distM < 1.6) kdM = 0.70;
              else if (distM < 2.8) kdM = 0.40;

              morningDose += ((1.0 * p * q * tMorning) / QMorning) * kdM * km * kh;
            });
            const pMorning = 1.0 - Math.exp(-morningDose);

            // B. Afternoon Session Dose Calculation
            let afternoonDose = 0.0;
            activeF0Students.forEach(f0 => {
              const distA = Math.sqrt(Math.pow(agent.afternoonPos.x - f0.afternoonPos.x, 2) + Math.pow(agent.afternoonPos.y - f0.afternoonPos.y, 2));
              let kdA = 0.20;
              if (distA < 0.85) kdA = 1.0;
              else if (distA < 1.6) kdA = 0.70;
              else if (distA < 2.8) kdA = 0.40;

              afternoonDose += ((1.0 * p * q * tAfternoon) / QAfternoon) * kdA * km * kh;
            });
            const pAfternoon = 1.0 - Math.exp(-afternoonDose);

            // C. Combined Daily Probability
            const pCombined = 1.0 - ((1.0 - pMorning) * (1.0 - pAfternoon));

            agent.riskMorning = Math.round(pMorning * 1000) / 10;
            agent.riskAfternoon = Math.round(pAfternoon * 1000) / 10;
            agent.riskCombined = Math.round(pCombined * 1000) / 10;

            if (day === 0) {
              avgMorningRiskDay0 += agent.riskMorning;
              avgAfternoonRiskDay0 += agent.riskAfternoon;
              avgCombinedRiskDay0 += agent.riskCombined;
              countedSusceptibleDay0++;
            }

            // Stochastic Bernoulli Trial
            const randVal = pseudoRandom();
            if (randVal < pCombined) {
              studentInfectionDay.set(agent.id, day);
              newlyInfectedToday++;
            }
          }
        });
      }

      // 3. Set display risk based on riskViewMode
      currentDayStudents.forEach(agent => {
        if (agent.status === 'INFECTED') {
          agent.risk = 100.0;
        } else if (agent.status === 'RECOVERED') {
          agent.risk = 0.0;
        } else if (riskViewMode === 'morning') {
          agent.risk = agent.riskMorning;
        } else if (riskViewMode === 'afternoon') {
          agent.risk = agent.riskAfternoon;
        } else {
          agent.risk = agent.riskCombined;
        }
      });

      // 4. Compute Summary Statistics for this Day Snapshot
      let totalExposed = 0;
      let totalInfectious = 0;
      let totalIsolated = 0;
      let totalRecovered = 0;
      let totalHealthy = 0;

      currentDayStudents.forEach(agent => {
        if (agent.status === 'EXPOSED') totalExposed++;
        else if (agent.status === 'INFECTED') totalInfectious++;
        else if (agent.status === 'ISOLATED') totalIsolated++;
        else if (agent.status === 'RECOVERED') totalRecovered++;
        else totalHealthy++;
      });

      const totalAbsent = Math.min(totalIsolated, totalN);
      const absentPercent = totalN > 0 ? (totalAbsent / totalN) * 100.0 : 0.0;

      let statusLabel = '🟢 An toàn';
      let statusClass = 'safe';
      if (absentPercent >= 35.0) {
        statusLabel = '🟣 Đỉnh dịch (Nhiều ca)';
        statusClass = 'critical';
      } else if (totalInfectious > 1 || absentPercent >= 15.0) {
        statusLabel = '🔴 Bùng phát lây lan';
        statusClass = 'danger';
      } else if (totalInfectious > 0 || totalExposed > 0) {
        statusLabel = '🟡 Có ca lây nhiễm';
        statusClass = 'warning';
      } else if (totalRecovered > 0 && totalInfectious === 0 && totalExposed === 0) {
        statusLabel = '🟢 Dập tắt dịch';
        statusClass = 'safe';
      }

      simHistory.push({
        day,
        students: currentDayStudents,
        newCases: newlyInfectedToday,
        totalExposed,
        totalInfectious,
        totalIsolated,
        totalRecovered,
        totalAbsent,
        totalHealthy,
        absentPercent,
        statusLabel,
        statusClass,
      });
    }

    // Update Comparison Analytics Card
    if (countedSusceptibleDay0 > 0) {
      const avgM = (avgMorningRiskDay0 / countedSusceptibleDay0).toFixed(1);
      const avgA = (avgAfternoonRiskDay0 / countedSusceptibleDay0).toFixed(1);
      const avgC = (avgCombinedRiskDay0 / countedSusceptibleDay0).toFixed(1);

      const elM = document.getElementById('compMorningRate');
      const elA = document.getElementById('compAfternoonRate');
      const elC = document.getElementById('compDailyCombinedRate');
      const elAStat = document.getElementById('compAfternoonStatus');

      if (elM) elM.textContent = `P = ${avgM}%`;
      if (elA) elA.textContent = `P = ${avgA}%`;
      if (elC) elC.textContent = `P = ${avgC}%`;

      if (elAStat) {
        if (parseFloat(avgA) > parseFloat(avgM)) {
          const diffPct = Math.round(((avgA - avgM) / Math.max(0.1, avgM)) * 100);
          elAStat.innerHTML = `🔴 Nguy cơ cao hơn (+${diffPct}%) do phòng máy lạnh kín`;
        } else {
          elAStat.innerHTML = `🟢 Nguy cơ tương đương hoặc thấp hơn`;
        }
      }
    }

    // Render dynamic ticks for current horizon
    renderSliderTicks(simHorizonDays, currentSimDay);

    // Render current day view and progression table
    renderSimDayView(currentSimDay);
    render7DayProgressionTable();
  }

  const run7DaySimulation = runEpidemicSimulation;

  /**
   * Renders Classroom View for a specific Day (0 - simHorizonDays)
   */
  function renderSimDayView(dayIndex) {
    if (dayIndex < 0 || dayIndex >= simHistory.length) return;
    currentSimDay = dayIndex;

    const snap = simHistory[dayIndex];
    if (!snap) return;

    // Update Day Title & Slider
    const elTitle = document.getElementById('currentDayTitle');
    if (elTitle) elTitle.textContent = getDayTitle(dayIndex, simHorizonDays);

    const elSlider = document.getElementById('simDaySlider');
    if (elSlider) {
      elSlider.max = simHorizonDays;
      elSlider.value = dayIndex;
    }

    // Update Slider Ticks highlight
    document.querySelectorAll('#simSliderTicksContainer .tick').forEach((tick) => {
      const dayNum = parseInt(tick.querySelector('strong')?.textContent?.replace(/\D/g, '') || '-1');
      if (dayNum === dayIndex) tick.classList.add('active');
      else tick.classList.remove('active');
    });

    // Update Class Summary Dashboard
    const elSumStudents = document.getElementById('sumClassStudents');
    const elSumNewF0 = document.getElementById('sumClassNewF0');
    const elSumExposed = document.getElementById('sumClassExposed');
    const elSumTotalAbsent = document.getElementById('sumClassTotalAbsent');
    const elSumAbsentPercent = document.getElementById('sumClassAbsentPercent');
    const elSumRecovered = document.getElementById('sumClassRecovered');
    const elSumHealthy = document.getElementById('sumClassHealthyRemaining');
    const elSumHealthyPercent = document.getElementById('sumClassHealthyPercent');

    if (elSumStudents) elSumStudents.textContent = crTotalStudents;
    if (elSumNewF0) elSumNewF0.textContent = snap.totalInfectious;
    if (elSumExposed) elSumExposed.textContent = snap.totalExposed;
    if (elSumTotalAbsent) elSumTotalAbsent.textContent = snap.totalAbsent;
    if (elSumAbsentPercent) elSumAbsentPercent.textContent = `${snap.absentPercent.toFixed(1)}% sĩ số`;
    if (elSumRecovered) elSumRecovered.textContent = snap.totalRecovered || 0;
    if (elSumHealthy) elSumHealthy.textContent = snap.totalHealthy;
    if (elSumHealthyPercent) elSumHealthyPercent.textContent = `${((snap.totalHealthy / crTotalStudents) * 100).toFixed(1)}%`;

    // Render Classroom Layout (Dãy - Bàn - Ghế) for Active Session
    renderClassroomColumnsDOM(snap.students);

    // Highlight row in progression table
    document.querySelectorAll('#simProgressionTableBody tr').forEach((row, idx) => {
      if (idx === dayIndex) row.classList.add('current-sim-day');
      else row.classList.remove('current-sim-day');
    });
  }

  /**
   * Renders the Classroom Hierarchical Columns & Desk Clusters into DOM for the Active Room Layout
   */
  function renderClassroomColumnsDOM(studentsList) {
    const container = document.getElementById('classroomColumnsLayout');
    if (!container) return;

    const layout = currentSessionView === 'morning' ? morningLayout : afternoonLayout;
    let html = '';

    for (let c = 0; c < layout.cols; c++) {
      const colNum = c + 1;
      html += `
        <div class="desk-column">
          <div class="column-header">🏛️ DÃY ${colNum}</div>
      `;

      for (let r = 0; r < layout.rows; r++) {
        const rowNum = r + 1;
        html += `
          <div class="desk-cluster">
            <div class="desk-label">Bàn ${rowNum}</div>
            <div class="desk-seats-row">
        `;

        for (let s = 0; s < layout.seatsPerDesk; s++) {
          const seatNum = s + 1;
          const seatKey = `D${colNum}-B${rowNum}-G${seatNum}`;

          // Find student seated here based on current session view
          let studentObj = null;
          if (currentSessionView === 'afternoon') {
            const seatIdx = (c * (layout.rows * layout.seatsPerDesk)) + (r * layout.seatsPerDesk) + s;
            const studentId = afternoonSeatAssignment[seatIdx];
            if (studentId) {
              studentObj = studentsList.find(item => item.id === studentId);
            }
          } else {
            studentObj = studentsList.find(item => item.morningSeatKey === seatKey);
          }

          if (studentObj) {
            let stateClass = 'healthy seat-healthy';
            let icon = '👤';
            let statusText = 'Khỏe mạnh';

            const isF0 = studentObj.isInitialF0 || studentObj.status === 'INFECTED';

            if (isF0) {
              stateClass = 'infectious-class seat-f0 f0-selected';
              icon = '🦠';
              statusText = 'F0 Mầm bệnh';
            } else if (studentObj.status === 'EXPOSED') {
              stateClass = 'exposed seat-exposed';
              icon = '🟡';
              statusText = 'Ủ bệnh';
            } else if (studentObj.status === 'ISOLATED') {
              stateClass = 'isolated-home seat-isolated';
              icon = '🏠';
              statusText = 'Nghỉ cách ly';
            } else if (studentObj.status === 'RECOVERED') {
              stateClass = 'recovered seat-recovered';
              icon = '🛡️';
              statusText = 'Đã khỏi';
            }

            const studentLabel = `${studentObj.name}`;

            html += `
              <div class="seat-box ${stateClass}" 
                   data-seat-key="${seatKey}"
                   data-student-id="${studentObj.id}"
                   onclick="window.handleToggleF0ByStudentId(${studentObj.id})"
                   onmouseenter="window.showSeatTooltipAgent(event, ${studentObj.id}, '${seatKey}')"
                   onmouseleave="window.hideSeatTooltip()">
                <span class="seat-icon">${icon}</span>
                <span class="seat-pos">${seatKey}</span>
                <span class="seat-name">${escapeHtml(studentLabel)}</span>
                <span class="seat-status-pill">${statusText}</span>
              </div>
            `;
          } else {
            // Empty Seat
            html += `
              <div class="seat-box empty-seat" 
                   data-seat-key="${seatKey}"
                   title="Ghế trống - Chưa xếp học sinh">
                <span class="seat-icon">🪑</span>
                <span class="seat-pos">${seatKey}</span>
                <span class="seat-name" style="opacity:0.6;">Ghế trống</span>
                <span class="seat-status-pill" style="background:#e2e8f0; color:#64748b;">Trống</span>
              </div>
            `;
          }
        }

        html += `
            </div>
          </div>
        `;
      }

      html += `
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Renders Epidemic Progression Table with SEIR Columns
   */
  function render7DayProgressionTable() {
    const tbody = document.getElementById('simProgressionTableBody');
    if (!tbody) return;

    tbody.innerHTML = simHistory.map(snap => {
      const isCurrent = snap.day === currentSimDay ? 'class="current-sim-day"' : '';
      const dayLabel = snap.day === 0 ? '<strong>Ngày 0 (Khởi phát)</strong>' : `Ngày ${snap.day}`;

      return `
        <tr ${isCurrent} onclick="window.jumpToSimDay(${snap.day})" style="cursor:pointer;">
          <td>${dayLabel}</td>
          <td style="color:#f59e0b; font-weight:700;">+${snap.newCases} ca</td>
          <td><span style="color:#b45309; font-weight:700;">${snap.totalExposed} HS</span></td>
          <td><strong style="color:#ef4444;">${snap.totalInfectious} HS</strong></td>
          <td><strong style="color:#64748b;">${snap.totalIsolated}</strong> HS</td>
          <td><span style="color:#16a34a; font-weight:700;">${snap.totalRecovered || 0} HS</span></td>
          <td><strong style="color:#10b981;">${snap.totalHealthy}</strong> HS</td>
          <td>${snap.absentPercent.toFixed(1)}%</td>
          <td><span class="badge-status ${snap.statusClass}">${snap.statusLabel}</span></td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Toggle F0 Click Handler by Student ID
   */
  function handleToggleF0ByStudentId(studentId) {
    if (!studentId) return;

    if (currentSimDay !== 0) {
      showToast('💡 Tự động chuyển về Ngày 0 để bạn chọn ca F0 khởi đầu!', 'info');
      jumpToSimDay(0);
    }

    if (initialF0StudentIds.has(studentId)) {
      if (initialF0StudentIds.size === 1) {
        showToast('⚠️ Phải giữ lại ít nhất 1 ca F0 ban đầu trong lớp!', 'warning');
        return;
      }
      initialF0StudentIds.delete(studentId);
      showToast(`🟢 Đã hủy chọn HS ${studentId} làm F0.`, 'info');
    } else {
      initialF0StudentIds.add(studentId);
      showToast(`🔴 Đã chọn HS ${studentId} là ca F0 khởi phát!`, 'warning');
    }

    runEpidemicSimulation();
  }

  function handleToggleF0(seatKey, studentId) {
    if (studentId) {
      handleToggleF0ByStudentId(studentId);
    }
  }

  const handleSeatClick = handleToggleF0;

  /**
   * Jump to specific day in simulation
   */
  function jumpToSimDay(day) {
    renderSimDayView(day);
  }

  /**
   * Step forward or backward in simulation
   */
  function stepSimulationDay(delta) {
    let nextDay = currentSimDay + delta;
    if (nextDay < 0) nextDay = 0;
    if (nextDay > simHorizonDays) nextDay = simHorizonDays;
    jumpToSimDay(nextDay);
  }

  /**
   * Toggle automatic playback up to simHorizonDays
   */
  function toggleSimulationPlayback() {
    if (isPlaying) {
      clearInterval(playbackTimer);
      playbackTimer = null;
      isPlaying = false;
      updatePlayButtonUI(false);
      showToast('⏸️ Đã tạm dừng mô phỏng.', 'info');
    } else {
      if (currentSimDay >= simHorizonDays) {
        currentSimDay = 0;
        jumpToSimDay(0);
      }

      isPlaying = true;
      updatePlayButtonUI(true);
      showToast(`▶ Đang phát mô phỏng diễn biến dịch ${simHorizonDays} ngày (2 ca/ngày)...`, 'info');

      const intervalMs = simHorizonDays > 14 ? 650 : 900;
      playbackTimer = setInterval(() => {
        if (currentSimDay < simHorizonDays) {
          jumpToSimDay(currentSimDay + 1);
        } else {
          clearInterval(playbackTimer);
          playbackTimer = null;
          isPlaying = false;
          updatePlayButtonUI(false);
          showToast(`🎉 Đã hoàn thành phát mô phỏng ${simHorizonDays} ngày!`, 'success');
        }
      }, intervalMs);
    }
  }

  function updatePlayButtonUI(playing) {
    const icon = document.getElementById('playIcon');
    const text = document.getElementById('playText');
    const btn = document.getElementById('btnPlaySim');
    if (icon && text && btn) {
      if (playing) {
        icon.textContent = '⏸';
        text.textContent = 'Tạm dừng mô phỏng';
        btn.style.background = '#f59e0b';
      } else {
        icon.textContent = '▶';
        text.textContent = `Phát mô phỏng ${simHorizonDays} ngày`;
        btn.style.background = '#10b981';
      }
    }
  }

  function randomizeInitialF0() {
    initialF0StudentIds.clear();
    const id1 = Math.floor(Math.random() * classRosterSize) + 1;
    let id2 = Math.floor(Math.random() * classRosterSize) + 1;
    if (id2 === id1 && classRosterSize > 1) id2 = (id1 % classRosterSize) + 1;

    initialF0StudentIds.add(id1);
    if (classRosterSize > 1) initialF0StudentIds.add(id2);

    jumpToSimDay(0);
    runEpidemicSimulation();
    showToast(`🎲 Đã chọn ngẫu nhiên 2 ca F0: HS ${id1} và HS ${id2}!`, 'info');
  }

  function resetClassroomToHealthy() {
    initialF0StudentIds.clear();
    initialF0StudentIds.add(1);
    jumpToSimDay(0);
    runEpidemicSimulation();
    showToast('🔄 Đã đặt lại sơ đồ lớp về 1 ca F0 ban đầu tại HS 01.', 'success');
  }

  function showSeatTooltipAgent(e, studentId, seatKey) {
    const snap = simHistory[currentSimDay];
    if (!snap) return;

    const studentObj = snap.students.find(s => s.id === studentId);
    const tooltip = document.getElementById('seatTooltip');
    if (!studentObj || !tooltip) return;

    let statusText = '🟢 Khỏe mạnh (Chưa nhiễm)';
    if (studentObj.status === 'INFECTED') statusText = '🚨 F0 Đang phát bệnh trong lớp (Nguồn lây)';
    else if (studentObj.status === 'EXPOSED') statusText = `🟡 Đang ủ bệnh (Nhiễm Ngày ${studentObj.dayInfected} - Chưa có triệu chứng)`;
    else if (studentObj.status === 'ISOLATED') statusText = '🏠 Đã cách ly nghỉ học ở nhà (Không còn lây trong lớp)';
    else if (studentObj.status === 'RECOVERED') statusText = '🛡️ Đã khỏi bệnh (Có kháng thể miễn dịch - An toàn)';

    const sessionLabel = currentSessionView === 'afternoon' ? 'Ca Chiều (Lab)' : 'Ca Sáng (Phòng 11A)';

    tooltip.innerHTML = `
      <strong>HS ${String(studentObj.id).padStart(2, '0')} - ${escapeHtml(studentObj.name)}</strong>
      <div class="tt-row"><span>Vị trí (${sessionLabel}):</span> <span>${seatKey}</span></div>
      <div class="tt-row"><span>Trạng thái:</span> <span>${statusText}</span></div>
      <div class="tt-row"><span>Mốc thời gian:</span> <span>Ngày ${currentSimDay} / ${simHorizonDays}</span></div>
      ${studentObj.status === 'HEALTHY' ? `
        <div class="tt-row" style="margin-top:4px; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.2);">
          <span>🌅 Rủi ro Ca Sáng:</span> <strong>${studentObj.riskMorning || 0}%</strong>
        </div>
        <div class="tt-row">
          <span>🌇 Rủi ro Ca Chiều:</span> <strong>${studentObj.riskAfternoon || 0}%</strong>
        </div>
        <div class="tt-row" style="color:#fde047;">
          <span>🌐 Tổng hợp cả ngày:</span> <strong>${studentObj.riskCombined || 0}%</strong>
        </div>
      ` : ''}
    `;

    const rect = e.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    tooltip.style.top = `${rect.top - 8}px`;
    tooltip.style.display = 'block';
  }

  function hideSeatTooltip() {
    const tooltip = document.getElementById('seatTooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  // Hook classroom initialization safely regardless of script load timing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initClassroomModule();
    });
  } else {
    initClassroomModule();
  }

  // Expose global window methods for inline onclick events
  window.setForecastHorizon = setForecastHorizon;
  window.handleHorizonSliderChange = handleHorizonSliderChange;
  window.runEpidemicSimulation = runEpidemicSimulation;
  window.switchSessionView = switchSessionView;
  window.shuffleAfternoonSeating = shuffleAfternoonSeating;
  window.syncAfternoonWithMorningSeating = syncAfternoonWithMorningSeating;
  window.handleRiskViewModeChange = handleRiskViewModeChange;
  window.handleToggleF0 = handleToggleF0;
  window.handleToggleF0ByStudentId = handleToggleF0ByStudentId;
  window.handleSeatClick = handleSeatClick;
  window.jumpToSimDay = jumpToSimDay;
  window.stepSimulationDay = stepSimulationDay;
  window.toggleSimulationPlayback = toggleSimulationPlayback;
  window.randomizeInitialF0 = randomizeInitialF0;
  window.resetClassroomToHealthy = resetClassroomToHealthy;
  window.run7DaySimulation = runEpidemicSimulation;
  window.showSeatTooltipAgent = showSeatTooltipAgent;
  window.hideSeatTooltip = hideSeatTooltip;

  // Expose global FluUi methods
  window.FluUi = {
    checkBackendHealth,
    handleCalculate,
    handleReset,
    handleExportPdf,
    handleLoadPresets,
    applyScenarioPreset,
    promptCustomApiUrl,
    showToast,
    run7DaySimulation: runEpidemicSimulation,
    runEpidemicSimulation,
    setForecastHorizon,
    jumpToSimDay,
    switchSessionView,
    shuffleAfternoonSeating,
    syncAfternoonWithMorningSeating,
  };
  window.showSeatTooltipAgent = showSeatTooltipAgent;
  window.hideSeatTooltip = hideSeatTooltip;

  // Expose global FluUi methods
  window.FluUi = {
    checkBackendHealth,
    handleCalculate,
    handleReset,
    handleExportPdf,
    handleLoadPresets,
    applyScenarioPreset,
    promptCustomApiUrl,
    showToast,
    run7DaySimulation,
    jumpToSimDay,
    switchSessionView,
    shuffleAfternoonSeating,
    syncAfternoonWithMorningSeating,
  };
})();



