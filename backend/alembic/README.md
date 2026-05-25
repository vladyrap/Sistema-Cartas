# Alembic — workflow de migraciones

Reemplaza a los scripts ad-hoc `migrate_*.py`. Las migraciones quedan
versionadas, encadenadas y reversibles.

## Comandos día a día

```bash
# Ver versión actual de la BD
alembic current

# Ver historia completa
alembic history

# Aplicar migraciones pendientes
alembic upgrade head

# Generar una nueva migración a partir de cambios en los modelos
alembic revision --autogenerate -m "descripción corta"

# Bajar una migración
alembic downgrade -1
```

## Setup inicial

### BD fresca (nuevo entorno)

```bash
alembic upgrade head
```

Eso crea todas las tablas. Listo.

### BD pre-existente (ya tiene el schema, viene de scripts ad-hoc)

```bash
alembic stamp head
```

Le dice a Alembic "esta BD ya está al día con el baseline", sin re-correr nada.
La BD de dev local fue stampeada el 2026-05-24.

## Cómo crear una migración nueva

1. Modificás el modelo en `app/models/*.py`.
2. Corres:
   ```bash
   alembic revision --autogenerate -m "agrego columna X en Y"
   ```
3. Revisás el archivo generado en `alembic/versions/`. Autogenerate **no es
   perfecto** — verificá:
   - Renames de columnas (los detecta como DROP+ADD; corregilo a mano si querés
     preservar datos).
   - Constraints custom.
   - Datos a backfillar (agregalos en `upgrade()` con `op.execute(...)`).
4. Probás en local: `alembic upgrade head`.
5. Si rompió: `alembic downgrade -1` y arreglás el script.
6. Commit con el archivo de migración.

## SQLite vs Postgres

- En SQLite los ALTER TABLE son limitados. `env.py` activa `render_as_batch=True`
  para SQLite — Alembic genera la lógica de "crear tabla nueva → copiar → drop".
- En Postgres todo va directo (ALTER TABLE nativo).
- La migración misma es la misma, Alembic se adapta al motor.

## Migraciones ad-hoc previas (legacy)

Los scripts en `scripts/migrate_*.py` fueron usados antes de Alembic. **No
correrlos en producción**. El baseline (`0001_baseline.py`) ya cubre todo el
schema que esos scripts construyeron incrementalmente.
