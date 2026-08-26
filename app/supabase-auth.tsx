"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- A full document navigation avoids vinext account-route interception. */

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { SupabasePublicConfig } from "@/lib/auth-provider";
import { WardrobeApp } from "./wardrobe-app";
import { PublicLanding } from "./public-landing";
import { AccountClient } from "./account/account-client";

type SessionState =
  | { status: "loading" | "syncing"; session: null; error: null }
  | { status: "signed-out"; session: null; error: string | null }
  | { status: "ready"; session: Session; error: null };

function useMuseSupabase(config: SupabasePublicConfig) {
  const supabase = useMemo(
    () => createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
    [config.publishableKey, config.url],
  );
  const [state, setState] = useState<SessionState>({ status: "loading", session: null, error: null });
  const syncSequence = useRef(0);

  const syncSession = useCallback(async (session: Session | null) => {
    const sequence = ++syncSequence.current;
    if (!session) {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
      if (sequence === syncSequence.current) setState({ status: "signed-out", session: null, error: null });
      return;
    }
    setState({ status: "syncing", session: null, error: null });
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("登录身份校验失败，请重新登录。");
      if (sequence === syncSequence.current) setState({ status: "ready", session, error: null });
    } catch (error) {
      if (sequence === syncSequence.current) {
        setState({ status: "signed-out", session: null, error: error instanceof Error ? error.message : "登录暂时不可用。" });
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setState({ status: "signed-out", session: null, error: "无法读取登录状态，请重试。" });
      else void syncSession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { if (active) void syncSession(session); }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, syncSession]);

  const signOut = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.is_anonymous) {
      await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      }).catch(() => undefined);
    }
    await supabase.auth.signOut().catch(() => undefined);
    await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    setState({ status: "signed-out", session: null, error: null });
  }, [supabase]);

  return { supabase, state, signOut };
}

function SupabaseLoading({ label = "正在安全连接你的衣柜…" }: { label?: string }) {
  return <main className="auth-loading"><span className="brand-mark">M</span><p>{label}</p></main>;
}

function identityFromSession(session: Session) {
  const metadata = session.user.user_metadata as Record<string, unknown>;
  const displayName = [metadata.full_name, metadata.name, session.user.email]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? "Muse 用户";
  return { displayName, email: session.user.email ?? "" };
}

function SupabaseLogin({
  client,
  config,
  initialError,
}: {
  client: SupabaseClient;
  config: SupabasePublicConfig;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError ?? "");

  async function emailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage("");
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/`, shouldCreateUser: true },
    });
    setBusy(false);
    setMessage(error ? `发送失败：${error.message}` : "登录链接已发送，请到邮箱中点击完成登录。若没看到，请检查垃圾邮件。" );
  }

  async function googleLogin() {
    setBusy(true);
    setMessage("");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setBusy(false);
      setMessage(`Google 登录失败：${error.message}`);
    }
  }

  async function guestLogin() {
    setBusy(true);
    setMessage("正在创建独立游客衣柜…");
    const { error } = await client.auth.signInAnonymously({
      options: { data: { full_name: "Muse 游客" } },
    });
    if (error) {
      setBusy(false);
      setMessage(`游客登录失败：${error.message}`);
    }
  }

  const loginForm = (
    <div className="supabase-login-card">
      <form onSubmit={(event) => void emailLogin(event)}>
        <label htmlFor="login-email">邮箱登录</label>
        <div><input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /><button className="primary-button" disabled={busy}>{busy ? "发送中…" : "发送登录链接"}</button></div>
      </form>
      <button className="guest-button" disabled={busy} onClick={() => void guestLogin()}>
        {busy ? "正在进入…" : "无需邮箱，直接游客体验"}
      </button>
      {config.googleEnabled && <button className="oauth-button" disabled={busy} onClick={() => void googleLogin()}>使用 Google 登录</button>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </div>
  );

  return (
    <PublicLanding
      navAction={<a className="secondary-button" href="#login-email">登录</a>}
      primaryAction={loginForm}
      loginNote="使用 Supabase 安全登录；游客拥有独立临时空间，退出时自动删除游客数据。"
    />
  );
}

export function SupabaseHome({ config }: { config: SupabasePublicConfig }) {
  const { supabase, state, signOut } = useMuseSupabase(config);
  if (state.status === "loading" || state.status === "syncing") return <SupabaseLoading />;
  if (state.status === "signed-out") return <SupabaseLogin client={supabase} config={config} initialError={state.error} />;
  if (!state.session) return <SupabaseLoading />;
  return <WardrobeApp user={{ ...identityFromSession(state.session), onSignOut: signOut }} />;
}

export function SupabaseAccount({ config }: { config: SupabasePublicConfig }) {
  const { state, signOut } = useMuseSupabase(config);
  if (state.status === "loading" || state.status === "syncing") return <SupabaseLoading label="正在读取账户与隐私设置…" />;
  if (state.status === "signed-out") {
    return <main className="auth-loading"><span className="brand-mark">M</span><p>请先登录后查看账户设置。</p><form action="/" method="get"><button className="primary-button" type="submit">返回登录</button></form></main>;
  }
  return (
    <main className="account-page">
      <nav className="account-nav">
        <a className="mobile-brand" href="/"><span className="brand-mark">M</span>Muse Closet</a>
        <div><form action="/" method="get"><button type="submit">返回衣柜</button></form><button onClick={() => void signOut()}>退出登录</button></div>
      </nav>
      <header className="account-header"><p className="eyebrow">CONTROL YOUR DATA</p><h1>账户与隐私</h1><p>查看用量、控制AI图片处理，并随时删除你的全部数据。</p></header>
      <AccountClient signOutPath="/" onSignOut={signOut} />
    </main>
  );
}
