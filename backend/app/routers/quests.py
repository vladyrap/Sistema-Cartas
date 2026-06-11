"""Quest arcs — narrativas con NPCs. Listar, progresar, completar."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import (
    PlayerQuestProgress, QuestArc, QuestStep, ExpTransaction, Season, SeasonStatus,
)

log = logging.getLogger("quests")
router = APIRouter()


class StepOut(BaseModel):
    id: int
    step_number: int
    title: str
    narration: str
    requirement_kind: str
    requirement_value: str | None
    requirement_target: int
    reward_exp: int
    my_progress: int = 0
    is_completed: bool = False


class ArcOut(BaseModel):
    id: int
    code: str
    title: str
    synopsis: str
    npc_name: str
    npc_role: str | None
    intro_narration: str
    outro_narration: str
    reward_exp: int
    steps: list[StepOut]
    completed_steps: int = 0
    total_steps: int = 0
    is_completed: bool = False


def _arc_with_progress(db, arc: QuestArc, player_id: int | None) -> ArcOut:
    steps = list(db.scalars(
        select(QuestStep).where(QuestStep.arc_id == arc.id).order_by(QuestStep.step_number)
    ))
    progress_map: dict[int, PlayerQuestProgress] = {}
    if player_id:
        for pp in db.scalars(
            select(PlayerQuestProgress).where(
                PlayerQuestProgress.player_id == player_id,
                PlayerQuestProgress.arc_id == arc.id,
            )
        ):
            progress_map[pp.step_id] = pp

    step_outs: list[StepOut] = []
    completed_count = 0
    for s in steps:
        pp = progress_map.get(s.id)
        is_done = bool(pp and pp.completed_at)
        if is_done:
            completed_count += 1
        step_outs.append(StepOut(
            id=s.id, step_number=s.step_number, title=s.title,
            narration=s.narration, requirement_kind=s.requirement_kind,
            requirement_value=s.requirement_value, requirement_target=s.requirement_target,
            reward_exp=s.reward_exp,
            my_progress=pp.progress if pp else 0,
            is_completed=is_done,
        ))
    return ArcOut(
        id=arc.id, code=arc.code, title=arc.title, synopsis=arc.synopsis,
        npc_name=arc.npc_name, npc_role=arc.npc_role,
        intro_narration=arc.intro_narration, outro_narration=arc.outro_narration,
        reward_exp=arc.reward_exp,
        steps=step_outs,
        completed_steps=completed_count,
        total_steps=len(step_outs),
        is_completed=completed_count == len(step_outs) and len(step_outs) > 0,
    )


@router.get("/arcs", response_model=list[ArcOut])
def list_arcs(current: UserDep, db: DbDep) -> list[ArcOut]:
    arcs = list(db.scalars(select(QuestArc).order_by(QuestArc.sort_order)))
    pid = current.profile.id if current.profile else None
    return [_arc_with_progress(db, a, pid) for a in arcs]


@router.post("/steps/{step_id}/claim", response_model=StepOut)
def claim_step(step_id: int, current: UserDep, db: DbDep) -> StepOut:
    """Marca un step como completado manualmente (modo simple — confirmación del jugador).

    El requirement_kind real se valida via hooks en otros services. Acá el jugador
    confirma que cumplió, y se acredita la EXP. Anti-abuse: cada step solo se
    puede claim una vez por jugador (UNIQUE).
    """
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    step = db.get(QuestStep, step_id)
    if not step:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Step no encontrado")

    pp = db.scalar(select(PlayerQuestProgress).where(
        PlayerQuestProgress.player_id == current.profile.id,
        PlayerQuestProgress.step_id == step_id,
    ))
    if pp and pp.completed_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya completaste este step")

    if not pp:
        pp = PlayerQuestProgress(
            player_id=current.profile.id,
            arc_id=step.arc_id,
            step_id=step.id,
        )
        db.add(pp)
        db.flush()

    pp.progress = step.requirement_target
    pp.completed_at = datetime.now(timezone.utc)

    # Acreditar EXP del step
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if active:
        db.add(ExpTransaction(
            player_id=current.profile.id,
            season_id=active.id,
            amount=step.reward_exp,
            reason=f"quest_step:{step.arc_id}:{step.step_number}",
        ))

    # Si era el último paso del arc, acreditar bonus del arc
    arc_steps = list(db.scalars(select(QuestStep).where(QuestStep.arc_id == step.arc_id)))
    completed_count = db.scalar(
        select(__import__("sqlalchemy").func.count(PlayerQuestProgress.id)).where(
            PlayerQuestProgress.player_id == current.profile.id,
            PlayerQuestProgress.arc_id == step.arc_id,
            PlayerQuestProgress.completed_at.is_not(None),
        )
    ) or 0
    if completed_count >= len(arc_steps) and active:
        arc = db.get(QuestArc, step.arc_id)
        if arc:
            db.add(ExpTransaction(
                player_id=current.profile.id,
                season_id=active.id,
                amount=arc.reward_exp,
                reason=f"quest_arc_completed:{arc.code}",
            ))

    db.commit()
    return StepOut(
        id=step.id, step_number=step.step_number, title=step.title,
        narration=step.narration, requirement_kind=step.requirement_kind,
        requirement_value=step.requirement_value,
        requirement_target=step.requirement_target,
        reward_exp=step.reward_exp,
        my_progress=pp.progress,
        is_completed=True,
    )
