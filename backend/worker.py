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
# ON-CHAIN CRYPTO VERIFICATION HELPERS
# ==========================================
USDC_MINT_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
USDC_CONTRACT_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

# ⚠️ REPLACE THESE WITH YOUR EXACT RECEIVING WALLETS
MY_SOLANA_WALLET = "2C3P2uoRTUq9WVggAHhUBwA5EJ7Em8WEQJgQA5hsaWo7"  # Put full Solana wallet here
MY_ETH_WALLET = "0x13581166EE5CDD412358209539d94F2b79D94341"     # Put full Ethereum wallet here

def verify_solana_usdc_tx(tx_hash, required_usdc_amount):
    """Verify Solana USDC transaction directly on Mainnet RPC"""
    url = "https://api.mainnet-beta.solana.com"
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getParsedTransaction",
        "params": [tx_hash, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}]
    }
    try:
        response = requests.post(url, json=payload, timeout=10).json()
        result = response.get("result")
        if not result or result.get("meta", {}).get("err") is not None:
            return False, "Transaction not found or failed on Solana blockchain."

        post_balances = result["meta"].get("postTokenBalances", [])
        pre_balances = result["meta"].get("preTokenBalances", [])

        received_amount = 0.0
        for post in post_balances:
            if post.get("mint") == USDC_MINT_SOLANA and post.get("owner") == MY_SOLANA_WALLET:
                account_index = post.get("accountIndex")
                post_amt = float(post["uiTokenAmount"]["uiAmount"] or 0)
                
                pre_amt = 0.0
                for pre in pre_balances:
                    if pre.get("accountIndex") == account_index:
                        pre_amt = float(pre["uiTokenAmount"]["uiAmount"] or 0)
                        break
                
                received_amount += (post_amt - pre_amt)

        if received_amount >= required_usdc_amount:
            return True, f"Verified transfer of {received_amount} USDC."
        else:
            return False, f"Insufficient USDC received. Got {received_amount}, expected {required_usdc_amount}."

    except Exception as e:
        return False, f"Solana RPC Error: {str(e)}"


def verify_ethereum_usdc_tx(tx_hash, required_usdc_amount):
    """Verify Ethereum ERC-20 USDC transaction via public RPC"""
    url = "https://eth.llamarpc.com"
    payload = {
        "jsonrpc": "2.0",
        "method": "eth_getTransactionReceipt",
        "params": [tx_hash],
        "id": 1
    }
    try:
        res = requests.post(url, json=payload, timeout=10).json()
        receipt = res.get("result")
        
        if not receipt or receipt.get("status") != "0x1":
            return False, "Transaction not found or failed on Ethereum."

        transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        target_address_padded = "0x" + MY_ETH_WALLET.lower().replace("0x", "").zfill(64)

        for log in receipt.get("logs", []):
            if log.get("address", "").lower() == USDC_CONTRACT_ETH:
                topics = log.get("topics", [])
                if len(topics) >= 3 and topics[0] == transfer_topic and topics[2].lower() == target_address_padded:
                    raw_val = int(log.get("data", "0x0"), 16)
                    usdc_received = raw_val / 10**6
                    
                    if usdc_received >= required_usdc_amount:
                        return True, f"Verified transfer of {usdc_received} USDC."

        return False, "No matching USDC transfer to your wallet address found in transaction logs."

    except Exception as e:
        return False, f"Ethereum RPC Error: {str(e)}"

