#!/usr/bin/env bash

# ==============================================================================
# Unix Launcher for Wells-Riley Influenza Modeling Application
# ==============================================================================

set -e

# Detect script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "======================================================================"
echo "  KHỞI ĐỘNG HỆ THỐNG DỰ BÁO NGUY CƠ CÚM (WELLS-RILEY LOCALHOST)"
echo "======================================================================"
echo ""

# Check python
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "❌ [ERROR] Không tìm thấy Python. Vui lòng cài đặt Python 3.10+!"
        exit 1
    else
        PY=python
    fi
else
    PY=python3
fi

echo "📦 [1/2] Kiểm tra & cài đặt thư viện phụ thuộc..."
$PY -m pip install -r backend/requirements.txt --quiet

echo "🚀 [2/2] Khởi động đồng thời Backend (:8000) và Frontend (:5500)..."
$PY start_all.py
