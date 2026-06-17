# Misiones Pendientes

Centro de mando personal para gestionar tareas y misiones con soporte offline.

## Características

- Gestor de tareas con prioridades (Urgente, Alta, Media, Baja)
- Progreso por pasos (subtareas) o porcentaje manual
- Responsables y fechas límite por misión
- Copiloto IA con Claude (requiere clave API de Anthropic)
  - Genera misiones a partir de texto libre
  - Plan de hoy priorizado por IA
- Temas claro/oscuro
- PWA: instalable y funciona sin conexión (Service Worker + Web App Manifest)
- Datos guardados localmente en el dispositivo (localStorage)

## Uso

Abre `index.html` en un servidor HTTPS (o localhost) para activar el Service Worker y la funcionalidad PWA.

Para el Copiloto IA, obtén una clave API en [console.anthropic.com](https://console.anthropic.com/settings/keys) y pégala en el panel lateral.