# ==========================================
# DISCOUNT CODE HELPER
# ==========================================
def get_discounted_price(discount_code, base_price):
    """
    Validates the code securely via Supabase and calculates the new price.
    Returns: (final_price, applied_code_string)
    Raises ValueError if code is invalid or already used.
    """
    if not discount_code or not str(discount_code).strip():
        return float(base_price), None

    clean_code = str(discount_code).strip().upper()
    
    # 1. Fetch code from Supabase
    res = supabase.table("discount_codes").select("*").eq("code", clean_code).execute()
    
    if not res.data or len(res.data) == 0:
        raise ValueError("Invalid discount code.")
        
    code_data = res.data[0]
    
    # 2. Check if already used to prevent double-spending
    if code_data.get("is_used"):
        raise ValueError("This discount code has already been claimed.")

    # 3. Calculate new price safely
    d_type = code_data.get("discount_type")
    d_value = float(code_data.get("discount_value", 0))
    base_price_float = float(base_price)
    
    if d_type == "percentage":
        new_price = base_price_float * (1 - (d_value / 100.0))
    elif d_type == "fixed":
        new_price = max(0.0, base_price_float - d_value)
    else:
        new_price = base_price_float

    return round(new_price, 2), clean_code

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
                price_id = data.get("priceId") # Keep as fallback
                user_id = data.get("userId")
                credits_to_add = data.get("creditsToAdd", 0)
                checkout_mode = data.get("mode", "payment")
                
                # New fields to handle discounts from frontend
                base_price_usd = data.get("basePriceUsd")
                plan_name = data.get("planName", "Quant Plan")
                discount_code = data.get("discountCode", "").strip()

                origin = self.headers.get("Origin", "https://your-frontend-domain.com")

                # 1. Apply Discount Math if a code is provided
                applied_code = None
                if discount_code and base_price_usd is not None:
                    try:
                        final_price_usd, applied_code = get_discounted_price(discount_code, base_price_usd)
                    except ValueError as ve:
                        self.send_response(400)
                        self._set_cors_headers()
                        self.end_headers()
                        self.wfile.write(json.dumps({"error": str(ve)}).encode("utf-8"))
                        return

                # 2. Build Line Items (Dynamic price vs Hardcoded Stripe ID)
                if applied_code and base_price_usd is not None:
                    final_price_cents = int(final_price_usd * 100)
                    line_items = [{
                        "price_data": {
                            "currency": "usd",
                            "product_data": {
                                "name": plan_name,
                                "description": f"Promo Code Applied: {applied_code}"
                            },
                            "unit_amount": final_price_cents,
                        },
                        "quantity": 1,
                    }]
                else:
                    # Fallback to standard price ID if no discount is used
                    line_items = [{
                        "price": price_id,
                        "quantity": 1,
                    }]

                # 3. Create Session with Metadata
                session = stripe.checkout.Session.create(
                    line_items=line_items,
                    mode=checkout_mode,
                    success_url=f"{origin}?payment=success",
                    cancel_url=f"{origin}?payment=cancelled",
                    client_reference_id=user_id,
                    metadata={
                        "credits": str(credits_to_add),
                        "used_discount_code": applied_code or ""
                    }
                )

                self.send_response(200)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"url": session.url}).encode("utf-8"))

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
                session_obj = event["data"]["object"]
                
                # Foolproof extraction handling both Dictionaries and StripeObjects
                user_id = session_obj.get("client_reference_id") if hasattr(session_obj, "get") else getattr(session_obj, "client_reference_id", None)
                metadata = session_obj.get("metadata", {}) if hasattr(session_obj, "get") else getattr(session_obj, "metadata", {})
                
                # Extract the customer's email from Stripe checkout details
                customer_details = session_obj.get("customer_details", {}) if hasattr(session_obj, "get") else getattr(session_obj, "customer_details", {})
                customer_email = customer_details.get("email") if hasattr(customer_details, "get") else getattr(customer_details, "email", None)
                
                credits_str = metadata.get("credits", "0") if hasattr(metadata, "get") else getattr(metadata, "credits", "0")
                
                try:
                    credits_purchased = int(credits_str)
                except ValueError:
                    credits_purchased = 0

                # DIAGNOSTIC LOGGING
                print(f"🔍 WEBHOOK DIAGNOSTIC - User ID: {user_id} | Credits to add: {credits_purchased} | Email: {customer_email}")

                if user_id and credits_purchased > 0:
                    try:
                        # Fetch existing user credits from Supabase
                        res = supabase.table("user_profiles").select("credits").eq("id", user_id).execute()
                        
                        if res.data and len(res.data) > 0:
                            current_credits = res.data[0].get("credits", 0)
                            new_credits = current_credits + credits_purchased
                            
                            # Prepare update payload
                            update_payload = {"credits": new_credits}
                            if customer_email:
                                update_payload["email"] = customer_email
                                
                            supabase.table("user_profiles").update(update_payload).eq("id", user_id).execute()
                        else:
                            new_credits = credits_purchased
                            
                            # Prepare insert payload
                            insert_payload = {"id": user_id, "credits": new_credits}
                            if customer_email:
                                insert_payload["email"] = customer_email
                                
                            supabase.table("user_profiles").insert(insert_payload).execute()

                        print(f"🎉 SUCCESS: Granted {credits_purchased} credits to User {user_id}. Total: {new_credits}")

                        # --- NEW: Burn the discount code if one was used ---
                        used_code = metadata.get("used_discount_code") if hasattr(metadata, "get") else getattr(metadata, "used_discount_code", None)
                        if used_code:
                            try:
                                supabase.table("discount_codes").update({"is_used": True}).eq("code", used_code).execute()
                                print(f"🔥 Burned discount code: {used_code}")
                            except Exception as e:
                                print(f"❌ Failed to burn discount code {used_code}: {e}")

                    except Exception as e:
                        print(f"❌ Supabase Credit Update Failed: {e}")
                else:
                    print("⚠️ SKIPPED DATABASE UPDATE: Either User ID is missing or Credits equals 0.")

            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"received": True}).encode("utf-8"))
            
        # ----------------------------------------------------
        # ROUTE 3: AUTOMATED ON-CHAIN USDC VERIFICATION
        # ----------------------------------------------------
        elif self.path == "/verify-crypto-payment":
            try:
                data = json.loads(body.decode("utf-8"))
                user_id = data.get("userId")
                tx_hash = data.get("txHash", "").strip()
                network = data.get("network", "solana").lower()
                credits_to_add = int(data.get("creditsToAdd", 0))
                base_price_usdc = float(data.get("priceUsdc", 0.0))
                plan_name = data.get("planName", "USDC Plan")
                discount_code = data.get("discountCode", "").strip()

                if not user_id or not tx_hash:
                    self.send_response(400)
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Missing user ID or Tx Hash."}).encode("utf-8"))
                    return

                # 1. Calculate Expected Discounted Price
                try:
                    expected_usdc, applied_code = get_discounted_price(discount_code, base_price_usdc)
                except ValueError as ve:
                    self.send_response(400)
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(ve)}).encode("utf-8"))
                    return

                # 2. Anti-Replay Check: Ensure hash hasn't been used before
                tx_check = supabase.table("processed_crypto_txs").select("tx_hash").eq("tx_hash", tx_hash).execute()
                if tx_check.data and len(tx_check.data) > 0:
                    self.send_response(400)
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "This transaction hash has already been redeemed!"}).encode("utf-8"))
                    return

                # 3. Automated On-Chain Verification (using the discounted expected_usdc)
                if network == "solana":
                    is_valid, reason = verify_solana_usdc_tx(tx_hash, expected_usdc)
                elif network == "ethereum":
                    is_valid, reason = verify_ethereum_usdc_tx(tx_hash, expected_usdc)
                else:
                    is_valid, reason = False, "Unsupported blockchain network."

                if not is_valid:
                    self.send_response(400)
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Verification failed: {reason}"}).encode("utf-8"))
                    return

                # 4. Mark Hash as Used
                supabase.table("processed_crypto_txs").insert({
                    "tx_hash": tx_hash,
                    "user_id": user_id,
                    "network": network,
                    "credits_added": credits_to_add
                }).execute()

                # 5. Grant Credits to User Profile
                res = supabase.table("user_profiles").select("credits").eq("id", user_id).execute()
                if res.data and len(res.data) > 0:
                    current_credits = res.data[0].get("credits", 0)
                    new_credits = current_credits + credits_to_add
                    supabase.table("user_profiles").update({"credits": new_credits}).eq("id", user_id).execute()
                else:
                    new_credits = credits_to_add
                    supabase.table("user_profiles").insert({"id": user_id, "credits": new_credits}).execute()

                # 6. Burn the discount code now that crypto payment is verified
                if applied_code:
                    try:
                        supabase.table("discount_codes").update({"is_used": True}).eq("code", applied_code).execute()
                        print(f"🔥 Burned crypto discount code: {applied_code}")
                    except Exception as e:
                        print(f"❌ Failed to burn discount code {applied_code}: {e}")

                # 7. Telegram Notification
                explorer_url = f"https://solscan.io/tx/{tx_hash}" if network == "solana" else f"https://etherscan.io/tx/{tx_hash}"
                send_telegram_alert(
                    f"⚡ <b>AUTOMATED USDC PAYMENT VERIFIED!</b>\n\n"
                    f"👤 <b>User ID:</b> <code>{user_id}</code>\n"
                    f"📦 <b>Plan:</b> {plan_name}\n"
                    f"💳 <b>Credits Added:</b> +{credits_to_add} (Total: {new_credits})\n"
                    f"🌐 <b>Network:</b> {network.upper()}\n"
                    f"🔗 <b>Tx:</b> <a href='{explorer_url}'>View on Explorer</a>"
                )

                # 8. Success Response
                self.send_response(200)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": True, 
                    "credits": new_credits,
                    "message": "Payment verified on-chain! Credits added."
                }).encode("utf-8"))

            except Exception as e:
                print(f"❌ Crypto Endpoint Exception: {e}")
                self.send_response(500)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

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
        user_id = job.get("user_id")

        print(f"\n--- New Request Received: Job #{job_id} [{system_name}] ---")

        # SECURELY DEDUCT 1 CREDIT ON BACKEND
        if user_id:
            try:
                u_res = supabase.table("user_profiles").select("credits").eq("id", user_id).execute()
                if u_res.data and len(u_res.data) > 0:
                    current_credits = u_res.data[0].get("credits", 0)
                    new_credits = max(0, current_credits - 1)
                    supabase.table("user_profiles").update({"credits": new_credits}).eq("id", user_id).execute()
                    print(f"💳 Credit Deducted: User {user_id} now has {new_credits} credit(s).")
            except Exception as e:
                print(f"⚠️ Failed to deduct credit for User {user_id}: {e}")

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