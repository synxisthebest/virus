# 🦠 Wells–Riley Influenza Transmission Prediction Engine (Back-End RESTful API)

Hệ thống Back-end chuyên sâu ứng dụng mô hình toán học **Wells–Riley mở rộng** kết hợp với các hệ số dịch tễ học thực nghiệm nhằm tính toán, dự đoán và mô phỏng nguy cơ lây lan virus Cúm (Influenza) trong không gian kín (lớp học, phòng họp, văn phòng).

---

## 📐 1. Cơ Sở Toán Học & Dịch Tễ Học

### 1.1. Công thức Wells–Riley Mở Rộng
Xác suất lây nhiễm $P$ của một cá thể nhạy cảm (khỏe mạnh) khi ở trong phòng kín có người mang mầm bệnh (F0):

$$P = 1 - \exp\left(-\mu\right) = 1 - \exp\left(-\frac{I \cdot p \cdot q \cdot t}{Q} \cdot k_d \cdot k_m \cdot k_h\right)$$

Trong đó:
- $\mu$: Liều lượng hạt mầm bệnh (quanta) hít vào cơ thể.
- $P$: Xác suất bị lây nhiễm cúm ($0 \le P \le 1$).
- $I$: Số lượng người mang mầm bệnh F0 hiện diện trong phòng ($I \ge 1$).
- $p$: Lưu lượng hô hấp trung bình của một người ($m^3/\text{giờ}$):
  - Nghỉ ngơi / ngồi yên: $0.50\ m^3/h$
  - Đứng / đi lại nhẹ: $0.60\ m^3/h$
  - Nói chuyện / thảo luận: $0.75\ m^3/h$
  - Vận động nhẹ: $1.25\ m^3/h$
  - Vận động thể thao mạnh: $1.80\ m^3/h$
- $q$: Tốc độ phát tán hạt mầm bệnh của F0 ($\text{quanta}/\text{giờ}$):
  - Thở nhẹ qua miệng: $5\ \text{quanta}/h$
  - Nói nhỏ / thì thầm: $20\ \text{quanta}/h$
  - Nói chuyện bình thường: $50\ \text{quanta}/h$
  - Nói to / thuyết trình / hát: $100\ \text{quanta}/h$
  - Ho khan / hắt hơi liên tục: $150\ \text{quanta}/h$
- $t$: Tổng thời gian tiếp xúc trong phòng kín ($\text{giờ}$, $t > 0$).
- $Q$: Lưu lượng không khí sạch cấp vào phòng ($m^3/\text{giờ}$). Nếu biết thể tích phòng $V\ (m^3)$ và bội số trao đổi khí $ACH\ (h^{-1})$:
  $$Q = ACH \times V$$

### 1.2. Các Hệ Số Điều Chỉnh Thực Nghiệm ($k_d, k_m, k_h$)
- **Hệ số khoảng cách ($k_d$)**:
  - Tiếp xúc gần ($< 2m$): $k_d = 1.00$
  - Khoảng cách an toàn ($\ge 2m$): $k_d = 0.60$ (dao động $[0.50, 0.80]$)
- **Hệ số khẩu trang lọc 2 chiều ($k_m$)**: $k_m = (1 - e_i)(1 - e_o)$
  - Không đeo khẩu trang: $e_i = 0, e_o = 0 \implies k_m = 1.00$
  - Khẩu trang vải: $e_i \approx 0.30, e_o \approx 0.50 \implies k_m \approx 0.35$
  - Khẩu trang y tế 3 lớp: $e_i \approx 0.50, e_o \approx 0.70 \implies k_m \approx 0.15$
  - Khẩu trang chuẩn KN95: $e_i \approx 0.90, e_o \approx 0.90 \implies k_m \approx 0.01$
  - Khẩu trang chuẩn N95: $e_i \approx 0.95, e_o \approx 0.95 \implies k_m \approx 0.0025$
- **Hệ số phân bổ thông khí ($k_h$ / ASHRAE $E_z$)**:
  - Góc đọng khí / không đối lưu: $k_h = 0.70$
  - Trộn đều tiêu chuẩn (Well-mixed): $k_h = 1.00$
  - Thông gió dịch chuyển (Displacement): $k_h = 1.20$

