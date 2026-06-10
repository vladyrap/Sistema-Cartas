#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  EliteCards — smoke test post-deploy
#
#  Verifica que los endpoints críticos respondan después de un deploy.
#  Devuelve exit-code 0 si todo OK, ≠0 si algo falla (apto para rollback).
#
#  Uso:
#    BASE_URL=https://api.tu-dominio.com ./smoke_test.sh
#
#  Ejemplo en deploy.sh:
#    ./smoke_test.sh || { echo "Smoke test falló — rollback"; ./rollback.sh; exit 1; }
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
TIMEOUT="${TIMEOUT:-10}"

# Colores
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; NC=$'\033[0m'

pass=0
fail=0
failed_names=()

check() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expected="$4"
  local extra="${5:-}"

  local code
  code=$(curl -sS -o /tmp/smoke_body -w '%{http_code}' \
    --max-time "$TIMEOUT" \
    -X "$method" \
    $extra \
    "${BASE_URL}${path}" 2>/dev/null || echo "000")

  if [[ "$code" == "$expected" ]]; then
    echo "  ${GREEN}✓${NC} ${name} (${code})"
    pass=$((pass + 1))
  else
    echo "  ${RED}✗${NC} ${name} — esperaba ${expected}, obtuve ${code}"
    fail=$((fail + 1))
    failed_names+=("$name")
  fi
}

echo
echo "════════════════════════════════════════════════════════════"
echo " EliteCards Smoke Test — ${BASE_URL}"
echo "════════════════════════════════════════════════════════════"
echo

echo "Liveness:"
check "/health" GET "/health" "200"

echo
echo "Readiness:"
# /health/deep retorna 200 si todo OK, 503 si algo degradado. Aceptamos solo 200.
check "/health/deep" GET "/health/deep" "200"

echo
echo "API públicas:"
check "Lista de juegos" GET "/api/games" "200"
check "Lista de eventos públicos" GET "/api/events" "200"
check "Catálogo público" GET "/api/catalog" "200"
check "Lista de Gremios" GET "/api/guilds" "200"

echo
echo "Auth flow (espera 401/422 sin credenciales):"
check "Login sin body" POST "/auth/login" "422" "-H 'Content-Type: application/json' -d {}"
check "Me sin token" GET "/auth/me" "401"

echo
echo "Rutas protegidas (espera 401):"
check "Notifications sin auth" GET "/api/notifications/unread-count" "401"

echo
echo "404 sanity:"
check "Ruta inexistente" GET "/api/this-does-not-exist" "404"

echo
echo "════════════════════════════════════════════════════════════"
if [[ "$fail" -eq 0 ]]; then
  echo " ${GREEN}✓ Smoke test OK — ${pass} checks pasaron${NC}"
  echo "════════════════════════════════════════════════════════════"
  exit 0
else
  echo " ${RED}✗ Smoke test FALLÓ — ${fail} de $((pass + fail)) checks fallaron${NC}"
  echo "    Fallidos: ${failed_names[*]}"
  echo "════════════════════════════════════════════════════════════"
  exit 1
fi
