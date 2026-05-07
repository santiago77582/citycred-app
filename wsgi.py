#!/usr/bin/env python3
# wsgi.py - Este archivo es para PythonAnywhere
import sys
import os

# El path donde están tus archivos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Importar la app Flask
from app import app as application