### 1.3. Các Chỉ Số Đầu Ra
- **Số ca nhiễm dự kiến ($D$)**: $D = S \times P$ (với $S$ là số người khỏe mạnh trong phòng).
- **Hệ số lây nhiễm cơ bản trong phòng kín ($R_t$)**: $R_t = \frac{S \times P}{I}$.
- **Phân loại rủi ro**:
  - 🟢 **LOW**: $P < 5\%$
  - 🟡 **MODERATE**: $5\% \le P < 20\%$
  - 🟠 **HIGH**: $20\% \le P < 50\%$
  - 🔴 **CRITICAL**: $P \ge 50\%$

---

## 🏗️ 2. Kiến Trúc Mã Nguồn (Clean Architecture)

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── health.py        # Health check endpoint
│   │       │   ├── predict.py       # Wells-Riley instant prediction
│   │       │   ├── presets.py       # Epidemiological lookup constants
│   │       │   └── simulate.py      # Time-series & spatial simulations
│   │       └── router.py            # API V1 router aggregation
│   ├── constants/
│   │   └── epidemiology.py          # Enums, standard lookup tables & thresholds
│   ├── core/
│   │   └── config.py                # Pydantic BaseSettings & environment configs
│   ├── schemas/
│   │   ├── presets.py               # Metadata & lookup response DTOs
│   │   ├── risk_assessment.py       # Prediction Request / Response schemas
│   │   └── simulation.py            # Time-series & Spatial grid schemas
│   ├── services/
│   │   ├── recommender.py           # Contextual actionable health advice engine
│   │   ├── simulator.py             # Time-series & spatial calculation engine
│   │   └── wells_riley.py           # Core Wells-Riley math engine
│   └── main.py                      # FastAPI Application instance & CORS configuration
├── tests/
│   ├── conftest.py                  # Pytest fixtures & TestClient
│   ├── test_api_predict.py          # Prediction endpoint integration tests
│   ├── test_api_presets.py          # Presets & Health integration tests
│   ├── test_api_simulate.py         # Time-series & Spatial simulation tests
│   └── test_wells_riley_math.py     # Math unit tests & edge cases
├── .env                             # Environment variables
├── .env.example                     # Environment sample
├── README.md                        # Documentation
├── requirements.txt                 # Dependencies
└── run_server.py                    # Server startup script
```

---

## 🚀 3. Hướng Dẫn Cài Đặt & Chạy Server

### Bước 1: Chuẩn bị môi trường Python (Python 3.10+)
```bash
# Di chuyển vào thư mục backend
cd backend

# Tạo virtual environment (khuyến nghị)
python -m venv venv

# Kích hoạt môi trường (Windows PowerShell)
.\venv\Scripts\Activate.ps1
# Hoặc trên Linux/macOS: source venv/bin/activate
```

### Bước 2: Cài đặt thư viện phụ thuộc
```bash
pip install -r requirements.txt
```

### Bước 3: Khởi động máy chủ API
```bash
# Cách 1: Chạy file script
python run_server.py

# Cách 2: Chạy trực tiếp qua Uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Sau khi chạy, truy cập tài liệu Swagger UI tại:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)** hoặc ReDoc tại **[http://localhost:8000/redoc](http://localhost:8000/redoc)**.

---

## 🧪 4. Chạy Bộ Kiểm Thử (Unit Tests)

Bộ test bao gồm 19 kịch bản kiểm tra toàn diện logic toán, biên $Q=0, t=0$, tính ổn định số học và tích hợp API:
```bash
# Chạy toàn bộ test
pytest tests/ -v
```

---

## 📡 5. Tài Liệu Đặc Tả Chi Tiết API (RESTful Endpoints)

### 📌 Endpoint 1: Dự Báo Nguy Cơ Tức Thời
- **Route**: `POST /api/v1/predict/wells-riley`
- **Headers**: `Content-Type: application/json`

