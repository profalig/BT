import os
import time
import requests
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from supabase import create_client, Client

# ==========================================
# 0. FREE-TIER HEALTH CHECK SERVER (RENDER)
# ==========================================
class HealthCheckHandler(BaseHTTPRequestHandler):
    """Dummy server to satisfy Render Web Service health checks for free hosting."""
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Backtest Alert Engine is active!")

    def log_message(self, format, *args):
        return

def start_health_check_server():
    port = int(os.getenv("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    server.serve_forever()

threading.Thread(target=start_health_check_server, daemon=True).start()

# ==========================================
# 1. CREDENTIALS & CONFIGURATION
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://woxswhiayrkecspebuwb.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

if not SUPABASE_KEY:
    raise ValueError("⚠️ CRITICAL ERROR: SUPABASE_KEY Environment Variable is missing!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. TELEGRAM ALERT DISPATCHER
# ==========================================
def send_telegram_alert(message):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("⚠️ Telegram credentials missing. Alert skipped.")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": False
    }
    
    try:
        res = requests.post(url, json=payload, timeout=5)
        if not res.ok:
            print(f"⚠️ Telegram API Error ({res.status_code}): {res.text}")
    except Exception as e:
        print(f"⚠️ Failed to deliver Telegram notification: {e}")

# ==========================================
# 3. DISPATCH NOTIFICATIONS FOR PENDING JOBS
# ==========================================
def notify_new_submissions():
    res = supabase.table("submissions").select("*").eq("status", "pending").execute()
    jobs = res.data

    if not jobs:
        return

    print(f"🎯 Found {len(jobs)} pending job(s)!")

    for job in jobs:
        job_id = job["id"]
        system_name = job.get("system_name", "Untitled System")
        rules = job.get("rules", "No rules specified.")
        user_email = job.get("email", "unknown@agent.com")

        print(f"\n--- New Request Received: Job #{job_id} [{system_name}] ---")

        # Telegram Alert with full strategy rules
        new_job_alert = (
            f"📥 <b>NEW BACKTEST REQUEST RECEIVED!</b>\n\n"
            f"🆔 <b>Job ID:</b> <code>#{job_id}</code>\n"
            f"👤 <b>Client Email:</b> <code>{user_email}</code>\n"
            f"⚙️ <b>System Name:</b> <code>{system_name}</code>\n\n"
            f"📜 <b>STRATEGY RULES:</b>\n"
            f"<i>{rules}</i>\n\n"
            f"⏳ <i>Status updated to 'in_review'. Conduct your analysis and run local script when ready.</i>"
        )
        send_telegram_alert(new_job_alert)

        # Mark status as 'in_review' so it won't repeat alerts every 10 seconds
        supabase.table("submissions").update({"status": "in_review"}).eq("id", job_id).execute()
        print(f"✅ Job #{job_id} marked as 'in_review'. Telegram notification sent.")

# ==========================================
# 4. CONTINUOUS LISTENER LOOP
# ==========================================
if __name__ == "__main__":
    print("🚀 BACKTEST FACTORY NOTIFICATION ENGINE ACTIVE...")
    print("📡 Monitoring queue for new client submissions...\n")

    while True:
        try:
            notify_new_submissions()
        except Exception as e:
            print(f"⚠️ Listener error: {e}")
        
        time.sleep(10)