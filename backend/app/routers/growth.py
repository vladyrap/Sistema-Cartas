"""Growth endpoints: créditos, membresía, némesis, botín físico, trades,
salud de comunidad, deck OCR, calendario ICS."""
import base64
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.deps import AdminDep, DbDep, OptionalUserDep, UserDep
from app.models import (
    Event, EventRegistration, EventStatus, Game, Membership, PhysicalReward,
    PhysicalRewardClaim, PlayerProfile, PlayerRating, Season, SeasonNemesis,
    StoreCredit, TournamentAchievement, TradeRecord,
)
from app.services import audit
from app.services import growth as growth_svc

router = APIRouter()


# ═══════════════════════════ CREDITS ═══════════════════════════


@router.get("/credits/me")
def my_credits(current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    pid = current.profile.id
    rows = list(db.scalars(select(StoreCredit).where(StoreCredit.player_id == pid)
                           .order_by(desc(StoreCredit.created_at)).limit(50)))
    return {
        "balance_clp": growth_svc.credit_balance(db, pid),
        "ledger": [{
            "amount_clp": r.amount_clp, "reason": r.reason, "kind": r.kind,
            "at": r.created_at.isoformat(),
        } for r in rows],
    }


class GrantCreditIn(BaseModel):
    player_id: int
    amount_clp: int = Field(ge=-500000, le=500000)
    reason: str = Field(min_length=3, max_length=200)


@router.post("/credits/grant")
def admin_grant_credit(payload: GrantCreditIn, admin: AdminDep, db: DbDep) -> dict:
    """Admin otorga (positivo) o canjea/descuenta (negativo) crédito."""
    if payload.amount_clp == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "amount no puede ser 0")
    if payload.amount_clp < 0:
        bal = growth_svc.credit_balance(db, payload.player_id)
        if bal + payload.amount_clp < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Balance insuficiente ({bal})")
    kind = "redeem" if payload.amount_clp < 0 else "admin_adjust"
    growth_svc.grant_credit(
        db, player_id=payload.player_id, amount_clp=payload.amount_clp,
        reason=payload.reason, kind=kind, by_user_id=admin.id,
    )
    audit.log(db, admin_id=admin.id, action="credit.grant",
              target_kind="player", target_id=payload.player_id,
              payload={"amount": payload.amount_clp, "reason": payload.reason})
    db.commit()
    return {"ok": True, "new_balance": growth_svc.credit_balance(db, payload.player_id)}


class DistributePrizesIn(BaseModel):
    percent_pool: int = Field(ge=1, le=100)
    splits: list[int] = Field(min_length=1, max_length=8)


@router.post("/events/{event_id}/distribute-prizes")
def distribute_prizes(event_id: int, payload: DistributePrizesIn,
                      admin: AdminDep, db: DbDep) -> dict:
    """Reparte % de lo recaudado como crédito de tienda al top N (por splits)."""
    try:
        out = growth_svc.distribute_event_prizes(
            db, event_id=event_id, percent_pool=payload.percent_pool,
            splits=payload.splits, by_user_id=admin.id,
        )
        audit.log(db, admin_id=admin.id, action="event.distribute_prizes",
                  target_kind="event", target_id=event_id,
                  payload={"percent": payload.percent_pool, "splits": payload.splits})
        db.commit()
        return out
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ═══════════════════════════ MEMBERSHIP ═══════════════════════════