#### Request Body mẫu:
```json
{
  "infected_count": 1,
  "susceptible_count": 30,
  "breathing_rate": 0.5,
  "quanta_generation_rate": 50.0,
  "exposure_time_hours": 3.0,
  "ventilation": {
    "clean_air_delivery_rate": 300.0
  },
  "distance_factor": 1.0,
  "mask_config": {
    "mask_type_f0": "none",
    "mask_type_susceptible": "none"
  },
  "ventilation_distribution_factor": 1.0
}
```

*Ghi chú*: Trường `ventilation` có thể truyền `clean_air_delivery_rate` ($Q$) hoặc cặp `{"room_volume_m3": 150.0, "air_changes_per_hour": 3.0}`.

#### Response mẫu:
```json
{
  "infection_probability": 0.2212,
  "infection_probability_percent": 22.12,
  "risk_level": "HIGH",
  "risk_level_label_vi": "Cao",
  "expected_new_cases": 6.64,
  "effective_reproductive_number": 6.64,
  "parameters_used": {
    "infected_count_I": 1,
    "susceptible_count_S": 30,
    "breathing_rate_p_m3h": 0.5,
    "quanta_rate_q_per_h": 50.0,
    "exposure_time_t_hours": 3.0,
    "clean_air_flow_Q_m3h": 300.0,
    "distance_factor_kd": 1.0,
    "mask_factor_km": 1.0,
    "mask_inward_efficiency_ei": 0.0,
    "mask_outward_efficiency_eo": 0.0,
    "ventilation_distribution_kh": 1.0,
    "inhaled_quanta_dose": 0.25
  },
  "recommendations": [
    "⚠️ NGUY CƠ CAO (22.1%): Dự kiến có nhiều ca F1 chuyển thành F0 trong không gian kín. Cần can thiệp ngay vào hệ thống thông khí và trang bị khẩu trang đạt chuẩn.",
    "😷 KHẨU TRANG: Yêu cầu bắt buộc đeo khẩu trang y tế (giảm ~85% lượng virus phát tán & hít vào) hoặc nâng cấp lên N95/KN95 (giảm >99% mầm bệnh aerosol).",
    "🌀 THÔNG GIÓ: Khuyến khích tăng cường thêm cấp khí tươi ngoài trời để đẩy nhanh tốc độ pha loãng hạt khí dung (aerosol).",
    "⏱️ THỜI GIAN TIẾP XÚC: Thời gian an toàn tối đa khuyến nghị là 36 phút (hiện đang là 3.0 giờ). Cần nghỉ giải lao giữa giờ và thông thoáng phòng 10-15 phút.",
    "📏 KHOẢNG CÁCH: Duy trì khoảng cách tối thiểu 2 mét giữa các chỗ ngồi để giảm nồng độ aerosol phát tán trực tiếp từ người mang mầm bệnh."
  ],
  "mitigation_options": [
    {
      "intervention_name": "Khẩu trang Y tế 2 chiều",
      "description_vi": "Cả F0 và người xung quanh đều đeo khẩu trang y tế 3 lớp đúng quy cách",
      "new_probability_percent": 3.68,
      "risk_reduction_percent": 18.44
    },
    {
      "intervention_name": "Khẩu trang N95 / KN95",
      "description_vi": "Trang bị khẩu trang N95 chuẩn y tế có độ kín khít cao",
      "new_probability_percent": 0.06,
      "risk_reduction_percent": 22.06
    },
    {
      "intervention_name": "Tăng cường thông gió tối đa",
      "description_vi": "Nâng lưu lượng khí sạch lên ~750 m³/h (mở thông cửa, quạt hút hoặc máy lọc HEPA)",
      "new_probability_percent": 9.52,
      "risk_reduction_percent": 12.6
    },
    {
      "intervention_name": "Phòng ngừa toàn diện đa tầng",
      "description_vi": "Kết hợp khẩu trang y tế + Tăng thông gió + Giữ khoảng cách >= 2m",
      "new_probability_percent": 0.9,
      "risk_reduction_percent": 21.22
    }
  ]
}
```

---

