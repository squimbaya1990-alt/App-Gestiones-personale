// ════════════════════════════════════════════════
// Misiones Pendientes — Notificaciones Android
// Porta la lógica de background.js (Chrome ext)
// usando @capacitor/local-notifications
// ════════════════════════════════════════════════

const STORE          = 'misiones:v1';
const ASSIST_LOG_KEY = 'misiones:assistant_log:v1';
const ASSIST_CFG_KEY = 'misiones:assistant_cfg:v1';

// IDs de notificación reservados
const NOTIF_VENCIMIENTO_BASE = 1000;
const NOTIF_TIMER_BASE       = 2000;
const NOTIF_ASISTENTE_BASE   = 3000;

let _notifPlugin = null;

async function getNotifPlugin() {
  if (_notifPlugin) return _notifPlugin;
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    _notifPlugin = window.Capacitor.Plugins.LocalNotifications;
    return _notifPlugin;
  }
  return null;
}

async function requestPermissions() {
  const plugin = await getNotifPlugin();
  if (!plugin) return false;
  const perm = await plugin.requestPermissions();
  return perm.display === 'granted';
}

// ── Helpers ──
function getData() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch(e) { return []; }
}
function getAssistCfg() {
  try { return JSON.parse(localStorage.getItem(ASSIST_CFG_KEY) || 'null') || { enabled: true, intervalMin: 30 }; } catch(e) { return { enabled: true, intervalMin: 30 }; }
}
function progressOf(m) {
  if (m.subtasks && m.subtasks.length)
    return Math.round(m.subtasks.filter(s => s.done).length / m.subtasks.length * 100);
  return m.progress || 0;
}

// ── Recordatorios de vencimiento ──
// Cancela y reprograma todas las notificaciones de fecha límite
async function scheduleVencimientoNotifs() {
  const plugin = await getNotifPlugin();
  if (!plugin) return;

  const data = getData();
  if (!Array.isArray(data) || !data.length) return;

  // Cancelar notificaciones previas de vencimiento
  const cancelIds = data.map((_, i) => ({ id: NOTIF_VENCIMIENTO_BASE + i }));
  try { await plugin.cancel({ notifications: cancelIds }); } catch(e) {}

  const now = new Date();
  const notifications = [];

  data.forEach((m, i) => {
    if (!m.date) return;
    if (progressOf(m) >= 100) return;

    const due = new Date(m.date + 'T' + (m.time || '23:59') + ':00');
    const threshold = (m.reminderMin != null) ? m.reminderMin : 60;
    const diffMin = (due - now) / 60000;

    // Notificar si vence en las próximas `threshold` minutos (y no ha vencido hace más de 1 día)
    if (diffMin > -1440 && diffMin <= threshold) {
      const isOverdue = diffMin < 0;
      notifications.push({
        id: NOTIF_VENCIMIENTO_BASE + i,
        title: isOverdue ? '⏰ Misión vencida' : '⏰ Misión por vencer',
        body: m.title + (m.time ? ` · ${m.time}` : ''),
        schedule: { at: new Date(now.getTime() + 2000) }, // mostrar casi inmediatamente
        channelId: 'misiones',
        sound: 'default',
        extra: { misionId: m.id }
      });
    } else if (diffMin > 0 && diffMin > threshold) {
      // Programar para cuando llegue el umbral
      const fireAt = new Date(due.getTime() - threshold * 60000);
      if (fireAt > now) {
        notifications.push({
          id: NOTIF_VENCIMIENTO_BASE + i,
          title: '⏰ Misión por vencer',
          body: m.title + (m.time ? ` · ${m.time}` : ''),
          schedule: { at: fireAt },
          channelId: 'misiones',
          sound: 'default',
          extra: { misionId: m.id }
        });
      }
    }
  });

  if (notifications.length) {
    try { await plugin.schedule({ notifications }); } catch(e) { console.error('scheduleVencimiento', e); }
  }
}

