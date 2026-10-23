# Alas pa' volar · Frida AR

Experiencia de realidad aumentada en el navegador (WebAR) para la ilustración de **Frida Kahlo por Federico Chilian Espinosa**.
Al escanear la ilustración con el celular, el braille y la letra manuscrita se doran, la corona suelta pétalos,
se abren unas alas de monarca bordadas como su rebozo, que salen del marco, y las mariposas del fondo despiertan.

> "Pies, ¿para qué los quiero si tengo alas pa' volar?" — Frida Kahlo, Diario, 1953

## Archivos
| Archivo | Qué es |
|---|---|
| `index.html` | Pantalla de inicio, guía de escaneo y subtítulo |
| `app.js` | Seguimiento (MindAR + three.js), animación en canvas y sonido sintetizado |
| `marcador.html` | Muestra la ilustración en pantalla para probar sin playera |
| `assets/target.webp` | La ilustración (marcador de seguimiento) |
| `assets/figura.png` | Máscara de la figura, para poner las alas detrás de ella |

## Cómo funciona
1. La primera visita compila el marcador en el propio teléfono (MindAR) y lo guarda en caché.
2. Si existe `assets/targets.mind`, se usa directamente (más rápido). Se puede generar con el compilador de MindAR.
3. El lienzo animado mide 1.7 × 1.3 veces la ilustración, por eso las alas y las mariposas salen del marco.

Vista previa sin cámara: agrega `#preview` al final del link.

## Línea de tiempo (13 s en loop)
- 0.9 s parpadeo
- 0.8–4.6 s braille y frases se doran, con una nota por renglón
- 3.4 s pétalos de la corona
- 4.6–6.0 s se abren las alas y aparece la frase como subtítulo
- 5.4 s mariposas
- 10.2–11.4 s las alas se cierran y todo vuelve a la ilustración impresa

Sitio estático: no requiere build.
