import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ws } from '@shared/routes';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';

// Request notification permission early
if (typeof window !== 'undefined' && 'Notification' in window) {
  if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

export interface SocketState {
  connected: boolean;
  qrCode: string | null;
  pairingCode: string | null;
  logs: { id: string; message: string; timestamp: Date }[];
  alerts: z.infer<typeof ws.receive.new_alert>[];
  stats: { sent: number; errors: number };
  joinProgress: z.infer<typeof ws.receive.join_progress> | null;
  joinStats: z.infer<typeof ws.receive.join_stats> | null;
  userInfo: z.infer<typeof ws.receive.user_info> | null;
  isRunning: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}

export function useSocket(userId: string) {
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);
  
  const [state, setState] = useState<SocketState>({
    connected: false,
    qrCode: null,
    pairingCode: null,
    logs: [],
    alerts: [],
    stats: { sent: 0, errors: 0 },
    joinProgress: null,
    joinStats: null,
    userInfo: null,
    isRunning: false,
    connectionStatus: 'disconnected'
  });

  const addLog = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      logs: [{ id: Math.random().toString(36).substring(7), message, timestamp: new Date() }, ...prev.logs].slice(0, 100)
    }));
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Connect to root namespace with userId as query param
    const socket = io('/', { query: { userId } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setState(prev => ({ ...prev, connected: true }));
      addLog('متصل بالخادم المحلي ✅');
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, connected: false, connectionStatus: 'disconnected' }));
      addLog('انقطع الاتصال بالخادم المحلي ❌');
    });

    // Helper to safely parse and handle events
    const handleEvent = <K extends keyof typeof ws.receive>(
      event: K,
      schema: z.ZodSchema<any>,
      handler: (data: z.infer<typeof ws.receive[K]>) => void
    ) => {
      socket.on(event as string, (rawData) => {
        const result = schema.safeParse(rawData);
        if (result.success) {
          handler(result.data);
        } else {
          console.warn(`[Socket] Invalid payload for ${event}:`, result.error);
        }
      });
    };

    handleEvent('qr_code', ws.receive.qr_code, (data) => {
      setState(prev => ({ ...prev, qrCode: data.qr, pairingCode: null, connectionStatus: 'connecting' }));
    });

    handleEvent('pairing_code', ws.receive.pairing_code, (data) => {
      setState(prev => ({ ...prev, pairingCode: data.code, qrCode: null, connectionStatus: 'connecting' }));
    });

    handleEvent('connection_status', ws.receive.connection_status, (data) => {
      setState(prev => ({ ...prev, connectionStatus: data.status as 'connected' | 'disconnected' }));
      if (data.status === 'connected') {
        setState(prev => ({ ...prev, qrCode: null, pairingCode: null }));
      }
    });

    handleEvent('log_update', ws.receive.log_update, (data) => {
      addLog(data.message);
    });

    handleEvent('new_alert', ws.receive.new_alert, (data) => {
      setState(prev => ({
        ...prev,
        alerts: [data, ...prev.alerts].slice(0, 50)
      }));
    });

    handleEvent('show_notification', ws.receive.show_notification, (data) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(data.title, { body: data.body, icon: data.icon });
      } else {
        toast({ title: data.title, description: data.body });
      }
    });

    handleEvent('stats_update', ws.receive.stats_update, (data) => {
      setState(prev => ({ ...prev, stats: data }));
    });

    handleEvent('join_progress', ws.receive.join_progress, (data) => {
      setState(prev => ({ ...prev, joinProgress: data }));
    });

    handleEvent('join_stats', ws.receive.join_stats, (data) => {
      setState(prev => ({ ...prev, joinStats: data }));
    });

    handleEvent('auto_join_completed', ws.receive.auto_join_completed, (data) => {
      setState(prev => ({ ...prev, joinProgress: null }));
      toast({ title: "اكتمل الانضمام", description: `نجاح: ${data.success}, فشل: ${data.fail}` });
    });

    handleEvent('user_info', ws.receive.user_info, (data) => {
      setState(prev => ({ ...prev, userInfo: data }));
    });

    handleEvent('login_status', ws.receive.login_status, (data) => {
      setState(prev => ({ 
        ...prev, 
        isRunning: data.is_running,
        connectionStatus: data.connected ? 'connected' : 'disconnected'
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, addLog, toast]);

  const emit = <K extends keyof typeof ws.send>(event: K, data: z.infer<typeof ws.send[K]>) => {
    if (socketRef.current?.connected) {
      const payload = ws.send[event].parse(data);
      socketRef.current.emit(event as string, payload);
    }
  };

  const startMonitoring = () => emit('start_monitoring', {});
  const stopMonitoring = () => emit('stop_monitoring', {});
  const switchUserSocket = (newUserId: string) => emit('switch_user', { userId: newUserId });

  return { state, emit, startMonitoring, stopMonitoring, switchUserSocket, clearLogs: () => setState(p => ({...p, logs: []})) };
}
