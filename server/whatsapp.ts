import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import fs from 'fs-extra';
const { existsSync, removeSync, ensureDirSync } = fs;
import * as path from 'path';
import qrcode from 'qrcode';
import { Server } from 'socket.io';
import { storage } from './storage';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions');
ensureDirSync(SESSIONS_DIR);

export const PREDEFINED_USERS = {
  user_1: { id: 'user_1', name: 'المستخدم الأول' },
  user_2: { id: 'user_2', name: 'المستخدم الثاني' },
  user_3: { id: 'user_3', name: 'المستخدم الثالث' },
  user_4: { id: 'user_4', name: 'المستخدم الرابع' },
  user_5: { id: 'user_5', name: 'المستخدم الخامس' }
};

export const users: Record<string, any> = {};

class AlertQueue {
  queue: any[] = [];
  running = false;
  io: Server;

  constructor(io: Server) {
    this.io = io;
  }
  start() {
    this.running = true;
    this._process();
  }
  stop() {
    this.running = false;
  }
  addAlert(userId: string, alertData: any) {
    this.queue.push({ userId, alertData, timestamp: Date.now() });
  }
  _process() {
    if (!this.running) return;
    if (this.queue.length > 0) {
      const { userId, alertData } = this.queue.shift();
      this._sendAlert(userId, alertData);
    }
    setTimeout(() => this._process(), 100);
  }
  _sendAlert(userId: string, alertData: any) {
    this.io.to(userId).emit('new_alert', alertData);
    this.io.to(userId).emit('log_update', { message: `🚨 تنبيه فوري: '${alertData.keyword}' في ${alertData.group}` });
    this.io.to(userId).emit('show_notification', {
      title: '🚨 تنبيه واتساب',
      body: `كلمة: ${alertData.keyword}\nالمجموعة: ${alertData.group}`,
      icon: '/favicon.png'
    });
    const user = users[userId];
    if (user && user.clientManager && user.clientManager.sock?.user) {
      const selfJid = user.clientManager.sock.user.id;
      user.clientManager.sock.sendMessage(selfJid, { text: `🚨 تنبيه فوري\nالكلمة: ${alertData.keyword}\nالمصدر: ${alertData.group}\nالرسالة: ${alertData.message}` }).catch(() => {});
    }
  }
}

export let alertQueue: AlertQueue;

export function initAlertQueue(io: Server) {
  alertQueue = new AlertQueue(io);
  alertQueue.start();
}

export function extractWhatsAppLinks(text: string) {
  const invitePattern = /(?:https?:\/\/)?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi;
  const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  const jidPattern = /[0-9]+@s\.whatsapp\.net/g;

  const links: any[] = [];
  let match;
  while ((match = invitePattern.exec(text)) !== null) {
    links.push({ type: 'invite', code: match[1], url: match[0] });
  }
  while ((match = phonePattern.exec(text)) !== null) {
    let phone = match[0].replace(/[^\d+]/g, '');
    if (!phone.startsWith('+')) phone = '+' + phone;
    links.push({ type: 'phone', phone, url: match[0] });
  }
  while ((match = jidPattern.exec(text)) !== null) {
    links.push({ type: 'jid', jid: match[0], url: match[0] });
  }
  return links;
}

export function resolveJid(input: string) {
  if (input.includes('@s.whatsapp.net')) return input;
  if (input.includes('@g.us')) return input;
  if (input.includes('chat.whatsapp.com/')) return input;
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length >= 10 && digits.length <= 15) {
    return digits + '@s.whatsapp.net';
  }
  return input;
}

export class WhatsAppClientManager {
  userId: string;
  sock: any = null;
  qrCodeData: string | null = null;
  connectionState: string = 'disconnected';
  monitoredKeywords: string[] = [];
  monitoredGroups: string[] = [];
  stopFlag: boolean = false;
  io: Server;

  constructor(userId: string, io: Server) {
    this.userId = userId;
    this.io = io;
  }

