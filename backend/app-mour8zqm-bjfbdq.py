#!/usr/bin/env python3
"""
Citycred Backend Pro - Cerebro Local Inteligente v2.0
Sistema avanzado de detección de intenciones y respuestas contextuales
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import re
import json
import unicodedata
import subprocess
from datetime import datetime

app = Flask(__name__, static_folder="frontend", template_folder="frontend")
CORS(app)

# =====================================================
# CONFIGURACIÓN
# =====================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
WORD_PATH = os.path.join(DATA_DIR, "base_respuestas.docx")

# =====================================================
# BIBLIOTECA DE RESPUESTAS
# =====================================================

BIBLIOTECA = {
    "General": {
        "saludo": "¡Hola! Soy Santiago Para avanzar solo necesito:\n• Nombre completo\n• DNI\n• Dónde trabajas\n\n*lo que necesito saber es y tu cupo de afectación, es decir tu disponible a afectar (decreto 14/12), y ya te buscamos montos máximos*",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n📩 El legajo te llega a tu mail para que puedas firmar digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas\n📌 Si sos Tropa Voluntaria: hasta $2.000.000 en 24 cuotas",
        "seguimiento": "🔍 Para avanzar, solo necesito que me digas tu monto de afectación disponible para Decreto 14/12 (lo ves desde tu portal, el mismo del cual descargas tu recibido haberes).",
        "cupo": "El *cupo de afectación* es el monto que tenés disponible en tu recibo para sacar un préstamo.\nEs lo que tu fuerza te permite usar para que se te descuente la cuota directamente por haberes 💰",
        "docs": "Documentación a enviar una vez aceptado el crédito:\n\n1️⃣ Último recibo de sueldo\n2️⃣ Foto del DNI (frente y dorso)\n3️⃣ Cupo de afectación (autorizado con el monto disponible de deducción por AMFAYS)\n4️⃣ Correo electrónico (ahí te voy a enviar el link)\n5️⃣ CBU del Banco Nación (donde se realiza el depósito)",
        "avanzar": "Para avanzar con tu crédito tenés que *autorizar el cupo de afectación (Decreto 1412)*, ya que eso permite el descuento mes a mes.\n\nPedilo como:\n*AMFAYS -- Código 400-571 -- Asociación Mutual de Fuerzas Armadas de Seguridad*.\n\nCuando lo autorices, mandanos la captura y te paso los montos máximos para avanzar. 💪",
        "guia_cupo": "Pedir cupo de afectación por Decreto 14/12.",
        "explicar_cupo": "El *cupo de afectación* es el monto que tenés disponible en tu recibo para sacar un préstamo.\nEs lo que tu fuerza te permite usar para que se te descuente la cuota directamente por haberes 💰",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS y tenemos oficinas en Río Negro y Bahía Blanca.\n\n💰 Créditos por Decreto 14/12 -- 100% Online\n\n✅ Trámite 100% online con firma digital\n📩 El legajo te llega a tu mail para que puedas firmar digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas\n📌 Si sos Tropa Voluntaria: hasta $2.000.000 en 24 cuotas",
        "tabla_cuotas": "$943.500 → 9 cuotas de $199.987\n$1.140.000 → 12 cuotas de $199.958\n$1.296.750 → 15 cuotas de $199.947\n$1.422.000 → 18 cuotas de $199.974\n$1.601.250 → 24 cuotas de $199.967\n$1.715.250 → 30 cuotas de $199.962",
    },
    "Ejército": {
        "saludo": "¡Hola! Soy Santiago Para avanzar solo necesito:\n• Nombre completo\n• DNI\n• Dónde trabajas\n\n*lo que necesito saber es y tu cupo de afectación, es decir tu disponible a afectar (decreto 14/12), y ya te buscamos montos máximos*",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n📩 El legajo te llega a tu mail para que puedas firmar digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas\n📌 Si sos Tropa Voluntaria: hasta $2.000.000 en 24 cuotas",
        "seguimiento": "Decime si sos tropa voluntaria o de carrera, y si ya tenés tu disponible a afectar por Decreto 14/12.",
        "cupo": "El cupo se ve en Haberes 2.0 → Préstamos → Nuevas solicitudes. Pedilo con AMFAYS Código 400571.",
        "docs": "Para avanzar con Ejército necesito:\n• Último recibo\n• DNI frente y dorso\n• Cupo autorizado con AMFAYS Código 400571\n• Mail\n• CBU Banco Nación",
        "avanzar": "Para decirte el monto exacto que podés sacar necesito tu *disponible de afectación*.\nSe genera en la web del Ejército o lo pedís en tu unidad --- tarda 2 minutos.\nSi querés te explico paso a paso cómo sacarlo. ¿Estás con el celu ahora?",
        "guia_cupo": 'Para sacar tu *cupo de afectación* seguí estos pasos:\n\n1️⃣ Ingresa a tu página de *Haberes 2.0* (la misma donde descargas el recibo de sueldo).\n2️⃣ Anda al cuadradito que dice *"Préstamos"*.\n3️⃣ Arriba a la derecha vas a ver en verde *"Nuevas solicitudes de préstamos"*. Hace clic ahí.\n4️⃣ Se te va a abrir una ventanita → hace una *captura de pantalla* y enviármela.\n\nCon eso vamos a poder ver tu cupo de afectación ✅',
        "explicar_cupo": "El *cupo de afectación* es el monto que tenés disponible en tu recibo para sacar un préstamo.\nEs lo que tu fuerza te permite usar para que se te descuente la cuota directamente por haberes 💰",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS (Asociación Mutual de las Fuerzas Armadas y de Seguridad). Tenemos oficinas en Río Negro y Bahía Blanca.\n\nEn Ejército trabajamos con muchos camaradas, el trámite es 100% online con firma digital por Decreto 14/12.\n\n¿Sos tropa voluntaria o de carrera?",
        "tropa_voluntaria": "Si sos Tropa Voluntaria: hasta $2.000.000 en 24 cuotas.\n\nPara avanzar necesitamos tu cupo de afectación. Lo generás en Haberes 2.0 con el código 400571 AMFAYS.",
    },
    "Armada": {
        "saludo": "¡Hola! Soy Santiago Para avanzar solo necesito:\n• Nombre completo\n• DNI\n• Dónde trabajas",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas",
        "seguimiento": "Para avanzar, solo necesito que me digas tu monto de afectación disponible para Decreto 14/12 (lo ves desde tu portal, el mismo del cual descargas tu recibido haberes).",
        "cupo": "En tu web donde descargas el recibo vas a donde dice MONTO DE AFECTACIÓN y ahí te dice o me mandas captura. Con ese dato, te armo planes personalizados.",
        "docs": "Para Armada necesito:\n• Último recibo\n• DNI frente y dorso\n• Cupo/monto de afectación\n• Mail\n• CBU Banco Nación",
        "avanzar": "Perfecto 😊 En tu web donde descargas el recibo vas a donde dice MONTO DE AFECTACIÓN y ahí te dice o me mandas captura. Con ese dato te armo planes personalizados.",
        "guia_cupo": "Para avanzar, solo necesito que me digas tu monto de afectación disponible para Decreto 14/12 (lo ves desde tu portal, el mismo del cual descargas tu recibido haberes).\n\nEn tu web donde descargas el recibo vas a donde dice MONTO DE AFECTACIÓN y ahí te dice o me mandas captura.\n\nCon ese dato, te armo planes personalizados.",
        "explicar_cupo": "El *cupo de afectación* es el monto que tenés disponible en tu recibo para sacar un préstamo.\nEs lo que tu fuerza te permite usar para que se te descuente la cuota directamente por haberes 💰",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS. Tenemos oficinas en Río Negro y Bahía Blanca.\n\nEn Armada ya trabajamos con muchos compañeros, el trámite es por Decreto 14/12 con descuento directo por haberes.\n\n¿Ya viste tu monto de afectación?",
    },
    "Fuerza Aérea": {
        "saludo": "¡Hola! Soy Santiago Para avanzar solo necesito:\n• Nombre completo\n• DNI\n• Dónde trabajas",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas",
        "seguimiento": "Decime si ya tenés tu cupo/disponible o si querés que te diga cómo pedirlo.",
        "cupo": 'El cupo se solicita en Contaduría --- o en la opción "Disponible".\n\nCuando lo obtenga y decida avanzar, debe llevarlo a Personal (militar o civil) para tramitar la situación de revista.\n\nCon la situación de revista en mano, se le entrega el código y el nombre de la empresa: AMFAYS --- CÓDIGO 400571. Luego lo lleva a Contaduría para su aprobación.\n\nCuando Contaduría entregue el papel aprobado, debe llevarlo al Banco Nacional para certificarlo.',
        "docs": "Para Fuerza Aérea necesito:\n• Último recibo\n• DNI frente y dorso\n• Cupo/disponible aprobado\n• Mail\n• CBU Banco Nación",
        "avanzar": "Perfecto 😊 Pedí el cupo en Contaduría/Administración y mandame recibo, DNI, mail y CBU.",
        "guia_cupo": 'El cupo se solicita en Contaduría --- o en la opción "Disponible".\n\nCuando lo obtenga y decida avanzar, debe llevarlo a Personal (militar o civil) para tramitar la situación de revista.\n\nCon la situación de revista en mano, se le entrega el código y el nombre de la empresa: AMFAYS --- CÓDIGO 400571.',
        "explicar_cupo": "El cupo es el disponible para deducción que te habilitan para que la cuota se descuente por Decreto 14/12.\n\nEn Fuerza Aérea se solicita en Contaduría o Administración.",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS. Tenemos oficinas en Río Negro y Bahía Blanca.\n\nEn Fuerza Aérea ya trabajamos con muchos compañeros, el trámite es por Decreto 14/12.\n\n¿Ya tenés tu cupo o querés que te diga cómo pedirlo?",
    },
    "Gendarmería": {
        "saludo": "¡Hola! Soy Santiago Para avanzar solo necesito:\n• Nombre completo\n• DNI\n• Dónde trabajas",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas",
        "seguimiento": "Decime si ya tenés tu cupo de afectación o si querés que te diga cómo pedirlo en UTAC/Administración.",
        "cupo": "Para poder tramitar tu crédito necesitamos que pidas tu cupo de afectación (Decreto 1412).\n\nDecime tu monto de afectación disponible para poder asesorarte y armarte planes máximos, lo averiguas en administración en tu trabajo en UTAC.\n\nPodes hacerlo de dos maneras 👇\n\n📧 Opción 1 -- Por correo:\nPedirlo por mail a la UTAC (Unidad Técnica de Asistencia Crediticia) solicitando tu cupo de afectación actualizado e indicando que el préstamo es con la empresa AMFAYS -- Código 400571.\n\n🏢 Opción 2 -- Presencial:\nPodes pedirlo directamente en RRHH o en Administración de tu unidad, mencionando que necesitás el cupo para préstamo por Decreto 1412, también con el código 400571 -- AMFAYS.",
        "docs": "Para Gendarmería necesito:\n• Último recibo\n• DNI frente y dorso\n• Cupo de afectación\n• Mail\n• CBU Banco Nación",
        "avanzar": "Perfecto\n\nNecesitamos que ya vayas solicitando el certificado de haberes en administración en UTAC porque puede que te demore.\n\nMi empresa es: Asociación Mutual de las Fuerzas Armadas y de Seguridad, código 400571.\n\nLuego la documentación es mínima, lo más importante es vayas solicitando ese certificado y ya mandamos el mail a ver si calificas.",
        "guia_cupo": "Lo averiguas en tu trabajo en administración en UTAC.\n\n📧 Por correo: SAFD-DESTMOV1@gendarmeria.gob.ar\n📧 Mail 2: ESC44-SAFD@gendarmeria.gob.ar\n\n🏢 Presencial: RRHH o Administración de tu unidad\n\nIndicar: préstamo por Decreto 1412, código AMFAYS 400571.",
        "explicar_cupo": "El cupo de afectación es el monto disponible que te autoriza la fuerza para descontar la cuota directamente por decreto.\n\nEn Gendarmería se pide en UTAC o RRHH/Administración.",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS. Tenemos oficinas en Río Negro y Bahía Blanca.\n\nEn Gendarmería ya trabajamos con muchos compañeros, el trámite es por Decreto 14/12.\n\n¿Ya tenés tu cupo o querés que te diga cómo pedirlo?",
    },
    "Prefectura": {
        "saludo": "👋 ¿Cómo estás? Mira las opciones que te puedo ofrecer por Decreto 14/12 💸 Todas con la misma cuota fija y descuento directo por haberes 👇\n\nTu cupo de afectación para verlo lo tienen en su recibo de haberes, aparece como MONTO DISPONIBLE DE DEDUCCIÓN.",
        "info": "💰 Créditos por Decreto 14/12 -- 100% Online\n\n¡Hola! Trabajo con la empresa AMFAYS, otorgamos créditos con descuento directo por boleta (Decreto 14/12).\n\n✅ Trámite 100% online con firma digital\n💸 Sin gastos administrativos ni de sellados: recibís el monto solicitado.\n📌 Hasta $7.000.000 en 36 cuotas",
        "seguimiento": "Decime si ya viste en tu recibo el monto disponible de deducción o si querés que te guíe.",
        "cupo": "Tu cupo de afectación para verlo lo tienen en su recibo de haberes, aparece como MONTO DISPONIBLE DE DEDUCCIÓN.",
        "docs": "Para Prefectura necesito:\n• Último recibo\n• DNI frente y dorso\n• Monto disponible de deducción/cupo\n• Mail\n• CBU Banco Nación",
        "avanzar": "Caso de querer avanzar me decís y te digo cómo proseguimos.\n\nEn 1 instancia necesita apellido y nombre completo para enviar el mail de calificación.\n\nTambién que plan elegís.\n\nY lo más importante es vayas solicitando el certificado de afectación en tu trabajo porque puede que te demore un poquito.\n\nLa empresa es Asociación Mutual de las Fuerzas Armadas y de Seguridad, código 400571.",
        "guia_cupo": "Tu cupo de afectación para verlo lo tienen en su recibo de haberes, aparece como MONTO DISPONIBLE DE DEDUCCIÓN.\n\nPrefectura tiene un código interno que es de ellos, pero igual lo tiene que pedir con el CÓDIGO 400571 o ASOCIACIÓN MUTUAL DE LAS FUERZAS ARMADAS Y DE SEGURIDAD.",
        "explicar_cupo": "El monto disponible de deducción es el cupo que tenés habilitado para que la cuota se descuente por Decreto 14/12.\n\nEn Prefectura figura directamente en tu recibo de haberes.",
        "confianza": "Te entiendo 👍\n\nSomos Citycred, trabajamos con AMFAYS. Tenemos oficinas en Río Negro y Bahía Blanca.\n\nEn Prefectura ya trabajamos con muchos compañeros, el trámite es por Decreto 14/12.\n\n¿Ya viste tu monto disponible de deducción?",
    },
}

# =====================================================
# MOTOR DE ANÁLISIS
# =====================================================


def normalizar_texto(texto):
    """Normaliza texto para análisis"""
    if not texto:
        return ""
    texto = texto.lower()
    texto = unicodedata.normalize("NFD", texto)
    texto = texto.encode("ascii", "ignore").decode("utf-8")
    texto = re.sub(r"[^\w\s]", " ", texto)
    return texto.strip()


def detectar_fuerza(texto):
    """Detecta la fuerza mencionada"""
    texto_norm = normalizar_texto(texto)

    fuerzas = {
        "Ejército": ["ejercito", "ejercitos", "arma de tierra"],
        "Armada": ["armada", "marina", "naval"],
        "Fuerza Aérea": ["fuerza aerea", "fuerza aérea", "faa", "aerea"],
        "Gendarmería": ["gendarmeria", "gendarmería", "gna"],
        "Prefectura": ["prefectura", "prefectura naval", "pna"],
    }

    for fuerza, palabras in fuerzas.items():
        for palabra in palabras:
            if palabra in texto_norm:
                return fuerza
    return "General"


def detectar_tipo(texto):
    """Detecta si es voluntario o carrera"""
    texto_norm = normalizar_texto(texto)

    if any(p in texto_norm for p in ["voluntario", "voluntaria", "tropa voluntaria"]):
        return "voluntario"
    elif any(p in texto_norm for p in ["carrera", "cuadro permanente", "oficial"]):
        return "carrera"
    return None


def detectar_intencion(texto, contexto=None):
    """Detecta intención con análisis avanzado"""
    texto_norm = normalizar_texto(texto)

    # Patrones de intenciones
    patrones = {
        "inicio": {
            "peso": 10,
            "palabras": [
                "hola",
                "buenas",
                "buen dia",
                "info",
                "informacion",
                "quiero saber",
            ],
            "frases": [
                "quiero info",
                "me pasas info",
                "tienen info",
                "me interesa saber",
            ],
        },
        "desconfianza": {
            "peso": 20,
            "palabras": [
                "estafa",
                "seguro",
                "reales",
                "confio",
                "confianza",
                "miedo",
                "dudas",
            ],
            "frases": [
                "no confio",
                "me da miedo",
                "tengo dudas",
                "es seguro esto",
                "son reales",
            ],
        },
        "explicar_cupo": {
            "peso": 15,
            "palabras": ["cupo", "afectacion", "disponible"],
            "frases": [
                "que es el cupo",
                "que es cupo",
                "explicame cupo",
                "para que sirve el cupo",
            ],
        },
        "guia_cupo": {
            "peso": 15,
            "palabras": ["sacar", "obtener", "ver", "consultar", "pedir"],
            "frases": ["como saco", "donde saco", "como veo", "guiame", "paso a paso"],
        },
        "documentacion": {
            "peso": 12,
            "palabras": ["documento", "dni", "recibo", "cbu", "mail", "papeles"],
            "frases": ["que necesito", "que documentos", "que papeles", "requisitos"],
        },
        "avanzar": {
            "peso": 14,
            "palabras": ["avanzar", "seguir", "continuar", "hacerlo", "empezar"],
            "frases": [
                "quiero avanzar",
                "seguimos",
                "me interesa",
                "quiero hacerlo",
                "empecemos",
            ],
        },
        "cupo_monto": {
            "peso": 13,
            "palabras": ["cupo", "disponible", "afectacion", "monto", "tengo"],
            "frases": ["mi cupo es", "tengo cupo", "mi disponible", "tengo disponible"],
        },
        "tipo_personal": {
            "peso": 11,
            "palabras": ["voluntario", "voluntaria", "carrera", "tropa", "oficial"],
            "frases": [
                "soy voluntario",
                "soy de carrera",
                "soy tropa",
                "cuadro permanente",
            ],
        },
        "rechazo": {
            "peso": 18,
            "palabras": ["no", "nunca", "imposible", "olvido", "cancelar", "parar"],
            "frases": [
                "no me interesa",
                "no quiero",
                "olvido",
                "cancela todo",
                "no sigas",
            ],
        },
        "precio_cuota": {
            "peso": 12,
            "palabras": ["cuanto", "precio", "valor", "monto", "cuota", "tasa"],
            "frases": [
                "cuanto sale",
                "cuanto cuesta",
                "que valor tiene",
                "cuanto es la cuota",
            ],
        },
        "tiempo_acreditacion": {
            "peso": 11,
            "palabras": ["tiempo", "demora", "cuando", "cuanto tarda", "plazo"],
            "frases": [
                "cuanto tarda",
                "cuando me dan",
                "en cuanto tiempo",
                "para cuando",
            ],
        },
    }

    puntuaciones = {}

    for intencion, patron in patrones.items():
        score = 0

        # Puntuación por palabras clave
        for palabra in patron["palabras"]:
            if palabra in texto_norm:
                score += 2

        # Puntuación por frases completas
        for frase in patron["frases"]:
            if frase in texto_norm:
                score += 5

        # Multiplicar por peso
        score *= patron["peso"]
        puntuaciones[intencion] = score

    # Contexto adicional
    if contexto:
        if contexto.get("fuerza") and contexto.get("tipo") and "cupo" in texto_norm:
            puntuaciones["cupo_monto"] = puntuaciones.get("cupo_monto", 0) + 50
        if contexto.get("es_primera", False):
            puntuaciones["inicio"] = puntuaciones.get("inicio", 0) + 30

    # Encontrar mejor intención
    if puntuaciones:
        mejor_intencion = max(puntuaciones.items(), key=lambda x: x[1])[0]
        mejor_score = puntuaciones[mejor_intencion]

        if mejor_score < 20:
            return "general", 0.3

        probabilidad = min(mejor_score / 100, 1.0)
        return mejor_intencion, probabilidad

    return "general", 0.0


def extraer_monto(texto):
    """Extrae montos del texto"""
    if not texto:
        return None

    patrones = [
        r"(\d{1,3}(?:\.\d{3})+(?:,\d+)?)",
        r"(\d{5,8})",
        r"(\d{2,3})\s*(?:mil|k)\b",
    ]

    for patron in patrones:
        match = re.search(patron, texto.replace(".", "").replace(",", ""))
        if match:
            return match.group(1)
    return None


def analizar_contexto(historial, ultimo_mensaje):
    """Analiza el contexto completo de la conversación"""
    contexto = {
        "es_primera": not historial or len(historial.strip()) < 20,
        "fuerza": None,
        "tipo": None,
        "tiene_cupo": False,
        "monto_cupo": None,
        "etapa": "inicio",
        "interacciones": 0,
        "texto_total": (historial or "") + " " + (ultimo_mensaje or ""),
    }

    if historial:
        lineas = [l for l in historial.split("\n") if l.strip()]
        contexto["interacciones"] = len(lineas)
        contexto["fuerza"] = detectar_fuerza(historial)
        contexto["tipo"] = detectar_tipo(historial)

        texto_total = historial + " " + ultimo_mensaje
        if any(
            p in normalizar_texto(texto_total)
            for p in ["cupo", "disponible", "afectacion"]
        ):
            contexto["tiene_cupo"] = True
            contexto["monto_cupo"] = extraer_monto(texto_total)

        if contexto["interacciones"] > 5:
            if contexto["tiene_cupo"]:
                contexto["etapa"] = "documentacion"
            else:
                contexto["etapa"] = "cupo"
        elif contexto["interacciones"] > 2:
            contexto["etapa"] = "presentacion"

    return contexto


def buscar_respuesta_word(texto):
    """Busca una respuesta aproximada en base_respuestas.docx."""
    if not texto or not os.path.exists(WORD_PATH):
        return None

    try:
        md = subprocess.check_output(
            ["pandoc", WORD_PATH, "-t", "plain"], text=True, stderr=subprocess.DEVNULL
        )
    except Exception:
        return None

    texto_norm = normalizar_texto(texto)
    md_norm = normalizar_texto(md)

    # Coincidencias básicas por intención / palabras frecuentes
    reglas = [
        (["que es el cupo", "que es cupo", "no entiendo cupo"], "cupo de afectacion"),
        (["como saco", "donde saco", "guiame"], "como se pide el cupo"),
        (["documentacion", "dni", "recibo", "cbu"], "documentacion a enviar"),
        (["cuota", "precio", "cuanto"], "$943.500"),
    ]

    for disparadores, marcador in reglas:
        if any(d in texto_norm for d in disparadores) and marcador in md_norm:
            # devolver párrafo cercano
            idx = md_norm.find(marcador)
            raw_idx = idx
            if raw_idx < 0:
                continue
            ini = max(0, raw_idx - 260)
            fin = min(len(md), raw_idx + 420)
            resp = md[ini:fin].strip()
            return resp if len(resp) > 30 else None

    return None


# =====================================================
# GENERADOR DE RESPUESTAS
# =====================================================


def generar_respuesta(
    historial, ultimo_mensaje, fuerza_seleccionada="General", tipo_seleccionado=None
):
    """Genera respuesta completa con análisis avanzado"""

    # Analizar contexto
    contexto = analizar_contexto(historial, ultimo_mensaje)

    # Detectar intención
    intencion, confianza = detectar_intencion(ultimo_mensaje, contexto)

    # Detectar fuerza
    fuerza_ultimo = detectar_fuerza(ultimo_mensaje)
    fuerza_contexto = contexto.get("fuerza") or "General"
    if fuerza_ultimo != "General":
        fuerza_detectada = fuerza_ultimo
    elif fuerza_contexto != "General":
        fuerza_detectada = fuerza_contexto
    elif fuerza_seleccionada:
        fuerza_detectada = fuerza_seleccionada
    else:
        fuerza_detectada = "General"

    # Detectar tipo
    tipo_detectado = (
        detectar_tipo(ultimo_mensaje) or contexto["tipo"] or tipo_seleccionado
    )

    # Obtener datos de la fuerza
    data = BIBLIOTECA.get(fuerza_detectada, BIBLIOTECA["General"])

    # Generar respuesta según intención
    respuesta = construir_respuesta(
        intencion,
        data,
        fuerza_detectada,
        tipo_detectado,
        contexto,
        confianza,
        ultimo_mensaje,
    )

    # Generar guía
    guia = generar_guia(
        intencion, fuerza_detectada, tipo_detectado, contexto, confianza
    )

    # Generar análisis
    analisis = {
        "intencion_principal": intencion,
        "confianza": round(confianza, 2),
        "fuerza": fuerza_detectada,
        "tipo": tipo_detectado,
        "etapa_conversacion": contexto["etapa"],
        "interacciones": contexto["interacciones"],
        "tiene_cupo": contexto["tiene_cupo"],
        "monto_detectado": contexto["monto_cupo"],
        "recomendacion": generar_recomendacion(intencion, contexto),
    }

    return {
        "respuesta": respuesta,
        "intencion": intencion,
        "confianza": round(confianza, 2),
        "guia": guia,
        "analisis": analisis,
        "fuerza_detectada": fuerza_detectada,
        "tipo_detectado": tipo_detectado,
        "contexto": {
            "etapa": contexto["etapa"],
            "interacciones": contexto["interacciones"],
            "tiene_cupo": contexto["tiene_cupo"],
            "monto_cupo": contexto["monto_cupo"],
        },
        "timestamp": datetime.now().isoformat(),
    }


def construir_respuesta(
    intencion, data, fuerza, tipo, contexto, confianza, ultimo_mensaje
):
    """Construye respuesta personalizada"""

    # 1) REGLAS PROPIAS CRÍTICAS (prioridad máxima)
    if intencion == "inicio":
        resp = "Hola 👋 trabajamos con créditos por Decreto 14/12 con descuento por haberes. ¿De qué fuerza sos?"
    elif intencion == "desconfianza":
        resp = "Te entiendo 👍 Somos Citycred, trabajamos con AMFAYS y tenemos oficinas en Río Negro y Bahía Blanca."
    elif intencion == "tipo_personal":
        resp = f"Perfecto 😊 Para avanzar necesito tu cupo de afectación.\n\n{data['cupo']}"
    elif confianza < 0.4:
        resp = respuesta_general(data, fuerza, tipo, contexto)
    elif intencion == "desconfianza":
        resp = data["confianza"]
    elif intencion == "explicar_cupo":
        resp = data["explicar_cupo"]
    elif intencion == "guia_cupo":
        if fuerza != "General":
            resp = f"No pasa nada 😊 te guío.\n\n{data['guia_cupo']}\n\n¿Tenés el dato a mano o querés que te explique paso a paso?"
        else:
            resp = f"No pasa nada 😊\n\nPrimero decime de qué fuerza sos y te explico cómo sacar tu cupo de afectación."
    elif intencion == "documentacion":
        resp = data["docs"]
    elif intencion == "avanzar":
        resp = data["avanzar"]
    elif intencion == "cupo_monto":
        monto = contexto.get("monto_cupo", "")
        if monto or contexto["tiene_cupo"]:
            data_general = BIBLIOTECA.get("General", {})
            tabla = data_general.get("tabla_cuotas", "")
            resp = f"Perfecto 😊 Con tu cupo ya puedo buscarte opciones.\n\n{tabla}\n\n¿Querés que avancemos con alguno de estos planes?"
        else:
            resp = f"Para decirte bien qué monto y cuota te corresponde, primero necesito tu cupo de afectación / disponible por Decreto 14/12.\n\n{data['cupo']}\n\n¿Lo tenés a mano o querés que te guíe para verlo?"
    elif intencion == "tipo_personal":
        if tipo == "voluntario":
            tropa_info = data.get("tropa_voluntaria", "")
            if tropa_info:
                resp = tropa_info
            elif not contexto["tiene_cupo"]:
                resp = f"Perfecto 😊\n\nSiendo tropa voluntaria, necesito tu cupo de afectación por Decreto 14/12.\n\n{data['cupo']}\n\n¿Lo tenés a mano?"
            else:
                resp = f"Perfecto 😊\n\nTomo como referencia tu disponible. Con ese cupo ya puedo buscarte las mejores opciones para tropa voluntaria."
        elif tipo == "carrera":
            if not contexto["tiene_cupo"]:
                resp = f"Perfecto 😊\n\nSiendo de carrera, necesito tu cupo de afectación por Decreto 14/12.\n\n{data['cupo']}\n\n¿Lo tenés a mano?"
            else:
                resp = f"Perfecto 😊\n\nTomo como referencia tu disponible. Con ese cupo ya puedo buscarte las mejores opciones para personal de carrera."
        else:
            resp = data["seguimiento"]
    elif intencion == "rechazo":
        resp = "Perfecto, no hay problema 😊\n\nSi en algún momento te interesa o tenés alguna duda, acá estoy. Que tengas buen día!"
    elif intencion == "precio_cuota":
        if contexto["tiene_cupo"]:
            data_general = BIBLIOTECA.get("General", {})
            tabla = data_general.get("tabla_cuotas", "")
            resp = tabla
        else:
            resp = "Para decirte bien qué monto y cuota te corresponde, primero necesito tu cupo de afectación / disponible por Decreto 14/12.\n\n¿Ya lo tenés o querés que te guíe para verlo?"
    elif intencion == "tiempo_acreditacion":
        resp = "Una vez aprobado y firmado el legajo, se avanza con la acreditación.\n\nPrimero necesitamos validar cupo, documentación y firma digital. Con eso te puedo ir guiando paso a paso para que no pierdas tiempo.\n\n¿Tenés tu cupo a mano?"
    else:
        # 2) Si no hay regla propia, intentar Word
        desde_word = buscar_respuesta_word(ultimo_mensaje)
        if desde_word:
            resp = desde_word
        else:
            # 3) Fallback seguro
            resp = respuesta_general(data, fuerza, tipo, contexto)

    # REGLA CRÍTICA: Si detecta fuerza, SIEMPRE preguntar tipo
    if (
        fuerza in ["Ejército", "Armada", "Gendarmería", "Prefectura", "Fuerza Aérea"]
        and not tipo
        and intencion != "tipo_personal"
        and intencion != "rechazo"
        and intencion != "desconfianza"
    ):
        resp += "\n\n¿Sos tropa voluntaria o de carrera?"

    return resp


def respuesta_general(data, fuerza, tipo, contexto):
    """Respuesta general basada en contexto"""

    if contexto["es_primera"]:
        return f"{data['saludo']}\n\n{data['info']}\n\n{data['seguimiento']}"

    if fuerza == "Ejército" and not tipo:
        return "Perfecto 😊\n\nPara orientarte bien, decime si sos tropa voluntaria o de carrera."

    if tipo and not contexto["tiene_cupo"]:
        return f"Perfecto 😊\n\nEntonces necesito tu cupo de afectación, es decir tu disponible a afectar por Decreto 14/12.\n\n{data['cupo']}\n\n¿Lo tenés a mano o querés que te guíe para verlo?"

    if contexto["tiene_cupo"]:
        return f"Perfecto 😊\n\nTomo como referencia un disponible de ${contexto['monto_cupo'] or 'X'}.\n\nCon ese cupo ya puedo buscarte las mejores opciones que te pueden quedar."

    return f"{data['saludo']}\n\n{data['seguimiento']}"


def generar_guia(intencion, fuerza, tipo, contexto, confianza):
    """Genera guía interna detallada"""

    guia = f"""📊 ANÁLISIS DEL CHAT - Citycred Cerebro Local v2.0

