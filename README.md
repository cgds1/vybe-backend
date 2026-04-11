# Vybe — Backend

REST API + WebSocket server para la aplicación Vybe: una plataforma social para conocer personas, hacer match, chatear en tiempo real y gestionar amistades.

Desarrollado con **NestJS**, **Prisma 7**, **PostgreSQL**, **Socket.io** y **Redis**.

---

## Requisitos del proyecto cubiertos

| Requisito | Estado | Detalle |
|---|---|---|
| Registro e inicio de sesión completo | ✅ | JWT con refresh tokens, verificación de email por OTP (6 dígitos), recuperación de contraseña |
| Imagen de perfil (CRUD) | ✅ | Upload a Cloudinary vía `POST /files/avatar`, actualiza `Profile.avatarUrl` |
| Aceptar o rechazar amistades (swipe) | ✅ | `POST /matches/swipe` con acción `LIKE` o `PASS`; match mutuo automático |
| Chat con WebSockets en tiempo real | ✅ | Socket.io con adapter Redis; eventos `send_message`, `new_message`, `user_typing` |
| Persistencia de mensajes y chats | ✅ | Modelos `Chat`, `Message`, `ChatParticipant` en PostgreSQL; paginación cursor-based |
| Imágenes en el chat | ✅ | `POST /files/chat/:chatId/image` sube a Cloudinary y crea un `Message` de tipo `IMAGE` |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | NestJS |
| ORM | Prisma 7 |
| Base de datos | PostgreSQL |
| WebSockets | Socket.io + Redis adapter (multi-instancia) |
| Caché / Pub-Sub | Redis |
| Almacenamiento de archivos | Cloudinary |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Email transaccional | Brevo (OTP, recuperación de contraseña) |
| Autenticación | JWT (access 15 min + refresh 30 días) |
| Despliegue | Railway |

---

## Módulos implementados

### Auth (`/auth`)
- `POST /auth/register` — Crear cuenta; envía código OTP de verificación por email
- `POST /auth/login` — Iniciar sesión (requiere email verificado)
- `POST /auth/logout` — Cerrar sesión; invalida el refresh token
- `POST /auth/refresh` — Renovar access token con refresh token
- `POST /auth/verify-email` — Verificar email con código OTP de 6 dígitos
- `POST /auth/resend-verification` — Reenviar código OTP de verificación
- `POST /auth/forgot-password` — Solicitar código OTP de recuperación
- `POST /auth/reset-password` — Cambiar contraseña con código OTP

### Users (`/users`)
- `GET /users/me` — Obtener usuario autenticado con perfil
- `PATCH /users/me` — Actualizar datos de cuenta (email)
- `PATCH /users/me/password` — Cambiar contraseña (requiere contraseña actual)
- `DELETE /users/me` — Eliminar cuenta
- `POST /users/profile` — Crear perfil (displayName, age, bio, interests)
- `PATCH /users/profile` — Actualizar perfil
- `GET /users/:id` — Ver perfil público de otro usuario

### Discovery (`/discovery`)
- `GET /discovery` — Feed de perfiles para deslizar; excluye usuarios ya evaluados y matches existentes

### Matches (`/matches`)
- `POST /matches/swipe` — Registrar swipe (`LIKE` o `PASS`); si ambos se dan LIKE se crea un Match automáticamente y se emite el evento `new_match` por WebSocket
- `GET /matches` — Listar matches del usuario autenticado
- `GET /matches/:id` — Obtener detalle de un match

### Friendships (`/friendships`)
- `POST /friendships/request` — Enviar solicitud de amistad
- `GET /friendships/pending` — Ver solicitudes pendientes recibidas
- `GET /friendships` — Listar amistades (filtrable por status: PENDING / ACCEPTED / BLOCKED)
- `PATCH /friendships/:id/accept` — Aceptar solicitud
- `PATCH /friendships/:id/block` — Bloquear relación
- `DELETE /friendships/:id` — Eliminar amistad o solicitud

### Chat (`/chat`)
- `POST /chat/matches/:matchId/open` — Abrir (o recuperar) el chat de un match; idempotente
- `GET /chat` — Listar chats del usuario con último mensaje
- `GET /chat/:chatId/messages` — Obtener mensajes con paginación cursor-based
- `POST /chat/:chatId/messages` — Enviar mensaje por REST (alternativa al WebSocket)

### Files (`/files`)
- `POST /files/avatar` — Subir imagen de perfil (`multipart/form-data`); actualiza `avatarUrl` del perfil
- `POST /files/chat/:chatId/image` — Subir imagen al chat; solo participantes; crea mensaje de tipo `IMAGE`

> Formatos aceptados: jpeg, jpg, png, webp. Tamaño máximo: 5 MB.

