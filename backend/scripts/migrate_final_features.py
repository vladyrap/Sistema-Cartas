"""Migración final: quantum, quests, brain.io polls + seed de 3 quest arcs."""
import logging
from sqlalchemy import inspect, select

from app.core.db import engine, SessionLocal
from app.models.quantum_deck import QuantumDeck
from app.models.quest import QuestArc, QuestStep, PlayerQuestProgress
from app.models.brain_poll import BrainPoll, BrainVote


SEED_ARCS = [
    {
        "code": "throne_of_thorns",
        "title": "El Trono de Espinas",
        "synopsis": "El Rey ha sido envenenado. Tres facciones disputan el trono. Eligí tu lado.",
        "npc_name": "Magistrado Caelis",
        "npc_role": "Consejero real",
        "intro_narration": (
            "Los pasillos del castillo apestan a complot. El Rey agoniza. Tres herederos se "
            "miran de reojo entre las sombras del salón. Caelis, el viejo Magistrado, te llama "
            "a un costado: \"Necesito a alguien sin lealtades. Alguien como vos.\""
        ),
        "outro_narration": (
            "Cuando el polvo se asienta, el nuevo soberano ocupa el trono. Caelis te coloca "
            "una capa púrpura sobre los hombros: \"No olvidaré quién hizo esto posible.\""
        ),
        "reward_exp": 1500,
        "sort_order": 1,
        "steps": [
            {"step_number": 1, "title": "Probar tu valor",
             "narration": "Antes que nada, Caelis quiere ver si sabés pelear. \"Ganá tres matches. Cualquier formato. Vuelve cuando lo hayas hecho.\"",
             "requirement_kind": "win_match", "requirement_target": 3, "reward_exp": 200},
            {"step_number": 2, "title": "Demostrar tu lealtad",
             "narration": "El consejero te tira un sobre lacrado. \"Asistí al próximo evento oficial. Quiero ver tu cara entre los participantes.\"",
             "requirement_kind": "attend_event", "requirement_target": 1, "reward_exp": 300},
            {"step_number": 3, "title": "Dominar la corte",
             "narration": "\"Ahora la prueba real. Ganá un evento competitivo. El nuevo Rey verá tu nombre en lo más alto.\"",
             "requirement_kind": "event_top3", "requirement_target": 1, "reward_exp": 800},
        ],
    },
    {
        "code": "the_archetypist",
        "title": "El Camino del Archetypist",
        "synopsis": "Una secta de jugadores cree que cada archetype tiene un alma. Aprendé a ver la suya.",
        "npc_name": "Maestra Iolana",
        "npc_role": "Lectora de mazos",
        "intro_narration": (
            "Iolana extiende cinco cartas boca abajo sobre la mesa. \"Cada mazo respira distinto. "
            "Si querés entender tu propio juego, primero tenés que conocer al menos cinco caminos.\""
        ),
        "outro_narration": (
            "\"Ahora lo ves\", sonríe Iolana. \"No hay 'el mejor deck'. Solo el que coincide con vos.\" "
            "Te entrega un amuleto con tu primer archetype grabado en plata."
        ),
        "reward_exp": 1000,
        "sort_order": 2,
        "steps": [
            {"step_number": 1, "title": "Jugá tres archetypes distintos",
             "narration": "\"Variedad. Sin ella, solo conocés un idioma del juego.\"",
             "requirement_kind": "play_distinct_archetypes", "requirement_target": 3, "reward_exp": 250},
            {"step_number": 2, "title": "Ganá con un archetype no-default",
             "narration": "\"Te resulta cómodo lo conocido. Ahora ganá con algo nuevo.\"",
             "requirement_kind": "win_with_new_archetype", "requirement_target": 1, "reward_exp": 350},
            {"step_number": 3, "title": "Hacé tu primera ofrenda a un altar",
             "narration": "\"Las devociones no son sólo simbólicas. Demostrá tu fe a un archetype.\"",
             "requirement_kind": "devotion_offer", "requirement_target": 1, "reward_exp": 400},
        ],
    },
    {
        "code": "the_regicide",
        "title": "El Regicidio",
        "synopsis": "El #1 del ranking cree que nadie puede tocarlo. Vos vas a probar lo contrario.",
        "npc_name": "Sombra (anónimo)",
        "npc_role": "Patrón en las sombras",
        "intro_narration": (
            "Una nota desliza bajo tu puerta: 'El Campeón es solo un humano con suerte. Yo pagaré "
            "para que el mundo lo recuerde así.' No hay firma. Solo un símbolo: una corona partida."
        ),
        "outro_narration": (
            "Cuando el #1 cae, la noticia se propaga como pólvora. La nota anónima vuelve, una sola línea: "
            "\"Hay otros tronos que tumbar. Avisame cuando estés listo.\""
        ),
        "reward_exp": 2000,
        "sort_order": 3,
        "steps": [
            {"step_number": 1, "title": "Subí 100 puntos de rating",
             "narration": "\"No podés enfrentar al campeón siendo cualquiera. Empieza por subir.\"",
             "requirement_kind": "rating_gain", "requirement_target": 100, "reward_exp": 400},
            {"step_number": 2, "title": "Crea un bounty contract",
             "narration": "\"Sembrá el rumor. Pon precio sobre alguien que importe.\"",
             "requirement_kind": "create_bounty", "requirement_target": 1, "reward_exp": 500},
            {"step_number": 3, "title": "Vencé al #1 del ranking",
             "narration": "\"Llegó el momento. Si fallas, nadie va a recordar el intento.\"",
             "requirement_kind": "defeat_champion", "requirement_target": 1, "reward_exp": 1100},
        ],
    },
]


def main():
    log = logging.getLogger("migrate_final")
    insp = inspect(engine)
    existing = set(insp.get_table_names())

    for model in (QuantumDeck, QuestArc, QuestStep, PlayerQuestProgress, BrainPoll, BrainVote):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")

    # Seed quest arcs si no existen
    db = SessionLocal()
    try:
        for arc_def in SEED_ARCS:
            existing_arc = db.scalar(select(QuestArc).where(QuestArc.code == arc_def["code"]))
            if existing_arc:
                print(f"- arc {arc_def['code']} ya existe")
                continue
            arc = QuestArc(
                code=arc_def["code"], title=arc_def["title"],
                synopsis=arc_def["synopsis"], npc_name=arc_def["npc_name"],
                npc_role=arc_def["npc_role"],
                intro_narration=arc_def["intro_narration"],
                outro_narration=arc_def["outro_narration"],
                reward_exp=arc_def["reward_exp"],
                sort_order=arc_def["sort_order"],
            )
            db.add(arc)
            db.flush()
            for step_def in arc_def["steps"]:
                step = QuestStep(arc_id=arc.id, **step_def)
                db.add(step)
            db.commit()
            print(f"+ arc {arc_def['code']} sembrado con {len(arc_def['steps'])} pasos")
    finally:
        db.close()


if __name__ == "__main__":
    main()