// ── Temporizadores por misión ──
async function scheduleTimerNotifs() {
  const plugin = await getNotifPlugin();
  if (!plugin) return;

  const data = getData();
  if (!Array.isArray(data)) return;

  // Cancelar timers previos
  const cancelIds = data.map((_, i) => ({ id: NOTIF_TIMER_BASE + i }));
  try { await plugin.cancel({ notifications: cancelIds }); } catch(e) {}

  const now = new Date();
  const notifications = [];

  data.forEach((m, i) => {
    if (!m.timerEndsAt || m.timerNotified) return;
    const fireAt = new Date(m.timerEndsAt);
    if (fireAt <= now) return;
    notifications.push({
      id: NOTIF_TIMER_BASE + i,
      title: '⏱️ Temporizador terminado',
      body: m.title,
      schedule: { at: fireAt },
      channelId: 'misiones',
      sound: 'default',
      extra: { misionId: m.id, type: 'timer' }
    });
  });

  if (notifications.length) {
    try { await plugin.schedule({ notifications }); } catch(e) { console.error('scheduleTimers', e); }
  }
}

// ── Asistente proactivo ──
const PRIO_WEIGHT = { urgente: 0, alta: 1, media: 2, baja: 3 };

function pickBestSuggestion(data, lastSuggestedId) {
  const now = new Date();
  const candidates = data.filter(m => progressOf(m) < 100);
  if (!candidates.length) return null;
  const scored = candidates.map(m => {
    let score = (PRIO_WEIGHT[m.priority] ?? 3) * 100;
    if (m.date) {
      const diffH = (new Date(m.date + 'T' + (m.time || '23:59') + ':00') - now) / 3600000;
      if (diffH < 0)        score -= 500;
      else if (diffH < 24)  score -= 200;
      else if (diffH < 72)  score -= 80;
    }
    if (progressOf(m) >= 70) score -= 30;
    if (m.id === lastSuggestedId) score += 1000;
    return { m, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].m;
}

async function scheduleAsistenteNotif() {
  const plugin = await getNotifPlugin();
  if (!plugin) return;

  const cfg = getAssistCfg();
  if (!cfg.enabled) return;

  const data = getData();
  if (!Array.isArray(data) || !data.length) return;

  let log = {};
  try { log = JSON.parse(localStorage.getItem(ASSIST_LOG_KEY) || '{}'); } catch(e) {}

  const suggestion = pickBestSuggestion(data, log.lastSuggestedId);
  if (!suggestion) return;

  // Cancelar notificación previa del asistente
  try { await plugin.cancel({ notifications: [{ id: NOTIF_ASISTENTE_BASE }] }); } catch(e) {}

  const minutes = Math.max(1, cfg.intervalMin);
  const fireAt = new Date(Date.now() + minutes * 60000);

  const p = progressOf(suggestion);
  const now = new Date();
  let context = '';
  if (suggestion.date) {
    const diffH = Math.round((new Date(suggestion.date + 'T' + (suggestion.time || '23:59') + ':00') - now) / 3600000);
    if (diffH < 0)       context = 'Vencida hace ' + Math.abs(diffH) + 'h';
    else if (diffH < 24) context = 'Vence en ' + diffH + 'h';
  }
  if (!context && p > 0) context = p + '% completada';
  if (!context) context = 'Pendiente de empezar';

  try {
    await plugin.schedule({
      notifications: [{
        id: NOTIF_ASISTENTE_BASE,
        title: '💡 Misión sugerida',
        body: suggestion.title + ' — ' + context,
        schedule: { at: fireAt },
        channelId: 'misiones',
        sound: 'default',
        extra: { misionId: suggestion.id, type: 'asistente' }
      }]
    });

    // Actualizar log
    log.nextRun = fireAt.getTime();
    log.lastSuggestedId = suggestion.id;
    localStorage.setItem(ASSIST_LOG_KEY, JSON.stringify(log));
  } catch(e) { console.error('scheduleAsistente', e); }
}

// ── API pública ──
// Llámalo al arrancar la app y cada vez que cambien los datos
async function initNotifications() {
  const ok = await requestPermissions();
  if (!ok) return;

  // Crear canal de notificaciones (Android 8+)
  const plugin = await getNotifPlugin();
  if (plugin && plugin.createChannel) {
    try {
      await plugin.createChannel({
        id: 'misiones',
        name: 'Misiones Pendientes',
        description: 'Alertas de misiones, vencimientos y temporizadores',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        sound: 'default',
        vibration: true
      });
    } catch(e) {}
  }

  await scheduleVencimientoNotifs();
  await scheduleTimerNotifs();
  await scheduleAsistenteNotif();
}

// Reprogramar tras guardar datos
async function refreshNotifications() {
  await scheduleVencimientoNotifs();
  await scheduleTimerNotifs();
  await scheduleAsistenteNotif();
}

window.MisionesNotif = { initNotifications, refreshNotifications };
