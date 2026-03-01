import React, { useState, useEffect } from 'react';
import { Smartphone, LogOut, Send, Save, Link as LinkIcon, Activity, User, ShieldAlert, FileText, CheckCircle2, XCircle, Play, Square, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Label } from '@/components/ui/Input';
import { useInit, useConnect, useLogout, useSwitchUser, useSaveSettings, useSendNow, useExtractLinks, useAutoJoin } from '@/hooks/use-api';
import { useSocket } from '@/hooks/use-socket';

export default function Dashboard() {
  const { data: initData, isLoading: isInitLoading } = useInit();
  const [activeUserId, setActiveUserId] = useState<string>('user_1');
  const [connectMethod, setConnectMethod] = useState<'qr' | 'phone'>('qr');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [showPhoneInput, setShowPhoneInput] = useState(false);

  const { state: socketState, startMonitoring, stopMonitoring, switchUserSocket, clearLogs } = useSocket(activeUserId);

  const connectMutation = useConnect();
  const logoutMutation = useLogout();
  const switchMutation = useSwitchUser();

  // Update active user when initData loads
  useEffect(() => {
    if (initData?.currentUser?.id) {
      setActiveUserId(initData.currentUser.id);
    }
  }, [initData]);

  useEffect(() => {
    let interval: any;
    if (socketState.connectionStatus !== 'connected' && !socketState.qrCode && !socketState.pairingCode) {
      interval = setInterval(() => {
        // Force check if needed
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [socketState.connectionStatus, socketState.qrCode, socketState.pairingCode]);

  const handleSwitchUser = (userId: string) => {
    setActiveUserId(userId);
    switchMutation.mutate(userId, {
      onSuccess: () => switchUserSocket(userId)
    });
  };

  if (isInitLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-12 h-12 animate-spin" />
          <h2 className="text-2xl font-bold">جاري تحميل لوحة التحكم...</h2>
        </div>
      </div>
    );
  }

  const predefinedUsers = initData?.predefinedUsers || {};
  const currentSettings = initData?.settings || {};

  const handleConnect = () => {
    if (connectMethod === 'phone' && !phoneNumber) return;
    connectMutation.mutate({ method: connectMethod, phoneNumber });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setShowPhoneInput(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 selection:bg-primary/20">
      
      {/* Header & User Switcher */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="glass-panel rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">مركز سرعة انجاز</h1>
              <p className="text-muted-foreground font-medium mt-1">نظام إدارة الواتساب المتقدم</p>
            </div>
          </div>
          
          <div className="flex bg-muted/50 p-1.5 rounded-2xl overflow-x-auto max-w-full no-scrollbar border border-border">
            {Object.entries(predefinedUsers).map(([id, user]: [string, any]) => (
              <button
                key={id}
                onClick={() => handleSwitchUser(id)}
                className={`
                  flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 whitespace-nowrap
                  ${activeUserId === id 
                    ? 'bg-white dark:bg-slate-800 text-primary shadow-sm ring-1 ring-border' 
                    : 'text-muted-foreground hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-foreground'}
                `}
              >
                <User className="w-4 h-4" />
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (Connection & Stats) */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          {/* Connection Card */}
          <Card className="border-t-4 border-t-primary overflow-hidden">
            <CardHeader className="bg-primary/5 border-b-primary/10">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                حالة الاتصال
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8">
              {socketState.connectionStatus === 'connected' ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-500 shadow-inner">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-foreground">متصل بنجاح</h3>
                    <p className="text-sm text-muted-foreground mt-1" dir="ltr">
                      {socketState.userInfo?.phone || 'جهاز واتساب نشط'}
                    </p>
                  </div>
                </div>
              ) : socketState.pairingCode ? (
                <div className="flex flex-col items-center gap-4">
                  <h3 className="text-lg font-bold text-foreground">أدخل هذا الرمز في هاتفك</h3>
                  <div className="bg-muted p-6 rounded-2xl border-2 border-primary/20 shadow-inner">
                    <span className="text-4xl font-black tracking-[0.2em] font-mono text-primary select-all">
                      {socketState.pairingCode}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground text-center max-w-[250px]">
                    على هاتفك: الإعدادات &gt; الأجهزة المرتبطة &gt; ربط جهاز &gt; ربط برقم بدلاً من ذلك
                  </p>
                </div>
              ) : socketState.qrCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-2xl shadow-md border border-border">
                    <img src={socketState.qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                  <p className="text-sm font-medium text-center text-muted-foreground animate-pulse">
                    يرجى مسح الرمز باستخدام تطبيق واتساب
                  </p>
                </div>
              ) : showPhoneInput ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  <Label className="self-start text-sm">رقم الهاتف (بمفتاح الدولة)</Label>
                  <Input 
                    placeholder="+9665XXXXXXXX" 
                    value={phoneNumber} 
                    onChange={e => setPhoneNumber(e.target.value)}
                    dir="ltr"
                    className="text-center text-lg font-bold"
                  />
                  <div className="flex gap-2 w-full">
                    <Button variant="outline" className="flex-1" onClick={() => setShowPhoneInput(false)}>إلغاء</Button>
                    <Button className="flex-1" onClick={() => connectMutation.mutate({ method: 'phone', phoneNumber })}>طلب الرمز</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                    <Smartphone className="w-10 h-10" />
                  </div>
                  <h3 className="text-lg font-bold text-muted-foreground">غير متصل</h3>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 bg-muted/20 p-4">
              {socketState.connectionStatus !== 'connected' && !showPhoneInput && !socketState.pairingCode && (
                <>
                  <Button 
                    onClick={() => connectMutation.mutate({ method: 'qr' })} 
                    disabled={connectMutation.isPending || socketState.connectionStatus === 'connecting'}
                    className="w-full"
                    data-testid="button-connect-qr"
                  >
                    {socketState.connectionStatus === 'connecting' && !socketState.pairingCode ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 ms-2" />}
                    ربط عبر رمز QR
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setShowPhoneInput(true)}
                    disabled={connectMutation.isPending || socketState.connectionStatus === 'connecting'}
                    className="w-full"
                  >
                    ربط عبر رقم الهاتف
                  </Button>
                </>
              )}
              
                {(socketState.connectionStatus === 'connected' || socketState.pairingCode) && (
                  <Button 
                    variant="destructive" 
                    onClick={handleLogout}
                    disabled={logoutMutation.isPending}
                    className="w-full"
                  >
                    <LogOut className="w-4 h-4 ms-2" />
                    {socketState.connectionStatus === 'connected' ? 'تسجيل الخروج' : 'إلغاء وطلب رمز جديد'}
                  </Button>
                )}
            </CardFooter>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                إحصائيات الإرسال
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{socketState.stats.sent}</span>
                <span className="text-sm font-semibold text-emerald-600/70 dark:text-emerald-400/70 mt-1">رسالة ناجحة</span>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <XCircle className="w-8 h-8 text-rose-500 mb-2" />
                <span className="text-3xl font-extrabold text-rose-600 dark:text-rose-400">{socketState.stats.errors}</span>
                <span className="text-sm font-semibold text-rose-600/70 dark:text-rose-400/70 mt-1">رسالة فاشلة</span>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column (Controls & Forms) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Sending & Settings Card */}
          <MonitoringAndSendCard 
            settings={currentSettings} 
            socketState={socketState}
            startMonitoring={startMonitoring}
            stopMonitoring={stopMonitoring}
          />

          {/* Auto Join Card */}
          <AutoJoinCard joinProgress={socketState.joinProgress} joinStats={socketState.joinStats} />

        </div>

        {/* Logs Section - Full Width */}
        <div className="lg:col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Operations Log */}
          <Card className="h-[400px] flex flex-col">
            <CardHeader className="py-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-500" />
                  سجل العمليات
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={clearLogs} className="h-8 text-xs">
                  مسح السجل
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-0 bg-slate-950 text-emerald-400 font-mono text-sm" dir="ltr">
              <div className="p-4 flex flex-col gap-1.5">
                {socketState.logs.length === 0 ? (
                  <div className="text-slate-600 italic text-center mt-10">No logs yet...</div>
                ) : (
                  socketState.logs.map((log) => (
                    <div key={log.id} className="border-b border-slate-800/50 pb-1 flex gap-3 hover:bg-slate-900/50 px-2 rounded">
                      <span className="text-slate-500 whitespace-nowrap">[{log.timestamp.toLocaleTimeString()}]</span>
                      <span className="break-words" dir="rtl">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Alerts Log */}
          <Card className="h-[400px] flex flex-col border-rose-500/20">
            <CardHeader className="py-4 bg-rose-500/5">
              <CardTitle className="text-lg flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-5 h-5" />
                تنبيهات المراقبة
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-muted/10">
              {socketState.alerts.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                  <ShieldAlert className="w-12 h-12 opacity-20" />
                  <p>لا توجد تنبيهات حالياً</p>
                </div>
              ) : (
                socketState.alerts.map((alert, idx) => (
                  <div key={idx} className="bg-card border border-rose-200 dark:border-rose-900/50 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-1 h-full bg-rose-500"></div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="inline-flex items-center rounded-md bg-rose-100 dark:bg-rose-900/30 px-2 py-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                        {alert.keyword}
                      </span>
                      <span className="text-xs text-muted-foreground">{alert.timestamp}</span>
                    </div>
                    <div className="font-semibold text-sm mb-1 text-foreground">{alert.group} <span className="text-muted-foreground font-normal text-xs">({alert.sender})</span></div>
                    <p className="text-sm text-foreground/80 bg-muted/50 p-2 rounded-lg mt-2 border border-border/50">
                      {alert.message}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

      </main>
    </div>
  );
}

// --- Sub Components ---

function MonitoringAndSendCard({ settings, socketState, startMonitoring, stopMonitoring }: any) {
  const saveMutation = useSaveSettings();
  const sendMutation = useSendNow();
  
  const [formData, setFormData] = useState({
    message: settings?.message || '',
    groups: (settings?.groups || []).join('\n'),
    watch_words: (settings?.watchWords || []).join('\n'),
    interval_seconds: settings?.intervalSeconds || 3600,
    loop_interval_seconds: settings?.loopIntervalSeconds || 0,
    send_type: settings?.sendType || 'manual',
  });

  const [images, setImages] = useState<{data: string, type: string}[]>([]);

  // Sync when settings prop changes (from initial load)
  useEffect(() => {
    if (settings) {
      setFormData({
        message: settings.message || '',
        groups: (settings.groups || []).join('\n'),
        watch_words: (settings.watchWords || []).join('\n'),
        interval_seconds: settings.intervalSeconds || 3600,
        loop_interval_seconds: settings.loopIntervalSeconds || 0,
        send_type: settings.sendType || 'manual',
      });
    }
  }, [settings]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    Promise.all(files.map(file => {
      return new Promise<{data: string, type: string}>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          resolve({ data: ev.target?.result as string, type: file.type });
        };
        reader.readAsDataURL(file);
      });
    })).then(results => {
      setImages(prev => [...prev, ...results]);
    });
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleSend = () => {
    sendMutation.mutate({
      message: formData.message,
      groups: formData.groups,
      images: images.length > 0 ? images : undefined
    });
  };

  return (
    <Card className="border-t-4 border-t-blue-500 h-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-500" />
            إعدادات الإرسال والمراقبة
          </CardTitle>
          <div className="flex gap-2 bg-muted p-1 rounded-lg">
            {!socketState.isRunning ? (
              <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100" onClick={startMonitoring}>
                <Play className="w-4 h-4 ms-1" /> تشغيل المراقبة
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-100" onClick={stopMonitoring}>
                <Square className="w-4 h-4 ms-1" /> إيقاف المراقبة
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>رسالة البث</Label>
            <Textarea 
              rows={5} 
              placeholder="اكتب الرسالة هنا..." 
              value={formData.message}
              onChange={e => setFormData({...formData, message: e.target.value})}
              className="bg-muted/20"
            />
            
            <div className="mt-4 border-2 border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/50 transition-colors relative">
              <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleImageUpload} />
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <span className="text-sm font-medium text-muted-foreground">اضغط لرفع صور (اختياري)</span>
            </div>
            
            {images.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-2">
                {images.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group shrink-0">
                    <img src={img.data} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setImages(imgs => imgs.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <XCircle className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>مجموعات الإرسال (رابط أو JID - كل واحد في سطر)</Label>
              <Textarea 
                rows={3} 
                placeholder="https://chat.whatsapp.com/...&#10;123456789@g.us" 
                value={formData.groups}
                onChange={e => setFormData({...formData, groups: e.target.value})}
                className="bg-muted/20"
                dir="ltr"
              />
            </div>
            
            <div className="space-y-2">
              <Label>نوع الإرسال</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary"
                value={formData.send_type}
                onChange={e => setFormData({...formData, send_type: e.target.value})}
              >
                <option value="manual">يدوي</option>
                <option value="scheduled">مجدول (تلقائي)</option>
              </select>
            </div>

            {formData.send_type === 'scheduled' && (
              <div className="space-y-2">
                <Label>فترة الانتظار بين الدورات (بالثواني)</Label>
                <Input 
                  type="number" 
                  value={formData.loop_interval_seconds}
                  onChange={e => setFormData({...formData, loop_interval_seconds: parseInt(e.target.value) || 0})}
                  placeholder="مثال: 3600 لساعة واحدة"
                />
                <p className="text-xs text-muted-foreground">بعد انتهاء الإرسال لكل المجموعات، سيتوقف النظام هذه المدة ثم يبدأ من جديد.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="w-4 h-4" />
                كلمات المراقبة (كل كلمة في سطر)
              </Label>
              <Textarea 
                rows={3} 
                placeholder="مطلوب&#10;بحث&#10;مساعدة" 
                value={formData.watch_words}
                onChange={e => setFormData({...formData, watch_words: e.target.value})}
                className="border-rose-200 focus-visible:ring-rose-500/20 focus-visible:border-rose-500 bg-rose-50/30"
              />
            </div>
          </div>
        </div>

      </CardContent>
      <CardFooter className="flex justify-between gap-4 border-t border-border/50 pt-6">
        <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 md:flex-none">
          <Save className="w-4 h-4 ms-2" />
          حفظ الإعدادات
        </Button>
        <Button 
          onClick={handleSend} 
          disabled={sendMutation.isPending || socketState.connectionStatus !== 'connected'}
          className="flex-1 md:w-48 bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 border-0"
        >
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 ms-2 animate-spin" /> : <Send className="w-4 h-4 ms-2" />}
          إرسال الآن
        </Button>
      </CardFooter>
    </Card>
  );
}

function AutoJoinCard({ joinProgress, joinStats }: any) {
  const [text, setText] = useState('');
  const [links, setLinks] = useState<any[]>([]);
  
  const extractMutation = useExtractLinks();
  const joinMutation = useAutoJoin();

  const handleExtract = () => {
    extractMutation.mutate(text, {
      onSuccess: (data) => {
        if (data.links && data.links.length > 0) {
          setLinks(data.links.filter((l: any) => l.type === 'invite'));
        }
      }
    });
  };

  const handleJoin = () => {
    joinMutation.mutate({ links });
  };

  return (
    <Card className="border-t-4 border-t-amber-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-amber-500" />
          الانضمام التلقائي للمجموعات
        </CardTitle>
        <CardDescription>الصق نصاً يحتوي على روابط دعوة لاستخراجها والانضمام إليها تباعاً</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        <Textarea 
          rows={3} 
          placeholder="الصق النص هنا..." 
          value={text}
          onChange={e => setText(e.target.value)}
        />
        
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleExtract} disabled={!text || extractMutation.isPending} className="flex-1">
            {extractMutation.isPending ? <Loader2 className="w-4 h-4 ms-2 animate-spin" /> : 'استخراج الروابط'}
          </Button>
        </div>

        {links.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 mt-4">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-amber-700 dark:text-amber-500">تم العثور على {links.length} رابط دعوة</span>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleJoin} disabled={joinMutation.isPending}>
                {joinMutation.isPending ? <Loader2 className="w-4 h-4 ms-2 animate-spin" /> : 'بدء الانضمام'}
              </Button>
            </div>
            
            {joinProgress && (
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>جاري الانضمام ({joinProgress.current}/{joinProgress.total})</span>
                  <span>{Math.round((joinProgress.current / joinProgress.total) * 100)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${(joinProgress.current / joinProgress.total) * 100}%` }}></div>
                </div>
              </div>
            )}
            
            {joinStats && (
              <div className="flex gap-4 text-xs font-semibold mt-2 justify-center bg-white/50 dark:bg-black/20 p-2 rounded-lg">
                <span className="text-emerald-600">نجاح: {joinStats.success}</span>
                <span className="text-rose-600">فشل: {joinStats.fail}</span>
                <span className="text-blue-600">منضم مسبقاً: {joinStats.already_joined}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