🎯 INTENCIÓN DETECTADA
   Tipo: {intencion}
   Confianza: {confianza:.0%}

🏛️ INFORMACIÓN DEL CLIENTE
   Fuerza: {fuerza}
   Tipo: {tipo or "No detectado"}
   Etapa: {contexto["etapa"].upper()}

📈 CONTEXTO
   Interacciones: {contexto["interacciones"]}
   Tiene cupo: {"SÍ" if contexto["tiene_cupo"] else "NO"}
   Monto: {contexto["monto_cupo"] or "No detectado"}

📋 ACCIONES RECOMENDADAS
"""

    acciones = {
        "inicio": [
            "1. Saludar cordialmente",
            "2. Presentar Citycred y AMFAYS",
            "3. Preguntar fuerza",
            "4. Preguntar si tiene cupo",
        ],
        "desconfianza": [
            "1. DAR SEGURIDAD (prioridad alta)",
            "2. Mencionar AMFAYS y oficinas",
            "3. Explicar Decreto 14/12",
            "4. NO vender de golpe",
        ],
        "explicar_cupo": [
            "1. Explicar qué es el cupo",
            "2. Usar lenguaje simple",
            "3. Dar ejemplo",
            "4. Ofrecer guía",
        ],
        "guia_cupo": [
            f"1. Dar pasos para {fuerza}",
            "2. Ofrecer ayuda paso a paso",
            "3. Esperar que consiga el dato",
        ],
        "documentacion": [
            "1. Listar documentación",
            "2. Explicar que es mínima",
            "3. Ofrecer ayuda",
        ],
        "avanzar": [
            "1. Confirmar que tiene todo",
            "2. Pedir documentación",
            "3. Explicar siguientes pasos",
        ],
        "cupo_monto": [
            "1. Confirmar monto",
            "2. Buscar opciones",
            "3. Mostrar planes",
            "4. Preguntar si avanza",
        ],
        "tipo_personal": [
            "1. Confirmar tipo",
            "2. Si falta en Ejército → preguntar",
            "3. Si tiene tipo → pedir cupo",
        ],
        "rechazo": [
            "1. RESPETAR decisión",
            "2. NO insistir",
            "3. Dejar puerta abierta",
        ],
        "precio_cuota": [
            "1. Explicar que necesita cupo",
            "2. Ofrecer guía",
            "3. NO dar números sin cupo",
        ],
        "tiempo_acreditacion": [
            "1. Explicar proceso",
            "2. Mencionar que es rápido",
            "3. Enfocar en validar cupo",
        ],
        "general": [
            "1. Detectar fuerza",
            "2. Detectar tipo",
            "3. Pedir cupo",
            "4. NO saltear pasos",
        ],
    }

    accion_list = acciones.get(intencion, acciones["general"])
    guia += "\n".join(accion_list)

    guia += """

