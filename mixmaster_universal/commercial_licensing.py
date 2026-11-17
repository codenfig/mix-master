"""Stripe-hosted per-song licensing. Fail closed until rights are approved."""
import hmac
import os
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import PlainTextResponse
from generated_storage import _connect, _get, _lock

router = APIRouter()
def stripe_client():
    try:
        import stripe
    except ImportError as exc:
        raise HTTPException(503, "Install the stripe Python package.") from exc
    if not os.getenv("STRIPE_SECRET_KEY"):
        raise HTTPException(503, "Stripe checkout is not configured.")
    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    return stripe

def now():
    return datetime.now(timezone.utc).isoformat()

def setup(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS commercial_license_orders (
        id TEXT PRIMARY KEY, file_id TEXT NOT NULL, request_id TEXT NOT NULL,
        stripe_session TEXT UNIQUE, stripe_payment_intent TEXT,
        amount INTEGER NOT NULL, currency TEXT NOT NULL,
        status TEXT NOT NULL, created_at TEXT NOT NULL, paid_at TEXT,
        license_id TEXT UNIQUE, issued_at TEXT)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS stripe_processed_events (
        id TEXT PRIMARY KEY, processed_at TEXT NOT NULL)""")

def require_admin(token):
    secret = os.getenv("LICENSE_ADMIN_TOKEN", "")
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(403, "Administrator authorization required.")

@router.post("/api/commercial-licenses/requests/{request_id}/approve-rights")
def approve_rights(request_id: str, x_license_admin_token: str | None = Header(None)):
    """Approval must be performed only after independently verifying rights."""
    require_admin(x_license_admin_token)
    with _lock, _connect() as conn:
        row = conn.execute("SELECT file_id,status FROM commercial_license_requests WHERE id=?", (request_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Request not found.")
        _get(row["file_id"])
        if row["status"] not in ("pending", "rights_approved"):
            raise HTTPException(409, "Request is not eligible for approval.")
        conn.execute("UPDATE commercial_license_requests SET status='rights_approved' WHERE id=?", (request_id,))
    return {"status": "rights_approved", "request_id": request_id}

@router.post("/api/commercial-licenses/requests/{request_id}/checkout")
def create_checkout(request_id: str):
    price_id = os.getenv("STRIPE_COMMERCIAL_LICENSE_PRICE_ID")
    base = os.getenv("PUBLIC_APP_URL", "").rstrip("/")
    if not price_id or not base or not base.startswith("https://"):
        raise HTTPException(503, "Checkout requires a Stripe Price and HTTPS public app URL.")
    with _lock, _connect() as conn:
        setup(conn)
        request = conn.execute("SELECT * FROM commercial_license_requests WHERE id=?", (request_id,)).fetchone()
        if not request:
            raise HTTPException(404, "License request not found.")
        if request["status"] != "rights_approved":
            raise HTTPException(409, "Commercial rights must be approved before payment.")
        song = _get(request["file_id"])
        if song["category"] not in ("full_song", "text_to_song"):
            raise HTTPException(400, "Invalid song.")
        existing = conn.execute("SELECT stripe_session,status FROM commercial_license_orders WHERE request_id=? ORDER BY created_at DESC LIMIT 1", (request_id,)).fetchone()
        if existing and existing["status"] in ("paid", "licensed"):
            raise HTTPException(409, "Already purchased.")
    stripe = stripe_client()
    try:
        price = stripe.Price.retrieve(price_id)
        if not price.active or price.type != "one_time" or not price.unit_amount or price.unit_amount < 1:
            raise HTTPException(503, "Invalid one-time Stripe Price.")
        order_id = uuid4().hex
        session = stripe.checkout.Session.create(
            mode="payment", line_items=[{"price": price_id, "quantity": 1}],
            customer_email=request["contact_email"], client_reference_id=order_id,
            metadata={"order_id": order_id, "file_id": request["file_id"], "request_id": request_id},
            success_url=base+"/#/full-song?license_checkout=success",
            cancel_url=base+"/#/full-song?license_checkout=cancelled",
            payment_method_types=["card"],
            idempotency_key="license-checkout-"+order_id,
        )
        with _lock, _connect() as conn:
            setup(conn)
            approved = conn.execute("SELECT status FROM commercial_license_requests WHERE id=?", (request_id,)).fetchone()
            if not approved or approved["status"] != "rights_approved":
                raise HTTPException(409, "Rights approval changed.")
            conn.execute("""INSERT INTO commercial_license_orders
                (id,file_id,request_id,stripe_session,amount,currency,status,created_at)
                VALUES (?,?,?,?,?,?,?,?)""", (order_id,request["file_id"],request_id,session.id,price.unit_amount,price.currency,"pending",now()))
        return {"checkout_url":session.url, "order_id":order_id}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "Stripe checkout could not be created.") from exc

@router.post("/api/stripe/commercial-license-webhook")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(None)):
    secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "Webhook secret not configured.")
    stripe = stripe_client()
    try:
        event = stripe.Webhook.construct_event(await request.body(), stripe_signature or "", secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(400, "Invalid Stripe webhook.") from exc
    if event["type"] not in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        return {"received": True}
    session = event["data"]["object"]
    if session.get("payment_status") != "paid":
        return {"received": True}
    with _lock, _connect() as conn:
        setup(conn)
        if conn.execute("SELECT 1 FROM stripe_processed_events WHERE id=?", (event["id"],)).fetchone():
            return {"received": True}
        order = conn.execute("SELECT * FROM commercial_license_orders WHERE stripe_session=?", (session["id"],)).fetchone()
        if not order or session.get("client_reference_id") != order["id"]:
            raise HTTPException(400, "Unknown checkout order.")
        request_row = conn.execute("SELECT * FROM commercial_license_requests WHERE id=?", (order["request_id"],)).fetchone()
        if not request_row or request_row["status"] not in ("rights_approved", "licensed") or request_row["file_id"] != order["file_id"]:
            raise HTTPException(409, "Commercial rights not approved.")
        if session.get("amount_total") != order["amount"] or session.get("currency") != order["currency"]:
            raise HTTPException(409, "Payment amount mismatch.")
        license_id = order["license_id"] or uuid4().hex
        conn.execute("""UPDATE commercial_license_orders SET status='licensed',paid_at=COALESCE(paid_at,?),
            license_id=?,issued_at=COALESCE(issued_at,?),stripe_payment_intent=? WHERE id=?""",
            (now(),license_id,now(),session.get("payment_intent"),order["id"]))
        conn.execute("UPDATE commercial_license_requests SET status='licensed' WHERE id=?", (order["request_id"],))
        conn.execute("UPDATE generated_files SET license_status='licensed' WHERE id=?", (order["file_id"],))
        conn.execute("INSERT INTO stripe_processed_events VALUES (?,?)", (event["id"],now()))
    return {"received": True}

@router.get("/api/commercial-licenses/{license_id}/certificate")
def license_certificate(license_id: str, x_license_admin_token: str | None = Header(None)):
    # No authenticated customer accounts yet: restrict certificates to administrators.
    require_admin(x_license_admin_token)
    with _connect() as conn:
        setup(conn)
        order = conn.execute("SELECT * FROM commercial_license_orders WHERE license_id=? AND status='licensed'", (license_id,)).fetchone()
        if not order:
            raise HTTPException(404, "License not issued.")
        req = conn.execute("SELECT contact_email FROM commercial_license_requests WHERE id=?", (order["request_id"],)).fetchone()
    song = _get(order["file_id"])
    return PlainTextResponse(
        "MIXMASTER AI COMMERCIAL LICENSE RECORD\\n"
        +f"License ID: {license_id}\\nTrack: {song['song_title'] or song['name']}\\n"
        +f"Licensee email: {req['contact_email']}\\nIssued: {order['issued_at']}\\n"
        +"Payment verified by Stripe webhook. Commercial rights approved by operator.\\n"
        +"License scope and contractual terms must be supplied and agreed separately.\\n",
        headers={"Content-Disposition":f'attachment; filename="mixmaster-license-{license_id}.txt"'})
