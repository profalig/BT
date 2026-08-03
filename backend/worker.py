import os
import time
import json
import requests
import threading
import stripe
from http.server import HTTPServer, BaseHTTPRequestHandler
from supabase import create_client, Client

# ==========================================
# 1. CREDENTIALS & CONFIGURATION
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://woxswhiayrkecspebuwb.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

if not SUPABASE_KEY:
    raise ValueError("⚠️ CRITICAL ERROR: SUPABASE_KEY Environment Variable is missing!")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. HTTP SERVER & STRIPE WEBHOOK HANDLER
# ==========================================
class WebhookAndHealthHandler(BaseHTTPRequestHandler):
    
    def _set_cors_headers(self):
        """Enable CORS for frontend requests."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature")

    def do_OPTIONS(self):
        """Handle CORS preflight requests from browser."""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Health check endpoint for Render."""
        self.send_response(200)
        self._set_cors_headers()
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Backtest Engine & Payment Server is Active!")

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # ----------------------------------------------------
        # ROUTE 1: CREATE STRIPE CHECKOUT SESSION
        # ----------------------------------------------------
        if self.path == "/create-checkout-session":
            try:
                data = json.loads(body.decode("utf-8"))
                price_id = data.get("priceId")
                user_id = data.get("userId")
                credits_to_add = data.get("creditsToAdd", 0)
                checkout_mode = data.get("mode", "payment")  # 'payment' or 'subscription'

                origin = self.headers.get("Origin", "https://your-frontend-domain.com")

                # Stripe Managed Payments handles payment_method_types automatically
                session = stripe.checkout.Session.create(
                    line_items=[{
                        "price": price_id,
                        "quantity": 1,
                    }],
                    mode=checkout_mode,
                    success_url=f"{origin}?payment=success",
                    cancel_url=f"{origin}?payment=cancelled",
                    client_reference_id=user_id,
                    metadata={
                        "credits": str(credits_to_add)
                    }
                )

                self.send_response(200)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                response_data = json.dumps({"url": session.url})
                self.wfile.write(response_data.encode("utf-8"))

            except Exception as e:
                print(f"❌ Error creating checkout session: {e}")
                self.send_response(500)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

        # ----------------------------------------------------
        # ROUTE 2: STRIPE WEBHOOK (RECEIVE PAYMENT ALERTS)
        # ----------------------------------------------------
        elif self.path == "/stripe-webhook":
            sig_header = self.headers.get("Stripe-Signature")

            try:
                event = stripe.Webhook.construct_event(
                    body, sig_header, STRIPE_WEBHOOK_SECRET
                )
            except ValueError as e:
                print(f"⚠️ Webhook Payload Error: {e}")
                self.send_response(400)
                self.end_headers()
                return
            except stripe.error.SignatureVerificationError as e:
                print(f"⚠️ Webhook Signature Verification Failed: {e}")
                self.send_response(400)
                self.end_headers()
                return

            # Process completed checkout session
            if event["type"] == "checkout.session.completed":
                session = event["data"]["object"]
                user_id = session.get("client_reference_id")
                credits_purchased = int(session.get("metadata", {}).get("credits", "0"))

                if user_id and credits_purchased > 0:
                    try:
                        # Fetch existing user credits from Supabase
                        res = supabase.table("user_profiles").select("credits").eq("id", user_id).execute()
                        
                        if res.data and len(res.data) > 0:
                            current_credits = res.data[0].get("credits", 0)
                            new_credits = current_credits + credits_purchased
                            supabase.table("user_profiles").update({"credits": new_credits}).eq("id", user_id).execute()
                        else:
                            new_credits = credits_purchased
                            supabase.table("user_profiles").insert({"id": user_id, "credits": new_credits}).execute()

                        print(f"🎉 SUCCESS: Granted {credits_purchased} credits to User {user_id}. Total: {new_credits}")

                    except Exception as e:
                        print(f"❌ Supabase Credit Update Failed: {e}")

            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"received": True}).encode("utf-8"))

        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return

def start_http_server():
    port = int(os.getenv("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), WebhookAndHealthHandler)
    print(f"🌐 Server & Webhook Listener running on port {port}...")
    server.serve_forever()

threading.Thread(target=start_http_server, daemon=True).start()

# ==========================================
# 3. TELEGRAM ALERT DISPATCHER
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
# 4. DISPATCH NOTIFICATIONS FOR PENDING JOBS
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

        new_job_alert = (
            f"📥 <b>NEW BACKTEST REQUEST RECEIVED!</b>\n\n"
            f"🆔 <b>Job ID:</b> <code>#{job_id}</code>\n"
            f"👤 <b>Client Email:</b> <code>{user_email}</code>\n"
            f"⚙️ <b>System Name:</b> <code>{system_name}</code>\n\n"
            f"📜 <b>STRATEGY RULES:</b>\n"
            f"<i>{rules}</i>\n\n"
            f"⏳ <i>Status updated to 'in_review'. Conduct analysis and run local script when ready.</i>"
        )
        send_telegram_alert(new_job_alert)

        supabase.table("submissions").update({"status": "in_review"}).eq("id", job_id).execute()
        print(f"✅ Job #{job_id} marked as 'in_review'. Telegram notification sent.")

# ==========================================
# 5. CONTINUOUS LISTENER LOOP
# ==========================================
if __name__ == "__main__":
    print("🚀 BACKTEST FACTORY ENGINE ACTIVE...")
    print("📡 Monitoring queue for new client submissions...\n")

    while True:
        try:
            notify_new_submissions()
        except Exception as e:
            print(f"⚠️ Listener error: {e}")
        
        time.sleep(10)