⚠️ REGLAS CRÍTICAS
   • Si ya pasó un monto, tomarlo como cupo
   • NO repetir preguntas ya respondidas
   • Si tiene cupo, pasar a opciones
   • Si falta tipo, preguntar SOLO eso
   • NUNCA dar números sin cupo confirmado

💡 TIPS
   • Usar emojis para generar confianza
   • Ser claro y directo
   • NO usar tecnicismos
   • Ofrecer ayuda, no presionar
"""

    return guia


def generar_recomendacion(intencion, contexto):
    """Genera recomendación específica"""
    if intencion == "desconfianza":
        return "PRIORIDAD ALTA: Generar confianza antes de vender"
    elif contexto["etapa"] == "inicio":
        return "Objetivo: Obtener fuerza y tipo del cliente"
    elif contexto["etapa"] == "cupo" and not contexto["tiene_cupo"]:
        return "Objetivo: Conseguir cupo del cliente"
    elif contexto["tiene_cupo"]:
        return "Objetivo: Mostrar opciones y cerrar"
    return "Seguir conversación natural"


# =====================================================
# RUTAS DE LA API
# =====================================================


@app.route("/")
def index():
    """Sirve el simulador HTML"""
    return send_from_directory(FRONTEND_DIR, "simulador.html")


@app.route("/simulador")
def simulador():
    """Ruta alternativa al simulador"""
    return send_from_directory(FRONTEND_DIR, "simulador.html")


@app.route("/api/response", methods=["POST"])
def api_response():
    """API principal para generar respuestas inteligentes"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No se recibieron datos"}), 400

        historial = data.get("historial", "")
        ultimo_mensaje = data.get("ultimo_mensaje", "") or data.get("mensaje", "")
        fuerza = data.get("fuerza", "General")
        tipo = data.get("tipo", None)

        # Generar respuesta con el cerebro
        resultado = generar_respuesta(historial, ultimo_mensaje, fuerza, tipo)

        return jsonify(resultado)

    except Exception as e:
        return jsonify(
            {
                "error": str(e),
                "respuesta": "Error interno del servidor",
                "intencion": "error",
            }
        ), 500


