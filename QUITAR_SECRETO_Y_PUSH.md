# Quitar secreto del historial y hacer push

GitHub bloquea el push porque el commit **415a577** tiene una clave de OpenAI en `datos-base-de-dato-mongodb-atlas.txt`. Hay que quitar ese archivo del historial y volver a subir.

**Hazlo en PowerShell (fuera de Cursor, o con Cursor cerrando ese proyecto), en este orden:**

---

## 1. Cerrar Cursor (o al menos cerrar la carpeta del proyecto)

Así no se bloquean archivos en `.git` y el rebase puede terminar bien.

---

## 2. Abrir PowerShell y entrar al proyecto

```powershell
cd C:\DEV\ProyectoVinculo
```

---

## 3. Limpiar el rebase a medias

```powershell
git rebase --abort
```

Si sale error tipo "could not move back" o "rebase-merge":

```powershell
Remove-Item -Recurse -Force .git\rebase-merge
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue
```

---

## 4. Quitar el archivo de TODO el historial (borra la clave de los commits)

```powershell
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch datos-base-de-dato-mongodb-atlas.txt" --prune-empty -- 6b66a25^..HEAD
```

Eso reescribe los commits desde 6b66a25 hasta HEAD y elimina `datos-base-de-dato-mongodb-atlas.txt` del índice en todos ellos (el archivo deja de estar en el historial; la clave ya no se sube).

---

## 5. Subir la rama reescrita

```powershell
git push origin main --force
```

---

## 6. (Opcional) Evitar volver a subir ese archivo

Si quieres seguir teniendo el archivo solo en tu PC pero no en el repo:

```powershell
echo datos-base-de-dato-mongodb-atlas.txt >> .gitignore
git add .gitignore
git commit -m "No subir datos-base-de-dato-mongodb-atlas.txt (puede tener claves)"
git push origin main
```

---

## Si algo falla

- **"rebase in progress"**: repite el paso 3 (abort + borrar `.git/rebase-merge` si hace falta).
- **"Updates were rejected"**: asegúrate de usar `git push origin main --force` en el paso 5.
- **Sigue detectando secreto**: el `filter-branch` tiene que aplicarse sobre el rango correcto; si tu rama tiene otros commits, puede que haya que usar otro commit base en el paso 4 (en ese caso, dime qué ves en `git log --oneline -10`).
