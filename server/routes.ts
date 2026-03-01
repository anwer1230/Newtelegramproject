import type { Express } from "express";
import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import * as path from 'path';
import * as fs from 'fs-extra';
import {
  PREDEFINED_USERS,
  users,
  WhatsAppClientManager,
  initAlertQueue,
  loadAllSessions,
  extractWhatsAppLinks,
  resolveJid
} from './whatsapp';
import session from 'express-session';

export async function registerRoutes(
  httpServer: HttpServer,
  app: Express
): Promise<HttpServer> {

  // Setup express session
  app.use(session({
    secret: 'whatsapp-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
  }));

  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
  
  initAlertQueue(io);
  await loadAllSessions(io);

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string || 'user_1';
    socket.join(userId);

    socket.emit('connection_confirmed', { user_id: userId, user_name: PREDEFINED_USERS[userId as keyof typeof PREDEFINED_USERS]?.name || userId });
    socket.emit('users_list', { current_user: userId, users: PREDEFINED_USERS });

    const sendCurrentQR = async () => {
      const manager = users[userId]?.clientManager;
      if (manager && manager.qrCodeData) {
        try {
          const qrcode = await import('qrcode');
          const qr = await qrcode.default.toDataURL(manager.qrCodeData);
          socket.emit('qr_code', { qr });
          socket.emit('connection_status', { status: 'connecting' });
          console.log(`[Socket] Sent current QR to user ${userId}`);
        } catch (err) {
          console.error(`[Socket] Error sending QR to user ${userId}:`, err);
        }
      } else if (manager && manager.connectionState === 'connecting') {
        console.log(`[Socket] Manager connecting for ${userId} but no QR yet`);
        socket.emit('connection_status', { status: 'connecting' });
      }
    };
    
    // Send QR immediately on connection and also set an interval for safety
    sendCurrentQR();
    const qrInterval = setInterval(sendCurrentQR, 5000);

    socket.on('switch_user', (data) => {
      clearInterval(qrInterval);
      const newUserId = data.userId;
      socket.leave(userId);
      socket.join(newUserId);
      socket.emit('user_switched', { current_user: newUserId, user_name: PREDEFINED_USERS[newUserId as keyof typeof PREDEFINED_USERS]?.name });
    });

    socket.on('start_monitoring', async () => {
      if (users[userId]) {
        users[userId].is_running = true;
        
        // Start scheduled loop if sendType is 'scheduled'
        const userSettings = await storage.getSettings(userId);
        if (userSettings?.sendType === 'scheduled') {
           runScheduledLoop(userId, io);
        }
      }
    });

    socket.on('stop_monitoring', () => {
      if (users[userId]) users[userId].is_running = false;
    });

    socket.on('disconnect', () => {
      socket.leave(userId);
    });
  });

  const getUserId = (req: any) => req.session?.userId || req.body?.userId || req.query?.userId || 'user_1';

  app.get(api.init.path, async (req, res) => {
    const userId = getUserId(req);
    const settings = await storage.getSettings(userId) || {};
    const currentUser = PREDEFINED_USERS[userId as keyof typeof PREDEFINED_USERS];
    const userData = users[userId] || { stats: { sent: 0, errors: 0 } };
    const connectionStatus = userData.clientManager?.connectionState === 'connected' ? 'connected' : 'disconnected';
    
    res.json({
      currentUser,
      predefinedUsers: PREDEFINED_USERS,
      settings,
      connectionStatus,
      stats: userData.stats
    });
  });

  app.post(api.connect.path, async (req, res) => {
    const userId = getUserId(req);
    const { method, phoneNumber } = api.connect.input.parse(req.body);

    if (!users[userId]) {
      users[userId] = { clientManager: null, is_running: false, stats: { sent: 0, errors: 0 } };
    }
    
    // Clear existing session if starting a new connection attempt to avoid 405/conflicts
    const sessionDir = path.join(process.cwd(), 'sessions', userId);
    if (users[userId].clientManager) {
      users[userId].clientManager.stop();
      users[userId].clientManager = null;
      // Wait a bit for the socket to close
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (fs.existsSync(sessionDir)) {
      try {
        fs.removeSync(sessionDir);
        console.log(`[WhatsApp] Cleared session directory for ${userId} before new connect`);
      } catch (e) {
        console.error(`[WhatsApp] Failed to clear session dir for ${userId}:`, e);
      }
    }

    const manager = new WhatsAppClientManager(userId, io);
    users[userId].clientManager = manager;
    manager.connect(method as any, phoneNumber);
    
    res.json({ success: true, message: 'جاري الاتصال...' });
  });

  app.post(api.logout.path, async (req, res) => {
    const userId = getUserId(req);
    if (users[userId]?.clientManager) {
      users[userId].clientManager.stop();
      users[userId].clientManager = null;
    }
    const sessionDir = path.join(process.cwd(), 'sessions', userId);
    await fs.remove(sessionDir);
    io.to(userId).emit('connection_status', { status: 'disconnected' });
    io.to(userId).emit('login_status', { logged_in: false, connected: false, awaiting_code: false, awaiting_password: false, is_running: false });
    res.json({ success: true, message: 'تم تسجيل الخروج' });
  });

  app.post(api.saveSettings.path, async (req, res) => {
    const userId = getUserId(req);
    const input = api.saveSettings.input!.parse(req.body);
    
    const settingsData = {
      message: input.message || '',
      groups: input.groups ? input.groups.split('\n').map(g => g.trim()).filter(g => g) : [],
      intervalSeconds: parseInt(input.interval_seconds as string) || 3600,
      loopIntervalSeconds: parseInt(input.loop_interval_seconds as string) || 0,
      watchWords: input.watch_words ? input.watch_words.split('\n').map(w => w.trim()).filter(w => w) : [],
      sendType: input.send_type || 'manual',
      scheduledTime: input.scheduled_time || ''
    };

    await storage.updateSettings(userId, settingsData);
    
    if (users[userId]?.clientManager) {
      users[userId].clientManager.updateMonitoringSettings(settingsData.watchWords, settingsData.groups);
    }
    io.to(userId).emit('log_update', { message: '✅ تم حفظ الإعدادات' });
    res.json({ success: true });
  });

  app.post(api.sendNow.path, async (req, res) => {
    const userId = getUserId(req);
    const data = api.sendNow.input!.parse(req.body);
    const message = data.message || '';
    const groupsText = data.groups || '';
    const images = data.images || [];

    if (!message && images.length === 0) {
      return res.json({ success: false, message: '❌ يجب إدخال رسالة أو رفع صورة' });
    }
    const groups = groupsText.split('\n').map(g => g.trim()).filter(g => g);
    if (groups.length === 0) {
      return res.json({ success: false, message: '❌ يجب تحديد مجموعة واحدة على الأقل' });
    }

    const manager = users[userId]?.clientManager;
    if (!manager || manager.connectionState !== 'connected') {
      return res.json({ success: false, message: '❌ العميل غير متصل، يرجى ربط الجهاز أولاً' });
    }

    const tempDir = path.join(process.cwd(), 'temp', userId);
    fs.ensureDirSync(tempDir);
    const imagePaths: string[] = [];
    try {
      for (const img of images) {
        const base64Data = img.data.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = img.type.split('/')[1] || 'jpg';
        const tempFile = path.join(tempDir, `${Date.now()}-${Math.random()}.${ext}`);
        fs.writeFileSync(tempFile, buffer);
        imagePaths.push(tempFile);
      }
    } catch (err) {
      return res.json({ success: false, message: '❌ فشل معالجة الصور' });
    }

    (async () => {
      let success = 0, fail = 0;
      for (let i = 0; i < groups.length; i++) {
        const groupInput = groups[i];
        let jid = groupInput;
        if (groupInput.includes('chat.whatsapp.com/')) {
          io.to(userId).emit('log_update', { message: `⚠️ [${i+1}/${groups.length}] ${groupInput} هو رابط دعوة، يرجى استخدامه في الانضمام التلقائي أولاً` });
          fail++;
          continue;
        }
        if (!groupInput.includes('@')) {
          jid = resolveJid(groupInput);
        }
        try {
          await manager.sendMessage(jid, message, imagePaths);
          io.to(userId).emit('log_update', { message: `✅ [${i+1}/${groups.length}] نجح إلى: ${groupInput}` });
          success++;
          users[userId].stats.sent++;
        } catch (err) {
          io.to(userId).emit('log_update', { message: `❌ [${i+1}/${groups.length}] فشل إلى: ${groupInput}` });
          fail++;
          users[userId].stats.errors++;
        }
        io.to(userId).emit('stats_update', users[userId].stats);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      for (const f of imagePaths) {
        fs.unlink(f).catch(() => {});
      }
      io.to(userId).emit('log_update', { message: `📊 انتهى الإرسال: ✅ ${success} نجح | ❌ ${fail} فشل` });
    })();

    res.json({ success: true, message: '🚀 بدأ الإرسال...' });
  });

  app.post(api.extractLinks.path, (req, res) => {
    const input = api.extractLinks.input!.parse(req.body);
    const links = extractWhatsAppLinks(input.text || '');
    res.json({ success: true, links });
  });

  app.post(api.autoJoin.path, async (req, res) => {
    const userId = getUserId(req);
    const input = api.autoJoin.input!.parse(req.body);
    const links = input.links || [];
    const delay = input.delay || 3;

    const manager = users[userId]?.clientManager;
    if (!manager || manager.connectionState !== 'connected') {
      return res.json({ success: false, message: '❌ العميل غير متصل' });
    }

    const inviteLinks = links.filter(l => l.type === 'invite' || (typeof l === 'string' && l.includes('chat.whatsapp.com/')));
    
    if (inviteLinks.length === 0) {
      return res.json({ success: false, message: '❌ لا توجد روابط دعوة صالحة' });
    }

    (async () => {
      let success = 0, fail = 0, already = 0;
      for (let i = 0; i < inviteLinks.length; i++) {
        const link = inviteLinks[i];
        const code = link.code || (link.url ? link.url.split('/').pop() : link.split('/').pop());
        io.to(userId).emit('join_progress', { current: i+1, total: inviteLinks.length, link: link.url || link });
        try {
          const result = await manager.joinGroup(code);
          if (result.success) {
            success++;
            io.to(userId).emit('log_update', { message: `✅ [${i+1}/${inviteLinks.length}] تم الانضمام: ${link.url || link}` });
          } else {
            if (result.message.includes('already a participant')) {
              already++;
              io.to(userId).emit('log_update', { message: `ℹ️ [${i+1}/${inviteLinks.length}] منضم مسبقاً: ${link.url || link}` });
            } else {
              fail++;
              io.to(userId).emit('log_update', { message: `❌ [${i+1}/${inviteLinks.length}] فشل: ${link.url || link} - ${result.message}` });
            }
          }
        } catch (err) {
          fail++;
          io.to(userId).emit('log_update', { message: `❌ [${i+1}/${inviteLinks.length}] خطأ: ${link.url || link}` });
        }
        io.to(userId).emit('join_stats', { success, fail, already_joined: already });
        if (i < inviteLinks.length - 1) await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
      io.to(userId).emit('auto_join_completed', { success, fail, already_joined: already, total: inviteLinks.length });
      io.to(userId).emit('log_update', { message: `🎉 انتهى الانضمام: نجح ${success}، فشل ${fail}، منضم مسبقاً ${already}` });
    })();

    res.json({ success: true, message: `🚀 بدء الانضمام لـ ${inviteLinks.length} مجموعة` });
  });

  app.get(api.stats.path, (req, res) => {
    const userId = getUserId(req);
    res.json(users[userId]?.stats || { sent: 0, errors: 0 });
  });

  app.get(api.loginStatus.path, (req, res) => {
    const userId = getUserId(req);
    const manager = users[userId]?.clientManager;
    const connected = manager?.connectionState === 'connected';
    res.json({
      logged_in: connected,
      connected,
      is_running: users[userId]?.is_running || false
    });
  });

  app.post(api.switchUser.path, (req, res) => {
    const input = api.switchUser.input!.parse(req.body);
    const newUserId = input.userId;
    if (!PREDEFINED_USERS[newUserId as keyof typeof PREDEFINED_USERS]) {
      return res.json({ success: false, message: '❌ مستخدم غير صحيح' });
    }
    if (req.session) {
      req.session.userId = newUserId;
    }
    res.json({ success: true, message: `✅ تم التبديل إلى ${PREDEFINED_USERS[newUserId as keyof typeof PREDEFINED_USERS].name}` });
  });

  return httpServer;
}