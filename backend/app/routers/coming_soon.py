"""Coming Soon — admin marca páginas como "próximamente" + frontend muestra overlay TCG."""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import AdminDep, DbDep
from app.models import ComingSoonPage
from app.services import audit

router = APIRouter()


class ComingSoonOut(BaseModel):
    id: int
    route: str
    title: str
    message: str | None
    image_url: str | None
    eta: str | None
    is_enabled: bool


class ComingSoonIn(BaseModel):
    route: str = Field(min_length=2, max_length=200, pattern=r"^/[a-zA-Z0-9/_:\-]+$")
    title: str = Field(default="Próximamente", min_length=2, max_length=120)
    message: str | None = Field(default=None, max_length=600)
    image_url: str | None = Field(default=None, max_length=800)
    eta: str | None = Field(default=None, max_length=120)
    is_enabled: bool = True


def _to_out(row: ComingSoonPage) -> ComingSoonOut:
    return ComingSoonOut(
        id=row.id, route=row.route, title=row.title,
        message=row.message, image_url=row.image_url, eta=row.eta,
        is_enabled=row.is_enabled,
    )


@router.get("/list", response_model=list[ComingSoonOut])
def public_list(db: DbDep) -> list[ComingSoonOut]:
    """Lista de páginas marcadas. Público — el frontend la cachea al boot.
    Solo devuelve enabled=True para no exponer drafts en proceso."""
    rows = list(db.scalars(
        select(ComingSoonPage).where(ComingSoonPage.is_enabled.is_(True)).order_by(ComingSoonPage.route)
    ))
    return [_to_out(r) for r in rows]


@router.get("/admin/list", response_model=list[ComingSoonOut])
def admin_list(admin: AdminDep, db: DbDep) -> list[ComingSoonOut]:
    """Lista completa, incluye disabled — solo admin."""
    rows = list(db.scalars(select(ComingSoonPage).order_by(ComingSoonPage.route)))
    return [_to_out(r) for r in rows]


@router.post("/", response_model=ComingSoonOut, status_code=201)
def create(payload: ComingSoonIn, admin: AdminDep, db: DbDep) -> ComingSoonOut:
    existing = db.scalar(select(ComingSoonPage).where(ComingSoonPage.route == payload.route))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa ruta ya está marcada — usá PUT para editar")
    row = ComingSoonPage(
        route=payload.route, title=payload.title, message=payload.message,
        image_url=payload.image_url, eta=payload.eta, is_enabled=payload.is_enabled,
        created_by_user_id=admin.id,
    )
    db.add(row)
    audit.log(
        db, admin_id=admin.id, action="coming_soon.create",
        target_kind="route", target_id=None,
        payload={"route": payload.route, "title": payload.title},
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.put("/{cs_id}", response_model=ComingSoonOut)
def update(cs_id: int, payload: ComingSoonIn, admin: AdminDep, db: DbDep) -> ComingSoonOut:
    row = db.get(ComingSoonPage, cs_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coming Soon no encontrado")
    # Si cambia route, verificar que no choque
    if payload.route != row.route:
        other = db.scalar(select(ComingSoonPage).where(
            ComingSoonPage.route == payload.route,
            ComingSoonPage.id != cs_id,
        ))
        if other:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe otro Coming Soon con esa ruta")
    row.route = payload.route
    row.title = payload.title
    row.message = payload.message
    row.image_url = payload.image_url
    row.eta = payload.eta
    row.is_enabled = payload.is_enabled
    audit.log(
        db, admin_id=admin.id, action="coming_soon.update",
        target_kind="coming_soon", target_id=cs_id,
        payload={"route": payload.route, "is_enabled": payload.is_enabled},
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{cs_id}", status_code=204)
def remove(cs_id: int, admin: AdminDep, db: DbDep):
    row = db.get(ComingSoonPage, cs_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coming Soon no encontrado")
    audit.log(
        db, admin_id=admin.id, action="coming_soon.delete",
        target_kind="coming_soon", target_id=cs_id,
        payload={"route": row.route},
    )
    db.delete(row)
    db.commit()


# ─────────────────────────────────────────────────────────────────────
# Imágenes TCG sugeridas — galería curada para mostrar al admin al elegir
# imagen. Son URLs estables de Scryfall (CDN público con cache largo).
# ─────────────────────────────────────────────────────────────────────


class GalleryItem(BaseModel):
    label: str
    image_url: str


@router.get("/gallery", response_model=list[GalleryItem])
def suggested_gallery() -> list[GalleryItem]:
    """Galería curada de imágenes TCG icónicas para usar en pantalla coming-soon.
    Todas son cards en formato art crop de Scryfall (CDN público)."""
    return [
        GalleryItem(label="Black Lotus", image_url="https://cards.scryfall.io/art_crop/front/b/d/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd.jpg"),
        GalleryItem(label="Liliana of the Veil", image_url="https://cards.scryfall.io/art_crop/front/3/8/38a4f598-5e69-40f4-bedc-08c39c7eed18.jpg"),
        GalleryItem(label="Jace, the Mind Sculptor", image_url="https://cards.scryfall.io/art_crop/front/c/8/c800539e-79bb-4707-8f9a-139c20b8e1f0.jpg"),
        GalleryItem(label="Sol Ring", image_url="https://cards.scryfall.io/art_crop/front/8/3/8365ab45-6d78-47ad-a6ed-282069b0fabc.jpg"),
        GalleryItem(label="Force of Will", image_url="https://cards.scryfall.io/art_crop/front/3/0/30e1d3fc-1c5a-4051-869b-6e0ef72d5cf6.jpg"),
        GalleryItem(label="Tarmogoyf", image_url="https://cards.scryfall.io/art_crop/front/4/3/431a376d-9568-44d8-8f50-cebf75ce6b07.jpg"),
        GalleryItem(label="Underground Sea", image_url="https://cards.scryfall.io/art_crop/front/2/0/2061c25b-aa53-46c2-b9ff-c2f2c8f1f7b0.jpg"),
        GalleryItem(label="Wrenn and Six", image_url="https://cards.scryfall.io/art_crop/front/5/c/5cb76266-ae50-4bbc-8f96-d98f309b02d3.jpg"),
        GalleryItem(label="Counterspell", image_url="https://cards.scryfall.io/art_crop/front/9/0/9091dcb6-5d44-4d6b-bea9-39620c0c2f63.jpg"),
        GalleryItem(label="Lightning Bolt", image_url="https://cards.scryfall.io/art_crop/front/f/2/f29ba16f-c8fb-42fe-aabf-87089cb214a7.jpg"),
        GalleryItem(label="Snapcaster Mage", image_url="https://cards.scryfall.io/art_crop/front/9/3/933ad239-2dee-440a-9f0f-5fbe2ab4fcf2.jpg"),
        GalleryItem(label="Thoughtseize", image_url="https://cards.scryfall.io/art_crop/front/e/c/eca97cb4-aa72-470b-907a-7c0c1c0d4b13.jpg"),
    ]