@app.route("/api/analizar", methods=["POST"])
def api_analizar():
    """API para análisis detallado de texto"""
    try:
        data = request.get_json()
        texto = data.get("texto", "")

        if not texto:
            return jsonify({"error": "No se proporcionó texto"}), 400

        intencion, confianza = detectar_intencion(texto)

        return jsonify(
            {
                "texto": texto,
                "intencion": intencion,
                "confianza": round(confianza, 2),
                "fuerza_detectada": detectar_fuerza(texto),
                "tipo_detectado": detectar_tipo(texto),
                "monto_detectado": extraer_monto(texto),
                "timestamp": datetime.now().isoformat(),
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/fuerzas", methods=["GET"])
def api_fuerzas():
    """Devuelve lista de fuerzas disponibles"""
    return jsonify({"fuerzas": list(BIBLIOTECA.keys()), "total": len(BIBLIOTECA)})


@app.route("/api/health", methods=["GET"])
def health_check():
    """Verificación de estado del servidor"""
    return jsonify(
        {
            "status": "ok",
            "servicio": "Citycred Backend Pro",
            "version": "2.0.0",
            "cerebro": "Cerebro Local Inteligente v2.0",
            "timestamp": datetime.now().isoformat(),
        }
    )


# =====================================================
# INICIO DEL SERVIDOR
# =====================================================

if __name__ == "__main__":
    print("🏛️  Citycred Backend Pro - Cerebro Local Inteligente v2.0")
    print("=" * 60)
    print(f"📁 Frontend: {FRONTEND_DIR}")
    print(f"📁 Datos: {DATA_DIR}")
    print("")
    print("🧠 CEREBRO LOCAL ACTIVADO")
    print("   • 11 intenciones detectables")
    print("   • Análisis de contexto")
    print("   • Memoria de conversación")
    print("   • Respuestas por fuerza")
    print("")
    print("🌐 URLs disponibles:")
    print("   http://127.0.0.1:8000/              → Simulador HTML")
    print("   http://127.0.0.1:8000/api/response  → API de respuestas")
    print("   http://127.0.0.1:8000/api/analizar  → API de análisis")
    print("   http://127.0.0.1:8000/api/health    → Estado del servidor")
    print("")
    print("✅ Servidor listo. Presiona Ctrl+C para detener.")
    print("")

    app.run(host="127.0.0.1", port=8000, debug=True, use_reloader=False)