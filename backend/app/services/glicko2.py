"""Implementación de Glicko-2 (Glickman 2012).

Glicko-2 mejora ELO con:
  - Rating Deviation (RD): incertidumbre del rating. Cuanto más juega un jugador,
    más bajo su RD.
  - Volatility: cuánto fluctúa el desempeño. Sube si los resultados son erráticos.

Constante τ (system constant) controla qué tan rápido cambia la volatility.
Valores típicos: 0.3 (jugadores con rendimiento estable) a 1.2 (resultados erráticos).
Por defecto usamos 0.5 — buen compromiso para TCG.

Referencia: http://www.glicko.net/glicko/glicko2.pdf

API pública:
  - update_rating(player, opponents_results) → nuevos (rating, rd, vol)
  donde opponents_results es lista de (opponent_rating, opponent_rd, score) con
  score ∈ {1.0 (win), 0.5 (draw), 0.0 (loss)}.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


TAU = 0.5  # system constant
SCALE = 173.7178  # factor de conversión entre rating Glicko y Glicko-2
EPSILON = 1e-6  # tolerancia para la iteración de volatility


@dataclass
class RatingState:
    rating: float
    rd: float
    volatility: float


def _g(phi: float) -> float:
    return 1.0 / math.sqrt(1.0 + 3.0 * phi * phi / (math.pi * math.pi))


def _expected_score(mu: float, mu_j: float, phi_j: float) -> float:
    return 1.0 / (1.0 + math.exp(-_g(phi_j) * (mu - mu_j)))


def update_rating(
    player: RatingState,
    opponents_results: list[tuple[float, float, float]],
) -> RatingState:
    """Devuelve un nuevo RatingState para el jugador después de N matches.

    `opponents_results`: lista de (opponent_rating, opponent_rd, score).
    Si la lista está vacía, solo se actualiza RD (jugador inactivo, su
    incertidumbre crece).
    """
    # Sin resultados — solo aumentar RD por inactividad.
    if not opponents_results:
        phi = player.rd / SCALE
        new_phi = math.sqrt(phi * phi + player.volatility * player.volatility)
        return RatingState(
            rating=player.rating,
            rd=min(new_phi * SCALE, 350.0),
            volatility=player.volatility,
        )

    # Convertir a escala Glicko-2.
    mu = (player.rating - 1500.0) / SCALE
    phi = player.rd / SCALE
    sigma = player.volatility

    # Calcular v y delta.
    v_inv = 0.0
    delta_sum = 0.0
    for opp_rating, opp_rd, score in opponents_results:
        mu_j = (opp_rating - 1500.0) / SCALE
        phi_j = opp_rd / SCALE
        g_j = _g(phi_j)
        e_j = _expected_score(mu, mu_j, phi_j)
        v_inv += g_j * g_j * e_j * (1.0 - e_j)
        delta_sum += g_j * (score - e_j)
    v = 1.0 / v_inv
    delta = v * delta_sum

    # Iteración para nueva volatility (algoritmo del paper).
    a = math.log(sigma * sigma)
    tau_sq = TAU * TAU

    def f(x: float) -> float:
        ex = math.exp(x)
        d2 = delta * delta
        phi_sq = phi * phi
        return (ex * (d2 - phi_sq - v - ex)) / (2.0 * (phi_sq + v + ex) ** 2) - (x - a) / tau_sq

    # Bracket inicial.
    A = a
    if delta * delta > phi * phi + v:
        B = math.log(delta * delta - phi * phi - v)
    else:
        k = 1
        while f(a - k * TAU) < 0:
            k += 1
        B = a - k * TAU

    fA = f(A)
    fB = f(B)
    # Iteración Illinois.
    iterations = 0
    while abs(B - A) > EPSILON and iterations < 100:
        C = A + (A - B) * fA / (fB - fA)
        fC = f(C)
        if fC * fB <= 0:
            A = B
            fA = fB
        else:
            fA = fA / 2.0
        B = C
        fB = fC
        iterations += 1

    new_sigma = math.exp(A / 2.0)

    # Actualizar phi*.
    phi_star = math.sqrt(phi * phi + new_sigma * new_sigma)

    # Nuevo phi y mu.
    new_phi = 1.0 / math.sqrt(1.0 / (phi_star * phi_star) + 1.0 / v)
    new_mu = mu + new_phi * new_phi * delta_sum

    # De vuelta a escala Glicko.
    new_rating = new_mu * SCALE + 1500.0
    new_rd = new_phi * SCALE
    # Clip de seguridad.
    return RatingState(
        rating=round(new_rating, 2),
        rd=round(min(new_rd, 350.0), 2),
        volatility=round(new_sigma, 6),
    )