  async connect(method: 'qr' | 'phone' = 'qr', phoneNumber?: string) {
    this.connectionState = 'connecting';
    const sessionDir = path.join(SESSIONS_DIR, this.userId);
    ensureDirSync(sessionDir);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: true,
      options: {
        timeout: 60000,
      },
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                ...message,
              },
            },
          };
        }
        return message;
      },
    });

    // Handle pairing code request if method is phone
    if (method === 'phone' && phoneNumber && !this.sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await this.sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ''));
          const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
          this.io.to(this.userId).emit('pairing_code', { code: formattedCode });
          console.log(`[WhatsApp] Pairing code generated for ${this.userId}: ${formattedCode}`);
        } catch (err) {
          console.error(`[WhatsApp] Error generating pairing code for ${this.userId}:`, err);
          this.io.to(this.userId).emit('log_update', { message: '❌ فشل طلب رمز الربط. تأكد من الرقم وحاول مجدداً' });
        }
      }, 5000);
    }

    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr && method === 'qr') {
        this.qrCodeData = qr;
        try {
          const qrcode = await import('qrcode');
          const qrImage = await qrcode.default.toDataURL(qr);
          this.io.to(this.userId).emit('qr_code', { qr: qrImage });
          this.io.to(this.userId).emit('connection_status', { status: 'connecting' });
        } catch (err) {
          console.error(`[WhatsApp] Error generating QR data URL for ${this.userId}:`, err);
        }
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode || (lastDisconnect?.error as any)?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401 && statusCode !== 403 && statusCode !== 405;
        console.log(`[WhatsApp] Connection closed for ${this.userId}. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
        
        if (statusCode === 401 || statusCode === 403 || statusCode === 419 || statusCode === 405) {
           const sessionDir = path.join(SESSIONS_DIR, this.userId);
           if (existsSync(sessionDir)) {
             try {
               removeSync(sessionDir);
               console.log(`[WhatsApp] Session cleared for ${this.userId} due to error ${statusCode}`);
             } catch (e) {
               console.error(`[WhatsApp] Failed to clear session for ${this.userId}:`, e);
             }
           }
        }

        this.connectionState = 'disconnected';
        this.qrCodeData = null;
        this.io.to(this.userId).emit('qr_code', { qr: null });
        this.io.to(this.userId).emit('pairing_code', { code: null });
        this.io.to(this.userId).emit('connection_status', { status: 'disconnected' });
        this.io.to(this.userId).emit('login_status', {
          logged_in: false, 
          connected: false, 
          awaiting_code: false, 
          awaiting_password: false, 
          is_running: this.stopFlag ? false : (users[this.userId]?.is_running || false)
        });

        if (shouldReconnect && !this.stopFlag) {
          this.connect(method, phoneNumber);
        }
      } else if (connection === 'open') {
        console.log(`[WhatsApp] Connection opened for ${this.userId}`);
        this.connectionState = 'connected';
        this.qrCodeData = null;
        this.io.to(this.userId).emit('qr_code', { qr: null }); // Clear QR on success
        this.io.to(this.userId).emit('connection_status', { status: 'connected' });
        this.io.to(this.userId).emit('login_status', {
          logged_in: true, 
          connected: true, 
          awaiting_code: false, 
          awaiting_password: false, 
          is_running: users[this.userId]?.is_running || false
        });
        this.io.to(this.userId).emit('log_update', { message: '✅ تم ربط الجهاز بنجاح مع واتساب' });

        const userInfo = {
          phone: this.sock.user.id.split(':')[0] || this.sock.user.id.split('@')[0],
          name: this.sock.user.name || 'مستخدم واتساب'
        };
        this.io.to(this.userId).emit('user_info', userInfo);

        const settings = await storage.getSettings(this.userId);
        if (settings?.watchWords) {
          this.updateMonitoringSettings(settings.watchWords, settings.groups || []);
        }
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('messages.upsert', async (m: any) => {
      if (this.connectionState !== 'connected') return;
      const message = m.messages[0];
      if (!message.message) return;
      if (message.key.fromMe) return;

      const text = message.message.conversation ||
                   message.message.extendedTextMessage?.text ||
                   message.message.imageMessage?.caption || '';

      if (!text) return;

      const chatJid = message.key.remoteJid;
      let groupName = chatJid;
      if (chatJid.endsWith('@g.us')) {
        try {
          const metadata = await this.sock.groupMetadata(chatJid);
          groupName = metadata.subject || chatJid;
        } catch { }
      } else if (chatJid.endsWith('@s.whatsapp.net')) {
        groupName = message.pushName || chatJid.split('@')[0];
      }

      if (this.monitoredKeywords.length > 0) {
        for (const keyword of this.monitoredKeywords) {
          if (text.toLowerCase().includes(keyword.toLowerCase())) {
            this._triggerAlert(text, keyword, groupName, chatJid, message);
            break;
          }
        }
      } else {
        this._triggerAlert(text, 'رسالة جديدة', groupName, chatJid, message);
      }
    });
  }

  _triggerAlert(text: string, keyword: string, group: string, chatJid: string, message: any) {
    const alertData = {
      keyword,
      group,
      message: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
      timestamp: new Date().toLocaleTimeString(),
      sender: message.pushName || 'غير معروف',
      message_time: new Date().toLocaleTimeString(),
      message_id: message.key.id,
      full_message: text
    };
    alertQueue.addAlert(this.userId, alertData);
  }

  async sendMessage(jid: string, text: string, imagePaths: string[] = []) {
    if (!this.sock || this.connectionState !== 'connected') throw new Error('العميل غير متصل');
    let results = [];
    if (imagePaths.length > 0) {
      for (let i = 0; i < imagePaths.length; i++) {
        const file = imagePaths[i];
        const buffer = await fs.readFile(file);
        const msg = (i === 0 && text) ? { caption: text } : { caption: `صورة ${i+1}` };
        const sent = await this.sock.sendMessage(jid, { image: buffer, ...msg });
        results.push(sent.key.id);
      }
    } else if (text) {
      const sent = await this.sock.sendMessage(jid, { text });
      results.push(sent.key.id);
    }
    return results;
  }

  async joinGroup(inviteCode: string) {
    if (!this.sock) throw new Error('العميل غير متصل');
    try {
      const result = await this.sock.groupAcceptInvite(inviteCode);
      return { success: true, jid: result, message: 'تم الانضمام بنجاح' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  stop() {
    this.stopFlag = true;
    if (this.sock) this.sock.end(undefined);
  }

  updateMonitoringSettings(keywords: string[], groups: string[]) {
    this.monitoredKeywords = keywords.filter(k => k && k.trim() !== '').map(k => k.trim());
    this.monitoredGroups = groups.filter(g => g && g.trim() !== '').map(g => g.trim());
  }
}

export async function loadAllSessions(io: Server) {
  for (const userId of Object.keys(PREDEFINED_USERS)) {
    users[userId] = {
      clientManager: null,
      is_running: false,
      stats: { sent: 0, errors: 0 }
    };
  }
}

export async function runScheduledLoop(userId: string, io: Server) {
  const user = users[userId];
  if (!user || !user.is_running) return;

  const settings = await storage.getSettings(userId);
  if (!settings || settings.sendType !== 'scheduled') return;

  const manager = user.clientManager;
  if (!manager || manager.connectionState !== 'connected') {
    io.to(userId).emit('log_update', { message: '⚠️ محاولة إرسال مجدول فشلت: العميل غير متصل' });
    setTimeout(() => runScheduledLoop(userId, io), 60000); // Retry in 1 min
    return;
  }

  const message = settings.message || '';
  const groups = settings.groups || [];

  if (groups.length === 0) {
    io.to(userId).emit('log_update', { message: '⚠️ لا توجد مجموعات محددة للإرسال المجدول' });
    return;
  }

  io.to(userId).emit('log_update', { message: `🚀 بدء دورة إرسال مجدولة لـ ${groups.length} مجموعة` });

  let success = 0, fail = 0;
  for (let i = 0; i < groups.length; i++) {
    if (!user.is_running) break;
    const groupInput = groups[i];
    let jid = resolveJid(groupInput);
    
    try {
      await manager.sendMessage(jid, message);
      success++;
      user.stats.sent++;
    } catch (err) {
      fail++;
      user.stats.errors++;
    }
    io.to(userId).emit('stats_update', user.stats);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Delay between messages
  }

  io.to(userId).emit('log_update', { message: `📊 انتهت دورة الإرسال المجدولة: ✅ ${success} نجح | ❌ ${fail} فشل` });

  if (user.is_running && settings.loopIntervalSeconds > 0) {
    io.to(userId).emit('log_update', { message: `⏳ انتظار لمدة ${settings.loopIntervalSeconds} ثانية قبل الدورة القادمة` });
    setTimeout(() => runScheduledLoop(userId, io), settings.loopIntervalSeconds * 1000);
  }
}