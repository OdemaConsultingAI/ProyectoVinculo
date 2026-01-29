# 🕐 Evitar que Render Free se duerma

Render Free **duerme** el servicio tras ~15 minutos sin peticiones. La primera petición después puede tardar ~30 segundos (cold start).

Para evitarlo, algo externo debe **hacer una petición** a tu API cada **10–14 minutos**.

---

## Opción 1: GitHub Actions (ya configurado en el repo)

Se creó un workflow que hace **ping cada 14 minutos** a tu health endpoint.

**Qué hace:** GitHub ejecuta el workflow en ese intervalo y llama a:
`https://proyectovinculo.onrender.com/api/health`

**Requisitos:**
- El repo debe estar en GitHub.
- Los **Actions** deben estar activos (por defecto suelen estar activos).

**Dónde está:** `.github/workflows/keep-awake-render.yml`

**Comprobar:** En GitHub → pestaña **Actions** → workflow "Keep Render awake". Deberías ver ejecuciones cada ~14 minutos.

**Si cambias la URL del backend:** edita en ese archivo la URL dentro del `curl`.

---

## Opción 2: UptimeRobot (sin tocar código)

Servicio gratuito que vigila una URL y la llama cada X minutos.

1. Entra en **https://uptimerobot.com** y crea cuenta (gratis).
2. **Add New Monitor**
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Vínculos Backend (o el que quieras)
   - **URL:** `https://proyectovinculo.onrender.com/api/health`
   - **Monitoring Interval:** 5 minutes (gratis)
3. **Create Monitor**

Cada 5 minutos UptimeRobot hará una petición a tu API y, de paso, mantendrá el servicio despierto. Además verás si el servicio deja de responder.

---

## Opción 3: cron-job.org

1. Entra en **https://cron-job.org** y crea cuenta (gratis).
2. Crea un **Cron Job**:
   - **URL:** `https://proyectovinculo.onrender.com/api/health`
   - **Interval:** cada 10 o 14 minutos (según lo que permita el plan gratis)
3. Guarda.

Cada X minutos hará una petición y ayudará a que Render no duerma.

---

## Resumen

| Método            | Ventaja                         | Dónde se configura      |
|-------------------|---------------------------------|---------------------------|
| **GitHub Actions**| Ya en el repo, sin servicios extra | `.github/workflows/keep-awake-render.yml` |
| **UptimeRobot**   | Muy fácil, + alertas si cae     | uptimerobot.com          |
| **cron-job.org**  | Alternativa gratuita            | cron-job.org             |

Puedes usar **solo uno** (por ejemplo GitHub Actions) o combinar (p. ej. Actions + UptimeRobot para tener también monitoreo).

---

## Importante

- No hace falta que el ping sea más frecuente que cada **10–14 minutos**; con eso basta para que Render no entre en modo sueño.
- Si usas la **Opción 1**, después de añadir el workflow haz **commit y push** a GitHub para que empiece a ejecutarse.
