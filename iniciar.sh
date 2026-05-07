#!/bin/bash
# Script para iniciar Citycred Backend
# Uso: ./iniciar.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏛️  Citycred - Iniciando Sistema"
echo "=================================="
echo ""

# Verificar entorno virtual
if [ ! -d "venv" ]; then
    echo "📦 Creando entorno virtual..."
    python3 -m venv venv
fi

# Activar entorno virtual
source venv/bin/activate

# Instalar/actualizar dependencias
echo "📦 Verificando dependencias..."
pip install --no-user -q flask flask-cors 2>/dev/null

echo "✅ Dependencias listas"
echo ""

# Ir al directorio del backend
cd "$SCRIPT_DIR/backend"

echo "🚀 Iniciando servidor Flask..."
echo ""
echo "📍 URLs disponibles:"
echo "   http://127.0.0.1:8000/              → Simulador HTML"
echo "   http://127.0.0.1:8000/api/response  → API de respuestas"
echo "   http://127.0.0.1:8000/api/health    → Estado del servidor"
echo ""
echo "⏹️  Presiona Ctrl+C para detener"
echo ""

# Iniciar servidor
python3 app.py