### Notifications (`/notifications`)
- `POST /notifications/token` — Registrar FCM device token del dispositivo
- `DELETE /notifications/token` — Eliminar token al hacer logout

### Health
- `GET /health` — Estado del servicio (base de datos + memoria)

---

## WebSocket Gateway

**Protocolo:** Socket.io  
**Autenticación:** JWT en el handshake (`auth.token` o `query.token`)

### Eventos que el cliente envía

| Evento | Payload | Descripción |
|---|---|---|
| `join_chat` | `{ chatId }` | Unirse a la sala de un chat |
| `leave_chat` | `{ chatId }` | Salir de la sala de un chat |
| `send_message` | `{ chatId, content, type? }` | Enviar mensaje (`type`: `TEXT` \| `IMAGE`) |
| `typing` | `{ chatId }` | Indicar que el usuario está escribiendo |
| `stop_typing` | `{ chatId }` | Indicar que el usuario dejó de escribir |

### Eventos que el servidor emite

| Evento | Destino | Payload | Descripción |
|---|---|---|---|
| `new_message` | Sala del chat | `{ id, chatId, senderId, content, type, createdAt }` | Nuevo mensaje en tiempo real |
| `chat_updated` | Sala personal del destinatario | `{ chatId, lastMessage, lastMessageAt }` | Actualiza la lista de chats sin estar dentro del chat |
| `new_match` | Sala personal de ambos usuarios | `{ matchId, userId, displayName, avatarUrl }` | Notifica un match mutuo |
| `user_typing` | Sala del chat (menos el emisor) | `{ chatId, userId }` | Indicador de escritura |
| `user_stop_typing` | Sala del chat (menos el emisor) | `{ chatId, userId }` | Indicador de escritura detenida |
| `error` | Socket emisor | `{ message }` | Error de acceso o validación |

### Salas

- `<chatId>` — Sala de un chat específico; se ingresa con `join_chat`
- `user:<userId>` — Sala personal de cada usuario; se ingresa automáticamente al conectar

---

## Push Notifications (FCM)

Al enviar un mensaje de chat el servidor envía al destinatario una notificación FCM con el siguiente payload:

```json
{
  "notification": {
    "title": "<nombre del remitente>",
    "body": "<preview del mensaje>"
  },
  "data": {
    "type": "new_message",
    "chatId": "<uuid>",
    "name": "<nombre del remitente>"
  }
}
```

El campo `data` permite al cliente móvil navegar directamente al chat al tocar la notificación.

---

## Configuración local

### Requisitos previos
- Node.js v20.19+ o v22.12+
- Docker y Docker Compose
- Cuenta en Cloudinary, Firebase y Brevo

### Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Base de datos
DATABASE_URL=postgresql://postgres:password@localhost:5432/vybe

# JWT
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret

# Redis
REDIS_URL=redis://localhost:6379

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Firebase (FCM)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Brevo (email)
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM_EMAIL=Vybe <noreply@yourdomain.com>

# App
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Levantar servicios con Docker

```bash
docker compose up -d
```

Levanta PostgreSQL en el puerto `5432` y Redis en el `6379`.

### Instalar dependencias y migrar la base de datos

```bash
npm install
npx prisma migrate deploy
npx prisma db seed   # opcional — crea usuarios de prueba
```

### Iniciar el servidor

```bash
# Desarrollo
npm run start:dev

# Producción
npm run build
npm run start:prod
```

### Documentación interactiva (Swagger)

Disponible en `http://localhost:3000/docs` (solo en `NODE_ENV !== production`).

---

## Despliegue

La aplicación está desplegada en **Railway** con deploy automático desde GitHub.

- El `Dockerfile` compila la aplicación y ejecuta `prisma migrate deploy` en el arranque.
- El puerto lo asigna Railway vía la variable `PORT`.
- `NODE_ENV=production` desactiva Swagger en producción.

---

## Estructura del proyecto

```
src/
├── auth/           # Autenticación JWT, OTP, recuperación de contraseña
├── users/          # Cuenta de usuario y perfil (CRUD)
├── discovery/      # Feed de perfiles para swipe
├── matches/        # Lógica de swipe y matches mutuos
├── friendships/    # Solicitudes y gestión de amistades
├── chat/           # Chats y mensajes (REST)
├── gateway/        # WebSocket gateway (Socket.io + Redis adapter)
├── files/          # Upload de imágenes (Cloudinary)
├── notifications/  # Push notifications (FCM)
├── mail/           # Email transaccional (Brevo)
├── health/         # Health check endpoint
├── prisma/         # PrismaService
└── common/         # Guards, filtros, decoradores globales
```

---

## Autores

- [Carlos Diaz](https://github.com/cgds1)
- [Alberto Martinez](https://github.com/betomartinez13)
