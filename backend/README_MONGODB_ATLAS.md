# Configuración MongoDB Atlas

## Pasos para configurar MongoDB Atlas

### 1. Obtener la cadena de conexión de MongoDB Atlas

1. Inicia sesión en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Selecciona tu cluster
3. Haz clic en "Connect"
4. Selecciona "Connect your application"
5. Copia la cadena de conexión (Connection String)
   - Formato: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority`

### 2. Configurar el archivo .env

El archivo `.env` ya está creado con tus credenciales. Solo necesitas completar el nombre del cluster:

1. Abre el archivo `backend/.env`
2. Reemplaza `<CLUSTER>` con el nombre de tu cluster de MongoDB Atlas
   - Ejemplo: Si tu cluster es `cluster0.abc123.mongodb.net`, la línea debería quedar:
   ```env
   MONGODB_URI=mongodb+srv://ag_db_user:r8d8n60M8ucOeEzw@cluster0.abc123.mongodb.net/vinculosDB?retryWrites=true&w=majority
   ```

   **Dónde encontrar el nombre del cluster:**
   - En MongoDB Atlas, ve a tu cluster
   - Haz clic en "Connect"
   - Selecciona "Connect your application"
   - En la cadena de conexión verás algo como: `mongodb+srv://ag_db_user:<password>@cluster0.xxxxx.mongodb.net/...`
   - Copia la parte `cluster0.xxxxx.mongodb.net` y reemplázala en el archivo `.env`

### 3. Configurar acceso de red en MongoDB Atlas

1. En MongoDB Atlas, ve a "Network Access"
2. Agrega la IP `0.0.0.0/0` para permitir acceso desde cualquier IP (solo para desarrollo)
   - Para producción, agrega solo las IPs específicas de tu servidor

### 4. Verificar la conexión

1. Inicia el servidor:
   ```bash
   npm start
   ```

2. Deberías ver en la consola:
   ```
   ✅ Conexión a MongoDB exitosa
   📊 Estado de conexión: Conectado
   🗄️  Base de datos: vinculosDB
   🌐 Host: tu-cluster.mongodb.net
   ```

### 5. Migrar datos existentes (opcional)

Si tienes datos en MongoDB local y quieres migrarlos a Atlas:

```bash
# Exportar desde MongoDB local
mongoexport --uri="mongodb://127.0.0.1:27017/vinculosDB" --collection=contactos --out=contactos.json

# Importar a MongoDB Atlas
mongoimport --uri="mongodb+srv://usuario:password@cluster.mongodb.net/vinculosDB" --collection=contactos --file=contactos.json
```

## Variables de entorno disponibles

- `MONGODB_URI`: Cadena de conexión completa de MongoDB Atlas
- `PORT`: Puerto del servidor (por defecto: 3000)
- `HOST`: Host del servidor (por defecto: 0.0.0.0)

## Notas de seguridad

⚠️ **NUNCA** subas el archivo `.env` a Git. Está incluido en `.gitignore` por seguridad.