### 📌 Endpoint 2: Mô Phỏng Theo Chuỗi Thời Gian (Time-Series)
- **Route**: `POST /api/v1/simulate/time-series`
- **Mục đích**: Trả về mảng dữ liệu nguy cơ $P(t)$ tăng dần qua từng bước thời gian để cấp dữ liệu vẽ biểu đồ Chart.js / Recharts.

#### Request Body mẫu:
```json
{
  "infected_count": 1,
  "susceptible_count": 30,
  "breathing_rate": 0.5,
  "quanta_generation_rate": 50.0,
  "exposure_time_hours": 6.0,
  "start_time_hours": 0.5,
  "max_time_hours": 6.0,
  "time_step_hours": 0.5,
  "ventilation": {
    "clean_air_delivery_rate": 300.0
  },
  "mask_config": {
    "mask_type_f0": "none",
    "mask_type_susceptible": "none"
  }
}
```

#### Response mẫu (Trích đoạn):
```json
{
  "simulation_summary": {
    "initial_time_hours": 0.0,
    "max_time_hours": 6.0,
    "final_infection_probability_percent": 39.35,
    "final_expected_cases": 11.8,
    "final_risk_level": "HIGH",
    "clean_air_flow_Q": 300.0,
    "mask_factor_km": 1.0
  },
  "data_points_count": 13,
  "time_series": [
    {
      "time_hours": 0.0,
      "time_minutes": 0.0,
      "infection_probability": 0.0,
      "infection_probability_percent": 0.0,
      "risk_level": "LOW",
      "risk_level_label_vi": "Thấp",
      "expected_new_cases": 0.0,
      "effective_reproductive_number": 0.0,
      "risk_color": "#10B981"
    },
    {
      "time_hours": 1.0,
      "time_minutes": 60.0,
      "infection_probability": 0.07996,
      "infection_probability_percent": 8.0,
      "risk_level": "MODERATE",
      "risk_level_label_vi": "Trung bình",
      "expected_new_cases": 2.4,
      "effective_reproductive_number": 2.4,
      "risk_color": "#F59E0B"
    }
  ],
  "chart_dataset": {
    "labels": ["0.0h (0m)", "0.5h (30m)", "1.0h (60m)", "..."],
    "time_hours": [0.0, 0.5, 1.0],
    "probabilities": [0.0, 0.0408, 0.0800],
    "probability_percentages": [0.0, 4.08, 8.00],
    "expected_cases": [0.0, 1.22, 2.40],
    "risk_colors": ["#10B981", "#10B981", "#F59E0B"]
  }
}
```

---

### 📌 Endpoint 3: Mô Phỏng Sơ Đồ Lớp Học (Classroom Spatial Grid)
- **Route**: `POST /api/v1/simulate/spatial-classroom`
- **Mục đích**: Tính toán xác suất lây nhiễm cho từng vị trí chỗ ngồi dựa trên ma trận khoảng cách hình học đến các ca F0.

---

### 📌 Endpoint 4: Bảng Tra Cứu Hằng Số Dịch Tễ
- **Route**: `GET /api/v1/constants/presets`
- **Mục đích**: Trả về dữ liệu danh mục khẩu trang, lưu lượng thở, mức phát tán aerosol, và hệ số thông gió cho Front-end dropdowns.

---

## 💻 6. Ví Dụ Gọi API Bằng cURL

```bash
# 1. Kiểm tra trạng thái máy chủ
curl -X GET "http://127.0.0.1:8000/api/v1/health"

# 2. Dự báo rủi ro tức thời
curl -X POST "http://127.0.0.1:8000/api/v1/predict/wells-riley" \
     -H "Content-Type: application/json" \
     -d '{
       "infected_count": 1,
       "susceptible_count": 30,
       "breathing_rate": 0.5,
       "quanta_generation_rate": 50.0,
       "exposure_time_hours": 3.0,
       "ventilation": { "clean_air_delivery_rate": 300.0 },
       "mask_config": { "mask_type_f0": "surgical", "mask_type_susceptible": "surgical" }
     }'
```