@router.get("/membership/me")
def my_membership(current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    m = db.scalar(select(Membership).where(Membership.player_id == current.profile.id))
    active = growth_svc.is_member(db, current.profile.id)
    return {
        "is_member": active,
        "paid_until": m.paid_until.isoformat() if m else None,
        "total_payments": m.total_payments if m else 0,
        "price_clp": settings.membership_price_clp,
        "benefits": {
            "event_discount_pct": settings.membership_event_discount_pct,
            "waitlist_priority": True,
            "unlimited_freeze": True,
            "badge": True,
        },
        "credit_balance_clp": growth_svc.credit_balance(db, current.profile.id),
    }


@router.post("/membership/checkout")
def membership_checkout(request: Request, current: UserDep, db: DbDep) -> dict:
    """Crea preference MP por 30 días de membresía. external_reference=sub:{player_id}."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    from app.models import Guild
    guild = db.scalar(select(Guild).where(
        Guild.mp_access_token.is_not(None), Guild.mp_access_token != "",
    ))
    from app.services import mercadopago as mp_svc
    front = settings.frontend_url.rstrip("/")
    pref = mp_svc.create_preference(
        access_token=(guild.mp_access_token if guild else "") or "",
        items=[{
            "title": "Membresía Elite — 30 días",
            "quantity": 1,
            "unit_price": settings.membership_price_clp,
            "currency_id": "CLP",
        }],
        external_reference=f"sub:{current.profile.id}",
        back_urls={
            "success": f"{front}/membership?payment=success",
            "failure": f"{front}/membership?payment=failure",
            "pending": f"{front}/membership?payment=pending",
        },
        notification_url=f"{str(request.base_url).rstrip('/')}/api/payments/mercadopago/webhook",
    )
    return {
        "init_point": pref.get("init_point") or pref.get("sandbox_init_point") or "",
        "mock": pref.get("mock", False),
        "price_clp": settings.membership_price_clp,
    }


@router.post("/membership/admin/grant")
def admin_grant_membership(admin: AdminDep, db: DbDep,
                           player_id: int = Query(...), days: int = Query(default=30, ge=1, le=365)) -> dict:
    m = growth_svc.extend_membership(db, player_id=player_id, days=days, source="manual")
    audit.log(db, admin_id=admin.id, action="membership.grant",
              target_kind="player", target_id=player_id, payload={"days": days})
    db.commit()
    return {"ok": True, "paid_until": m.paid_until.isoformat()}


# ═══════════════════════════ NÉMESIS ═══════════════════════════


@router.get("/nemesis/me")
def my_nemesis(current: UserDep, db: DbDep) -> dict | None:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    n = growth_svc.nemesis_of(db, player_id=current.profile.id)
    if not n:
        return None
    rival = db.get(PlayerProfile, n.nemesis_player_id)
    return {
        "nemesis_player_id": n.nemesis_player_id,
        "nemesis_alias": rival.alias if rival else f"#{n.nemesis_player_id}",
        "my_wins": n.my_wins, "their_wins": n.their_wins, "draws": n.draws,
        "season_id": n.season_id,
    }


@router.post("/nemesis/admin/assign")
def admin_assign_nemeses(admin: AdminDep, db: DbDep) -> dict:
    """Asigna némesis para la temporada activa (jugadores activos sin némesis)."""
    season = db.scalar(select(Season).where(Season.status == "ACTIVE"))
    if not season:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin temporada activa")
    pairs = growth_svc.assign_nemeses_for_season(db, season_id=season.id)
    db.commit()
    return {"ok": True, "pairs_created": pairs}


# ═══════════════════════════ BOTÍN FÍSICO ═══════════════════════════


class RewardIn(BaseModel):
    achievement_key: str = Field(min_length=2, max_length=60)
    label: str = Field(min_length=2, max_length=160)
    description: str | None = None
    is_active: bool = True


@router.get("/loot/catalog")
def loot_catalog(db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(PhysicalReward).order_by(PhysicalReward.achievement_key)))
    return [{
        "id": r.id, "achievement_key": r.achievement_key, "label": r.label,
        "description": r.description, "is_active": r.is_active,
    } for r in rows]


@router.post("/loot/catalog", status_code=201)
def upsert_reward(payload: RewardIn, admin: AdminDep, db: DbDep) -> dict:
    existing = db.scalar(select(PhysicalReward).where(
        PhysicalReward.achievement_key == payload.achievement_key
    ))
    if existing:
        existing.label = payload.label
        existing.description = payload.description
        existing.is_active = payload.is_active
    else:
        existing = PhysicalReward(**payload.model_dump())
        db.add(existing)
    db.commit()
    return {"ok": True, "id": existing.id}


@router.delete("/loot/catalog/{reward_id}", status_code=204)
def delete_reward(reward_id: int, admin: AdminDep, db: DbDep):
    r = db.get(PhysicalReward, reward_id)
    if r:
        db.delete(r)
        db.commit()


@router.get("/loot/me")
def my_loot(current: UserDep, db: DbDep) -> dict:
    """Botín canjeable (achievements ganados con reward activo) + mis claims."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    pid = current.profile.id
    my_achs = set(db.scalars(select(TournamentAchievement.achievement_key).where(
        TournamentAchievement.player_id == pid
    ).distinct()))
    rewards = list(db.scalars(select(PhysicalReward).where(PhysicalReward.is_active.is_(True))))
    claims = {c.achievement_key: c for c in db.scalars(
        select(PhysicalRewardClaim).where(PhysicalRewardClaim.player_id == pid)
    )}
    claimable, claimed = [], []
    for r in rewards:
        if r.achievement_key not in my_achs:
            continue
        item = {"reward_id": r.id, "achievement_key": r.achievement_key,
                "label": r.label, "description": r.description}
        c = claims.get(r.achievement_key)
        if c:
            claimed.append({**item, "status": c.status,
                            "delivered_at": c.delivered_at.isoformat() if c.delivered_at else None})
        else:
            claimable.append(item)
    return {"claimable": claimable, "claimed": claimed}


@router.post("/loot/claim", status_code=201)
def claim_loot(current: UserDep, db: DbDep, achievement_key: str = Query(...)) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    pid = current.profile.id
    has = db.scalar(select(TournamentAchievement).where(
        TournamentAchievement.player_id == pid,
        TournamentAchievement.achievement_key == achievement_key,
    ))
    if not has:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No tenés ese achievement")
    reward = db.scalar(select(PhysicalReward).where(
        PhysicalReward.achievement_key == achievement_key,
        PhysicalReward.is_active.is_(True),
    ))
    if not reward:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sin botín activo para ese achievement")
    claim = PhysicalRewardClaim(player_id=pid, achievement_key=achievement_key, reward_id=reward.id)
    db.add(claim)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya canjeaste este botín")
    return {"ok": True, "claim_id": claim.id, "label": reward.label,
            "message": "Pasá por la tienda a retirar tu botín 🎁"}


@router.get("/loot/queue")
def loot_queue(admin: AdminDep, db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(PhysicalRewardClaim).where(
        PhysicalRewardClaim.status == "PENDING"
    ).order_by(PhysicalRewardClaim.created_at)))
    out = []
    for c in rows:
        p = db.get(PlayerProfile, c.player_id)
        r = db.get(PhysicalReward, c.reward_id)
        out.append({
            "claim_id": c.id, "alias": p.alias if p else f"#{c.player_id}",
            "label": r.label if r else c.achievement_key,
            "achievement_key": c.achievement_key,
            "since": c.created_at.isoformat(),
        })
    return out


