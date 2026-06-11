"""TCG news aggregator.

Estrategia: combinar Reddit JSON (sin auth, sin key, super estable) con RSS
oficiales cuando existan. Dedup por hash(url + title normalizado).

Fuentes (todas gratis):
  - Reddit /r/<sub>/new.json — el formato JSON tiene `data.children[].data`
    con title, url, thumbnail, created_utc, score, num_comments, permalink,
    author, selftext, preview.images[0].source.url.
  - RSS de WotC Magic / Pokemon (parseo XML stdlib).
"""
from __future__ import annotations

import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.core.db import SessionLocal
from app.models import TcgNews

logger = logging.getLogger("tcg_news")

REDDIT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 EliteCards-Bot/1.0"
)
REDDIT_TIMEOUT = 15.0


@dataclass(frozen=True)
class FeedSource:
    """Una fuente de noticias TCG."""
    source_id: str         # interno: "reddit_magictcg"
    source_label: str      # humano: "r/magicTCG"
    game_key: str          # mtg | pokemon | ygo | onepiece | union_arena | digimon | general
    kind: str              # "reddit" | "rss"
    target: str            # subreddit name OR full RSS url


SOURCES: tuple[FeedSource, ...] = (
    # === Magic the Gathering — RSS confirmados funcionando ===
    FeedSource("hipsters", "Hipsters of the Coast", "mtg", "rss", "https://www.hipstersofthecoast.com/feed/"),
    FeedSource("mtggoldfish", "MTGGoldfish", "mtg", "rss", "https://www.mtggoldfish.com/articles.rss"),
    FeedSource("scg", "Star City Games", "mtg", "rss", "https://articles.starcitygames.com/feed/"),
    FeedSource("mtgazone", "MTG Arena Zone", "mtg", "rss", "https://mtgazone.com/feed/"),
    # === Reddit (best effort — Reddit bloquea bots agresivamente en 2025+) ===
    # Si Reddit responde, suma. Si no, los TCGs no-MTG se llenan via editorial manual.
    FeedSource("reddit_magictcg", "r/magicTCG", "mtg", "reddit", "magicTCG"),
    FeedSource("reddit_pokemontcg", "r/PokemonTCG", "pokemon", "reddit", "PokemonTCG"),
    FeedSource("reddit_yugioh", "r/yugioh", "ygo", "reddit", "yugioh"),
    FeedSource("reddit_optcg", "r/OnePieceTCG", "onepiece", "reddit", "OnePieceTCG"),
    FeedSource("reddit_unionarena", "r/unionarenatcg", "union_arena", "reddit", "unionarenatcg"),
    FeedSource("reddit_digimoncg", "r/DigimonCardGame", "digimon", "reddit", "DigimonCardGame"),
)


def _hash_item(url: str, title: str) -> str:
    norm = (url.strip().lower() + "|" + re.sub(r"\s+", " ", title.strip().lower()))
    return hashlib.sha1(norm.encode("utf-8")).hexdigest()[:32]


def _clean(text: str | None, max_len: int = 400) -> str | None:
    if not text:
        return None
    s = re.sub(r"\s+", " ", text).strip()
    return s[:max_len] if s else None


def _fetch_reddit(client: httpx.Client, sub: str, limit: int = 25) -> list[dict]:
    # old.reddit.com es más permisivo con clients que no se autenticaron via OAuth.
    # Si falla 403, fallback a .rss (siempre público).
    url = f"https://old.reddit.com/r/{sub}/new.json?limit={limit}&raw_json=1"
    r = client.get(url, headers={
        "User-Agent": REDDIT_UA,
        "Accept": "application/json,text/html;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
    }, timeout=REDDIT_TIMEOUT)
    if r.status_code != 200:
        logger.warning("reddit json fetch failed %s status=%s — trying RSS fallback", sub, r.status_code)
        return _fetch_reddit_rss(client, sub)
    items: list[dict] = []
    for child in r.json().get("data", {}).get("children", []):
        d = child.get("data") or {}
        if d.get("stickied") or d.get("over_18"):
            continue
        title = d.get("title")
        if not title:
            continue
        url_link = d.get("url_overridden_by_dest") or d.get("url") or f"https://reddit.com{d.get('permalink', '')}"
        thumb = d.get("thumbnail")
        if thumb in (None, "", "self", "default", "spoiler", "nsfw"):
            thumb = None
        # Image from preview if available
        if not thumb:
            try:
                images = d.get("preview", {}).get("images") or []
                if images:
                    raw = images[0].get("source", {}).get("url")
                    if raw:
                        thumb = raw.replace("&amp;", "&")
            except Exception:
                pass
        items.append({
            "title": _clean(title, 400),
            "url": url_link,
            "image_url": thumb,
            "summary": _clean(d.get("selftext"), 600),
            "author": d.get("author"),
            "score": int(d.get("score") or 0),
            "comments_count": int(d.get("num_comments") or 0),
            "published_at": datetime.fromtimestamp(int(d.get("created_utc") or 0), tz=timezone.utc),
        })
    return items


