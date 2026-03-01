import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

// Helper to log and parse Zod responses
function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw new Error(`Invalid response from server for ${label}`);
  }
  return result.data;
}

export function useInit() {
  return useQuery({
    queryKey: [api.init.path],
    queryFn: async () => {
      const res = await fetch(api.init.path);
      if (!res.ok) throw new Error("Failed to initialize");
      return parseWithLogging(api.init.responses[200], await res.json(), "init");
    },
  });
}

export function useConnect() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: { method: "qr" | "phone", phoneNumber?: string }) => {
      const payload = api.connect.input.parse(data);
      const res = await fetch(api.connect.path, { 
        method: api.connect.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to initiate connection");
      return parseWithLogging(api.connect.responses[200], await res.json(), "connect");
    },
    onSuccess: (data) => {
      toast({ title: "جاري الاتصال", description: data.message });
      queryClient.invalidateQueries({ queryKey: [api.init.path] });
    },
    onError: () => toast({ variant: "destructive", title: "خطأ", description: "فشل في بدء الاتصال" })
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.logout.path, { method: api.logout.method });
      if (!res.ok) throw new Error("Failed to logout");
      return parseWithLogging(api.logout.responses[200], await res.json(), "logout");
    },
    onSuccess: (data) => {
      toast({ title: "تم تسجيل الخروج", description: data.message });
      queryClient.invalidateQueries({ queryKey: [api.init.path] });
    },
  });
}

export function useSwitchUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const payload = api.switchUser.input.parse({ userId });
      const res = await fetch(api.switchUser.path, {
        method: api.switchUser.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to switch user");
      return parseWithLogging(api.switchUser.responses[200], await res.json(), "switchUser");
    },
    onSuccess: (data) => {
      toast({ title: "تم التبديل", description: data.message });
      queryClient.invalidateQueries({ queryKey: [api.init.path] });
    },
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: z.infer<typeof api.saveSettings.input>) => {
      const payload = api.saveSettings.input.parse(settings);
      const res = await fetch(api.saveSettings.path, {
        method: api.saveSettings.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return parseWithLogging(api.saveSettings.responses[200], await res.json(), "saveSettings");
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ", description: "تم حفظ الإعدادات بنجاح" });
      queryClient.invalidateQueries({ queryKey: [api.init.path] });
    },
  });
}

export function useSendNow() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.sendNow.input>) => {
      const payload = api.sendNow.input.parse(data);
      const res = await fetch(api.sendNow.path, {
        method: api.sendNow.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return parseWithLogging(api.sendNow.responses[200], await res.json(), "sendNow");
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "جاري الإرسال", description: data.message });
      } else {
        toast({ variant: "destructive", title: "خطأ", description: data.message });
      }
    },
  });
}

export function useExtractLinks() {
  return useMutation({
    mutationFn: async (text: string) => {
      const payload = api.extractLinks.input.parse({ text });
      const res = await fetch(api.extractLinks.path, {
        method: api.extractLinks.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to extract links");
      return parseWithLogging(api.extractLinks.responses[200], await res.json(), "extractLinks");
    },
  });
}

export function useAutoJoin() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: z.infer<typeof api.autoJoin.input>) => {
      const payload = api.autoJoin.input.parse(data);
      const res = await fetch(api.autoJoin.path, {
        method: api.autoJoin.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to start auto join");
      return parseWithLogging(api.autoJoin.responses[200], await res.json(), "autoJoin");
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "بدء الانضمام", description: data.message });
      } else {
        toast({ variant: "destructive", title: "خطأ", description: data.message });
      }
    }
  });
}