@router.post("/loot/claims/{claim_id}/deliver")
def deliver_loot(claim_id: int, admin: AdminDep, db: DbDep) -> dict:
    c = db.get(PhysicalRewardClaim, claim_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim no existe")
    c.status = "DELIVERED"
    c.delivered_at = datetime.now(timezone.utc)
    c.delivered_by_user_id = admin.id
    db.commit()
    return {"ok": True}


# ═══════════════════════════ TRADE LOG ═══════════════════════════


class TradeIn(BaseModel):
    partner_player_id: int
    items_mine: str = Field(min_length=2, max_length=2000)
    items_theirs: str = Field(min_length=2, max_length=2000)
    value_mine_clp: int = Field(ge=0, default=0)
    value_theirs_clp: int = Field(ge=0, default=0)
    event_id: int | None = None


def _trade_out(db, t: TradeRecord) -> dict:
    pa = db.get(PlayerProfile, t.player_a_id)
    pb = db.get(PlayerProfile, t.player_b_id)
    hi = max(t.value_a_clp, t.value_b_clp)
    fairness = round(min(t.value_a_clp, t.value_b_clp) / hi, 2) if hi > 0 else None
    return {
        "id": t.id, "status": t.status,
        "player_a_id": t.player_a_id, "player_a_alias": pa.alias if pa else "?",
        "player_b_id": t.player_b_id, "player_b_alias": pb.alias if pb else "?",
        "items_a": t.items_a, "items_b": t.items_b,
        "value_a_clp": t.value_a_clp, "value_b_clp": t.value_b_clp,
        "fairness": fairness,  # 1.0 = perfecto, <0.7 = desbalanceado
        "created_at": t.created_at.isoformat(),
        "confirmed_at": t.confirmed_at.isoformat() if t.confirmed_at else None,
    }


@router.post("/trades", status_code=201)
def propose_trade(payload: TradeIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    if payload.partner_player_id == current.profile.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No podés tradear con vos mismo")
    if not db.get(PlayerProfile, payload.partner_player_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partner no existe")
    t = TradeRecord(
        player_a_id=current.profile.id, player_b_id=payload.partner_player_id,
        items_a=payload.items_mine, items_b=payload.items_theirs,
        value_a_clp=payload.value_mine_clp, value_b_clp=payload.value_theirs_clp,
        event_id=payload.event_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    try:
        from app.services import notifications as notif_svc
        notif_svc.notify(
            db, player_id=payload.partner_player_id, type="trade_proposed",
            title="🔄 Te proponen registrar un trade",
            body=f"{current.profile.alias} quiere dejar registro de un intercambio. Confirmalo si es correcto.",
            link="/trade-log",
        )
        db.commit()
    except Exception:
        pass
    return _trade_out(db, t)


@router.get("/trades/me")
def my_trades(current: UserDep, db: DbDep) -> list[dict]:
    if not current.profile:
        return []
    pid = current.profile.id
    rows = list(db.scalars(select(TradeRecord).where(
        or_(TradeRecord.player_a_id == pid, TradeRecord.player_b_id == pid)
    ).order_by(desc(TradeRecord.created_at)).limit(50)))
    return [_trade_out(db, t) for t in rows]


@router.post("/trades/{trade_id}/confirm")
def confirm_trade(trade_id: int, current: UserDep, db: DbDep) -> dict:
    t = db.get(TradeRecord, trade_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trade no existe")
    if not current.profile or current.profile.id != t.player_b_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el partner puede confirmar")
    if t.status != "PROPOSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {t.status}")
    t.status = "CONFIRMED"
    t.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return _trade_out(db, t)


@router.post("/trades/{trade_id}/reject")
def reject_trade(trade_id: int, current: UserDep, db: DbDep) -> dict:
    t = db.get(TradeRecord, trade_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trade no existe")
    if not current.profile or current.profile.id not in (t.player_a_id, t.player_b_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte")
    if t.status != "PROPOSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {t.status}")
    t.status = "REJECTED" if current.profile.id == t.player_b_id else "CANCELLED"
    db.commit()
    return _trade_out(db, t)


# ═══════════════════════════ SALUD DE COMUNIDAD ═══════════════════════════


@router.get("/admin/community-health")
def community_health(admin: AdminDep, db: DbDep) -> dict:
    now = datetime.now(timezone.utc)
    risk_cutoff = now - timedelta(days=21)
    month_ago = now - timedelta(days=30)

    # Jugadores en riesgo: jugaron alguna vez pero nada en 21d
    at_risk_rows = list(db.scalars(
        select(PlayerRating).where(
            PlayerRating.last_match_at.is_not(None),
            PlayerRating.last_match_at < risk_cutoff,
            PlayerRating.matches_played >= 3,
        ).order_by(desc(PlayerRating.last_match_at)).limit(30)
    ))
    seen: set[int] = set()
    at_risk = []
    for r in at_risk_rows:
        if r.player_id in seen:
            continue
        seen.add(r.player_id)
        p = db.get(PlayerProfile, r.player_id)
        days = (now - (r.last_match_at if r.last_match_at.tzinfo else r.last_match_at.replace(tzinfo=timezone.utc))).days
        at_risk.append({
            "player_id": r.player_id, "alias": p.alias if p else "?",
            "days_inactive": days, "matches_played": r.matches_played,
            "rating": round(r.rating),
        })

    total_players = db.scalar(select(func.count(PlayerProfile.id))) or 0
    active_30d = db.scalar(
        select(func.count(func.distinct(PlayerRating.player_id))).where(
            PlayerRating.last_match_at >= month_ago
        )
    ) or 0
    with_rating = db.scalar(select(func.count(func.distinct(PlayerRating.player_id)))) or 0

    # LTV: pagos de eventos + crédito neto
    from app.models.base import PaymentStatus
    ltv_rows = db.execute(
        select(EventRegistration.player_id, func.count(EventRegistration.id))
        .where(EventRegistration.payment_status == PaymentStatus.PAID)
        .group_by(EventRegistration.player_id)
        .order_by(desc(func.count(EventRegistration.id))).limit(10)
    ).all()
    top_ltv = []
    for pid, paid_events in ltv_rows:
        p = db.get(PlayerProfile, pid)
        top_ltv.append({"player_id": pid, "alias": p.alias if p else "?",
                        "paid_registrations": int(paid_events)})

    members_active = 0
    for m in db.scalars(select(Membership)):
        pu = m.paid_until if m.paid_until.tzinfo else m.paid_until.replace(tzinfo=timezone.utc)
        if pu > now:
            members_active += 1

    return {
        "total_players": total_players,
        "active_30d": active_30d,
        "conversion_to_competitive_pct": round(with_rating / max(1, total_players) * 100, 1),
        "members_active": members_active,
        "at_risk": at_risk,
        "top_ltv": top_ltv,
    }


class CouponIn(BaseModel):
    player_id: int
    amount_clp: int = Field(ge=500, le=50000, default=2000)


@router.post("/admin/send-coupon")
def send_retention_coupon(payload: CouponIn, admin: AdminDep, db: DbDep) -> dict:
    """1-click: crédito de regreso para jugador en riesgo."""
    growth_svc.grant_credit(
        db, player_id=payload.player_id, amount_clp=payload.amount_clp,
        reason="Te extrañamos en la tienda — volvé a jugar 🎁",
        kind="coupon", by_user_id=admin.id,
    )
    audit.log(db, admin_id=admin.id, action="retention.coupon",
              target_kind="player", target_id=payload.player_id,
              payload={"amount": payload.amount_clp})
    db.commit()
    return {"ok": True}


# ═══════════════════════════ DECK OCR ═══════════════════════════


@router.post("/decks/ocr")
async def deck_ocr(current: UserDep, image: UploadFile = File(...)) -> dict:
    """Foto de decklist (manuscrita o screenshot) → texto parseado por Claude vision."""
    if settings.ai_backend != "anthropic" or not settings.anthropic_api_key:
        return {"ok": False, "mock": True,
                "message": "OCR requiere ANTHROPIC_API_KEY configurada (AI_BACKEND=anthropic)."}
    raw = await image.read()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Imagen máx 8MB")
    media_type = image.content_type or "image/jpeg"
    if media_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no soportado (jpg/png/webp)")
    b64 = base64.standard_b64encode(raw).decode()

    import anthropic
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        msg = client.messages.create(
            model=settings.anthropic_model,  # análisis/visión → modelo general
            max_tokens=1500,
            system=(
                "Sos un OCR de decklists TCG. Extraé la lista de cartas de la imagen. "
                "Output: una carta por línea con formato 'N Nombre de la Carta'. "
                "Si hay sideboard, separalo con una línea 'SIDEBOARD:'. "
                "Solo la lista, sin comentarios."
            ),
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": "Extraé la decklist de esta imagen."},
                ],
            }],
        )
        text = "".join(getattr(b, "text", "") for b in msg.content).strip()
        lines = [l for l in text.splitlines() if l.strip()]
        return {"ok": True, "list_text": text, "lines_count": len(lines)}
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"OCR falló: {type(e).__name__}")


# ═══════════════════════════ CALENDARIO ICS ═══════════════════════════


@router.get("/calendar.ics")
def calendar_ics(db: DbDep, game_id: int | None = None) -> Response:
    """Feed iCalendar de eventos próximos — suscribible desde Google/Apple Calendar."""
    stmt = select(Event).where(
        Event.status.in_([EventStatus.OPEN, EventStatus.CLOSED]),
        Event.starts_at > datetime.now(timezone.utc) - timedelta(hours=12),
    ).order_by(Event.starts_at).limit(100)
    if game_id:
        stmt = stmt.where(Event.game_id == game_id)
    events = list(db.scalars(stmt))

    def _fmt(dt: datetime) -> str:
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "PRODID:-//EliteCards//Eventos//ES",
        "X-WR-CALNAME:EliteCards — Torneos",
    ]
    front = settings.frontend_url.rstrip("/")
    for ev in events:
        g = db.get(Game, ev.game_id)
        end = ev.ends_at or (ev.starts_at + timedelta(hours=4))
        summary = ev.name.replace(",", "\\,").replace(";", "\\;")
        lines += [
            "BEGIN:VEVENT",
            f"UID:elitecards-event-{ev.id}@elitecards",
            f"DTSTAMP:{_fmt(datetime.now(timezone.utc))}",
            f"DTSTART:{_fmt(ev.starts_at)}",
            f"DTEND:{_fmt(end)}",
            f"SUMMARY:{summary} ({g.short_name if g else 'TCG'})",
            f"DESCRIPTION:{front}/events/{ev.id}",
            f"URL:{front}/events/{ev.id}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return Response(content="\r\n".join(lines), media_type="text/calendar",
                    headers={"Content-Disposition": "inline; filename=elitecards.ics"})
