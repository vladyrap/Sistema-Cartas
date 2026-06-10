#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  EliteCards — backup automático de Postgres
#
#  Uso (manual):
#    DATABASE_URL=postgresql://user:pass@host:5432/db \
#    BACKUP_DIR=/var/backups/elitecards \
#    ./pg_backup.sh
#
#  Uso (cron — diario 03:30 con retención 7 días):
#    30 3 * * * /opt/elitecards/scripts/pg_backup.sh >> /var/log/elitecards-backup.log 2>&1
#
#  Variables:
#    DATABASE_URL   — connection string Postgres (requerido).
#    BACKUP_DIR     — directorio destino (default: /var/backups/elitecards).
#    RETENTION_DAYS — días a conservar (default: 7).
#    S3_BUCKET      — opcional, si está seteado sube el dump a S3 (requiere aws cli).
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requerido}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/elitecards}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/elitecards-${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Iniciando backup → $OUT"

# pg_dump con compresión. -Fc = formato custom (mejor para restore selectivo)
# pero usamos plain + gzip para que sea inspeccionable con zcat.
pg_dump --no-owner --no-privileges --clean --if-exists "$DATABASE_URL" \
  | gzip -9 > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -Iseconds)] Backup OK ($SIZE)"

# Subir a S3 si configurado
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[$(date -Iseconds)] Subiendo a s3://${S3_BUCKET}/"
  aws s3 cp "$OUT" "s3://${S3_BUCKET}/$(basename "$OUT")"
fi

# Retención: borrar dumps más viejos que RETENTION_DAYS días
echo "[$(date -Iseconds)] Limpiando dumps >${RETENTION_DAYS} días"
find "$BACKUP_DIR" -name 'elitecards-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -Iseconds)] Listo. Dumps actuales:"
ls -lh "$BACKUP_DIR" | grep elitecards- || echo "(ninguno)"
