# Backups Postgres — EliteCards

## Instalación rápida (VPS)

```bash
# 1. Copiar el script al server
scp backend/scripts/pg_backup.sh user@vps:/opt/elitecards/scripts/
ssh user@vps 'chmod +x /opt/elitecards/scripts/pg_backup.sh'

# 2. Probar manualmente
ssh user@vps
sudo mkdir -p /var/backups/elitecards /var/log
sudo chown $USER:$USER /var/backups/elitecards
DATABASE_URL='postgresql://elitecards:PASS@localhost:5432/elitecards' \
  /opt/elitecards/scripts/pg_backup.sh

# 3. Verificar que el dump quedó bien
zcat /var/backups/elitecards/elitecards-*.sql.gz | head -50
```

## Cron (diario 03:30, retención 7 días)

```bash
crontab -e
```

Pegar:

```
30 3 * * * DATABASE_URL='postgresql://elitecards:PASS@localhost:5432/elitecards' BACKUP_DIR=/var/backups/elitecards RETENTION_DAYS=7 /opt/elitecards/scripts/pg_backup.sh >> /var/log/elitecards-backup.log 2>&1
```

## Restore

```bash
# Decomprimir y restaurar (CUIDADO: --clean borra tablas existentes)
zcat /var/backups/elitecards/elitecards-20260610-033000.sql.gz \
  | psql 'postgresql://elitecards:PASS@localhost:5432/elitecards'
```

## Backup off-site (S3)

```bash
# 1. Instalar aws cli en el VPS:
sudo apt install awscli
aws configure  # access key + secret de IAM user con permiso s3:PutObject

# 2. Agregar S3_BUCKET al cron:
30 3 * * * DATABASE_URL='...' S3_BUCKET=elitecards-backups /opt/elitecards/scripts/pg_backup.sh ...
```

## Monitoreo

```bash
# Ver últimos backups
ls -lh /var/backups/elitecards/

# Ver log
tail -50 /var/log/elitecards-backup.log

# Alertar si no hubo backup en 25h:
find /var/backups/elitecards -name 'elitecards-*.sql.gz' -mmin -1500 | grep -q . \
  || echo 'ALERTA: backup faltante hace >25h' | mail -s 'EliteCards backup' tu@email
```