def _fetch_reddit_rss(client: httpx.Client, sub: str) -> list[dict]:
    """Fallback usando el RSS feed de Reddit (siempre público)."""
    url = f"https://www.reddit.com/r/{sub}/new.rss?limit=25"
    try:
        r = client.get(url, headers={"User-Agent": REDDIT_UA, "Accept": "application/rss+xml,application/xml"}, timeout=REDDIT_TIMEOUT)
        if r.status_code != 200:
            logger.warning("reddit rss fallback failed %s status=%s", sub, r.status_code)
            return []
        root = ET.fromstring(r.text)
    except Exception:
        logger.exception("reddit rss parse failed %s", sub)
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/"}
    items: list[dict] = []
    for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
        title = (entry.findtext("atom:title", namespaces=ns) or "").strip()
        link_el = entry.find("atom:link", namespaces=ns)
        link = link_el.get("href") if link_el is not None else ""
        if not title or not link:
            continue
        content = entry.findtext("atom:content", namespaces=ns) or ""
        author = entry.findtext("atom:author/atom:name", namespaces=ns)
        upd = entry.findtext("atom:updated", namespaces=ns) or entry.findtext("atom:published", namespaces=ns)
        items.append({
            "title": _clean(title, 400),
            "url": link,
            "image_url": _extract_img(content),
            "summary": _clean(re.sub(r"<[^>]+>", " ", content), 600),
            "author": (author or "").lstrip("/u/").lstrip("u/") or None,
            "score": 0, "comments_count": 0,
            "published_at": _parse_iso(upd) or datetime.now(timezone.utc),
        })
    return items


def _fetch_rss(client: httpx.Client, feed_url: str) -> list[dict]:
    try:
        r = client.get(feed_url, headers={"User-Agent": REDDIT_UA}, timeout=REDDIT_TIMEOUT)
        if r.status_code != 200:
            logger.warning("rss fetch failed %s status=%s", feed_url, r.status_code)
            return []
        root = ET.fromstring(r.text)
    except Exception as e:
        logger.warning("rss parse failed %s: %s", feed_url, e)
        return []

    # RSS 2.0: <rss><channel><item>...
    # Atom:    <feed><entry>...
    items: list[dict] = []
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.iter("item"):
        title = (entry.findtext("title") or "").strip()
        link = (entry.findtext("link") or "").strip()
        if not title or not link:
            continue
        desc = entry.findtext("description") or ""
        pub = entry.findtext("pubDate") or ""
        when = _parse_rfc822(pub) or datetime.now(timezone.utc)
        items.append({
            "title": _clean(title, 400),
            "url": link,
            "image_url": _extract_img(desc),
            "summary": _clean(re.sub(r"<[^>]+>", " ", desc), 600),
            "author": entry.findtext("{http://purl.org/dc/elements/1.1/}creator"),
            "score": 0, "comments_count": 0,
            "published_at": when,
        })
    for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
        title = (entry.findtext("atom:title", namespaces=ns) or "").strip()
        link_el = entry.find("atom:link", namespaces=ns)
        link = link_el.get("href") if link_el is not None else ""
        if not title or not link:
            continue
        summary = entry.findtext("atom:summary", namespaces=ns) or entry.findtext("atom:content", namespaces=ns) or ""
        upd = entry.findtext("atom:updated", namespaces=ns) or entry.findtext("atom:published", namespaces=ns)
        when = _parse_iso(upd) or datetime.now(timezone.utc)
        items.append({
            "title": _clean(title, 400),
            "url": link,
            "image_url": _extract_img(summary),
            "summary": _clean(re.sub(r"<[^>]+>", " ", summary), 600),
            "author": entry.findtext("atom:author/atom:name", namespaces=ns),
            "score": 0, "comments_count": 0,
            "published_at": when,
        })
    return items


def _parse_rfc822(s: str) -> datetime | None:
    """RSS 2.0 pubDate format."""
    if not s:
        return None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _extract_img(html: str | None) -> str | None:
    if not html:
        return None
    m = re.search(r'<img[^>]+src="([^"]+)"', html)
    return m.group(1) if m else None


def refresh_all() -> dict:
    """Fetcher principal — corre desde el scheduler. Devuelve stats."""
    inserted = 0
    skipped = 0
    failed_sources = 0
    now = datetime.now(timezone.utc)

    db = SessionLocal()
    try:
        with httpx.Client(follow_redirects=True) as client:
            for src in SOURCES:
                try:
                    if src.kind == "reddit":
                        items = _fetch_reddit(client, src.target)
                    elif src.kind == "rss":
                        items = _fetch_rss(client, src.target)
                    else:
                        items = []
                except Exception:
                    logger.exception("source %s fetch failed", src.source_id)
                    failed_sources += 1
                    continue

                for it in items:
                    if not it.get("title") or not it.get("url"):
                        continue
                    h = _hash_item(it["url"], it["title"])
                    exists = db.scalar(select(TcgNews.id).where(TcgNews.content_hash == h))
                    if exists:
                        skipped += 1
                        continue
                    row = TcgNews(
                        game_key=src.game_key,
                        title=it["title"][:400],
                        summary=it.get("summary"),
                        url=it["url"][:800],
                        image_url=(it.get("image_url") or None) and it["image_url"][:800],
                        source=src.source_id,
                        source_label=src.source_label,
                        author=(it.get("author") or None) and it["author"][:120],
                        score=it.get("score") or 0,
                        comments_count=it.get("comments_count") or 0,
                        published_at=it.get("published_at") or now,
                        fetched_at=now,
                        content_hash=h,
                    )
                    db.add(row)
                    try:
                        db.flush()
                        inserted += 1
                    except IntegrityError:
                        db.rollback()
                        skipped += 1
        db.commit()

        # Cleanup viejos (>45 días) — corre acá para no agregar otro job
        cutoff = now - timedelta(days=45)
        deleted = db.execute(delete(TcgNews).where(TcgNews.published_at < cutoff)).rowcount or 0
        db.commit()
    finally:
        db.close()

    logger.info("tcg_news refresh ok inserted=%d skipped=%d failed=%d", inserted, skipped, failed_sources)
    return {"inserted": inserted, "skipped": skipped, "failed_sources": failed_sources, "deleted_old": deleted}
