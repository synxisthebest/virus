"""Cross-platform One-Command Runner for Wells-Riley Influenza Modeling Application.

Starts both:
1. Backend API Server (FastAPI / Uvicorn) on http://0.0.0.0:8000
2. Frontend Static Server on http://0.0.0.0:5500
And automatically opens your default browser!
"""

import sys
import os
import time
import socket
import webbrowser
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"

BACKEND_PORT = 8000
FRONTEND_PORT = 5500


def get_local_ip() -> str:
    """Detects local LAN IP address for Wi-Fi testing."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def run_backend():
    """Runs FastAPI Backend with Uvicorn."""
    print("🚀 [Backend] Starting FastAPI Server on port 8000...")
    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR)

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(BACKEND_PORT),
        "--reload",
    ]
    subprocess.run(cmd, cwd=str(BACKEND_DIR), env=env)


class CustomFrontendHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler serving root directory with CORS enabled."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress noisy static file logging in console
        pass


def run_frontend():
    """Runs lightweight HTTP server for Frontend static files."""
    server_address = ("0.0.0.0", FRONTEND_PORT)
    httpd = HTTPServer(server_address, CustomFrontendHandler)
    print(f"🌐 [Frontend] Serving static files on http://localhost:{FRONTEND_PORT}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


def main():
    local_ip = get_local_ip()

    print("=" * 75)
    print("🦠 WELLS–RILEY INFLUENZA MODELING SYSTEM - LOCAL DEV ENVIRONMENT")
    print("=" * 75)
    print(f"📍 Frontend Localhost : http://localhost:{FRONTEND_PORT}")
    print(f"📍 Frontend Mạng Wi-Fi: http://{local_ip}:{FRONTEND_PORT} (Mở trên điện thoại)")
    print(f"⚙️ Backend API Docs    : http://localhost:{BACKEND_PORT}/docs")
    print(f"🩺 Backend Health Check: http://localhost:{BACKEND_PORT}/api/v1/health")
    print("=" * 75)
    print("💡 Nhấn Ctrl + C bất kỳ lúc nào để dừng toàn bộ hệ thống.\n")

    # Start Frontend thread
    t_front = threading.Thread(target=run_frontend, daemon=True)
    t_front.start()

    # Open browser automatically after 1.5 seconds
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f"http://localhost:{FRONTEND_PORT}")

    threading.Thread(target=open_browser, daemon=True).start()

    # Run Backend in main thread (supports Ctrl+C interrupt)
    try:
        run_backend()
    except KeyboardInterrupt:
        print("\n🛑 Đã tắt toàn bộ hệ thống Backend & Frontend. Hẹn gặp lại!")


if __name__ == "__main__":
    main()
