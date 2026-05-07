# 🏛️ Citycred - Sistema Completo

Sistema de simulación de créditos para Fuerzas Armadas y de Seguridad con backend inteligente.

## 📁 Estructura del Proyecto

```
citycred_app_pro/
├── backend/
│   └── app.py                 # Servidor Flask con API
├── frontend/
│   └── simulador.html         # Simulador HTML completo
├── static/
│   └── js/
│       └── conexion_backend_citycred.js  # Conexión JS
├── data/                      # Datos (Word, Excel)
├── venv/                      # Entorno virtual Python
├── requirements.txt           # Dependencias
└── iniciar.sh                 # Script de inicio
```

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor

```bash
cd citycred_app_pro
./iniciar.sh
```

El servidor se iniciará en: **http://127.0.0.1:8001**

### 2. Abrir el Simulador

Abre tu navegador y ve a:
```
http://127.0.0.1:8001/
```

## 📡 API Endpoints

### Health Check
```bash
GET http://127.0.0.1:8001/api/health
```

### Obtener Fuerzas
```bash
GET http://127.0.0.1:8001/api/fuerzas
```

### Generar Respuesta (Principal)
```bash
POST http://127.0.0.1:8001/api/response
Content-Type: application/json

{
  "historial": "texto completo del chat",
  "ultimo_mensaje": "último mensaje del cliente",
  "fuerza": "Ejército|Armada|etc",
  "tipo": "voluntario|carrera"
}
```

**Respuesta:**
```json
{
  "respuesta": "texto sugerido",
  "intencion": "inicio|desconfianza|cupo|etc",
  "guia": "guía interna para el vendedor",
  "fuerza_detectada": "Ejército",
  "tipo_detectado": "voluntario",
  "timestamp": "2026-05-06T..."
}
```

## 🧠 Lógica del Cerebro Local

### Intenciones Detectadas

1. **inicio** - "hola", "info", "buenas"
2. **desconfianza** - "estafa", "seguro", "no confío"
3. **explicar_cupo** - "qué es el cupo"
4. **guia_cupo** - "cómo saco el cupo"
5. **documentacion** - "dni", "recibo", "cbu"
6. **avanzar** - "quiero avanzar", "me interesa"
7. **cupo** - mención general de cupo
8. **tipo** - "voluntario", "carrera"

### Flujo de Decisiones

```
1. Detectar intención del cliente
2. Si existe regla propia → usar regla propia
3. Si no existe → usar fallback seguro
4. Generar respuesta + guía interna
```

### Reglas Importantes

- ✅ Si dice "hola" → saludo + info + preguntar fuerza
- ✅ Si detecta desconfianza → dar seguridad (AMFAYS, oficinas)
- ✅ Si detecta fuerza → SIEMPRE preguntar voluntario/carrera
- ✅ Si tiene cupo → NO volver a pedirlo
- ✅ Si falta tipo → preguntar SOLO eso

## 🎯 Funcionalidades

### Simulador HTML (Conservado)
- ✅ Buscador de cuotas con grillas reales
- ✅ Filtros por fuerza, tipo, plazo
- ✅ Visualización de resultados
- ✅ Texto para copiar (Simple/WhatsApp)
- ✅ Historial de conversación

### Backend Nuevo
- ✅ API REST con Flask
- ✅ Detección de intenciones
- ✅ Respuestas por fuerza
- ✅ Guías internas para vendedores
- ✅ Fallback cuando backend no disponible

### Conexión Frontend-Backend
- ✅ Botón "Sugerir respuesta" conectado
- ✅ Envío automático de contexto
- ✅ Respuesta en tiempo real
- ✅ Modo offline (fallback local)

## 🔧 Configuración

### Puerto del Servidor
Editar `backend/app.py`:
```python
app.run(host="127.0.0.1", port=8001, ...)
```

### Puerto del Frontend
Editar `static/js/conexion_backend_citycred.js`:
```javascript
const API_BASE = 'http://127.0.0.1:8001';
```

## 📦 Dependencias

```
flask>=3.0.0
flask-cors>=4.0.0
```

Instalar manualmente:
```bash
pip install flask flask-cors
```

## 🔄 Flujo de Trabajo

1. **Cliente envía mensaje** → Se pega en el chat
2. **Presiona "Sugerir respuesta"** → JS envía datos al backend
3. **Backend analiza** → Detecta intención, fuerza, tipo
4. **Backend responde** → Genera respuesta + guía
5. **Frontend muestra** → Respuesta en campo correspondiente

## 🛡️ Fallback (Modo Offline)

Si el backend no está disponible, el sistema usa:
- Respuestas locales básicas
- Biblioteca mínima integrada
- Notificación de "modo offline"

## 🚀 Próximos Pasos (Futuro)

- [ ] Lectura de Word (base_respuestas.docx)
- [ ] Lectura de Excel (cuotas.xlsx)
- [ ] Memoria de conversación persistente
- [ ] Conexión con IA real (OpenAI, etc.)
- [ ] Conexión con WhatsApp API
- [ ] Automatización completa

## 🆘 Solución de Problemas

### Error: "No module named 'flask'"
```bash
pip install flask flask-cors
```

### Error: "Address already in use"
Cambiar puerto en `backend/app.py`

### Error: "Backend no disponible"
Verificar que el servidor esté corriendo:
```bash
curl http://127.0.0.1:8001/api/health
```

## 📄 Licencia

Sistema propietario Citycred - Uso interno

---

**Desarrollado para:** Citycred  
**Tecnología:** Flask + HTML/JS  
**Versión:** 1.0.0
