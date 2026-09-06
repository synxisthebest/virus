/**
 * ==============================================================================
 * API Client Service for Influenza Transmission Modeling (Extended Wells-Riley)
 * ==============================================================================
 * Connects Front-end UI to FastAPI Backend RESTful endpoints.
 * Features: Timeout handling, input validation, robust error parsing, and fallback.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FluApiClient = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configurable base URL: check localStorage, window config, or default to localhost:8000
  let savedCustomUrl = null;
  try {
    if (typeof localStorage !== 'undefined') savedCustomUrl = localStorage.getItem('API_BASE_URL');
  } catch (_) {}

  const DEFAULT_BASE_URL = savedCustomUrl
    || (typeof window !== 'undefined' && (window.VITE_API_URL || window.REACT_APP_API_URL || window.API_BASE_URL))
    || 'https://virus-qr4l.onrender.com/api/v1';


  const DEFAULT_TIMEOUT_MS = 12000; // 12 seconds timeout

  class ApiError extends Error {
    constructor(message, status, details = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  }

  /**
   * Internal fetch wrapper with AbortController timeout & standardized error handling
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: Yêu cầu thất bại`;
        let errorDetails = null;

        if (data && typeof data === 'object') {
          if (data.message) errorMsg = data.message;
          else if (data.detail) {
            errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
          }
          if (data.details) errorDetails = data.details;
        }

        throw new ApiError(errorMsg, response.status, errorDetails);
      }

      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new ApiError('Quá thời gian kết nối (Request Timeout). Vui lòng kiểm tra lại máy chủ backend.', 408);
      }
      if (err instanceof ApiError) {
        throw err;
      }
      // Network or CORS connection error
      throw new ApiError(
        `Không thể kết nối đến máy chủ API Backend (${FluApiClient?.baseURL || 'https://virus-qr4l.onrender.com/api/v1'}). Hãy kiểm tra kết nối mạng hoặc trạng thái Render.`,
        0
      );
    }
  }

  const FluApiClient = {
    baseURL: DEFAULT_BASE_URL,

    /**
     * Sets a custom base URL dynamically
     * @param {string} url 
     */
    setBaseURL(url) {
      if (url) {
        this.baseURL = url.replace(/\/+$/, '');
      }
    },

    /**
     * Health check endpoint to verify backend connectivity
     * @returns {Promise<Object>}
     */
    async checkHealth() {
      return fetchWithTimeout(`${this.baseURL}/health`, { method: 'GET' }, 5000);
    },

    /**
     * Fetches default epidemiological lookup constants and presets
     * @returns {Promise<Object>}
     */
    async getPresets() {
      return fetchWithTimeout(`${this.baseURL}/constants/presets`, { method: 'GET' });
    },

    /**
     * Calculates instant infection probability via Wells-Riley model
     * @param {Object} payload 
     * @returns {Promise<Object>}
     */
    async predictWellsRiley(payload) {
      // Basic input validation
      if (!payload) throw new ApiError('Dữ liệu đầu vào không được để trống', 400);
      if (!payload.exposure_time_hours || payload.exposure_time_hours <= 0) {
        throw new ApiError('Thời gian tiếp xúc (exposure_time_hours) phải lớn hơn 0', 400);
      }
      if (!payload.ventilation) {
        throw new ApiError('Thông số thông gió (ventilation) là bắt buộc', 400);
      }

      return fetchWithTimeout(`${this.baseURL}/predict/wells-riley`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    /**
     * Simulates time-series risk evolution trajectory
     * @param {Object} payload 
     * @returns {Promise<Object>}
     */
    async simulateTimeSeries(payload) {
      if (!payload) throw new ApiError('Dữ liệu mô phỏng không được để trống', 400);

      return fetchWithTimeout(`${this.baseURL}/simulate/time-series`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    /**
     * Multi-agent spatial classroom grid simulation
     * @param {Object} payload 
     * @returns {Promise<Object>}
     */
    async simulateSpatialClassroom(payload) {
      if (!payload || !Array.isArray(payload.seats)) {
        throw new ApiError('Dữ liệu vị trí chỗ ngồi lớp học không hợp lệ', 400);
      }

      return fetchWithTimeout(`${this.baseURL}/simulate/spatial-classroom`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    /**
     * Executes both instant prediction and time-series simulation in parallel
     * @param {Object} predictPayload 
     * @param {Object} timeSeriesPayload 
     * @returns {Promise<{ prediction: Object, timeSeries: Object }>}
     */
    async runFullAssessment(predictPayload, timeSeriesPayload) {
      const [prediction, timeSeries] = await Promise.all([
        this.predictWellsRiley(predictPayload),
        this.simulateTimeSeries(timeSeriesPayload || predictPayload),
      ]);
      return { prediction, timeSeries };
    }
  };

  return FluApiClient;
});
