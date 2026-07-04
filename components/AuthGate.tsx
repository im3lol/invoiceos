"use client";

import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import InvoiceOS from "./InvoiceOS";

export default function AuthGate() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <Splash label="Loading…" />;
  // No Supabase configured → run without auth (localStorage fallback).
  if (!supabase) return <InvoiceOS />;
  if (!session) return <Login />;
  return <InvoiceOS key={session.user.id} userEmail={session.user.email || ""} onSignOut={() => supabase!.auth.signOut()} />;
}

function Splash({ label }: { label: string }) {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa3b5", fontWeight: 700, fontSize: 14, background: "#eaf0fb" }}>
      {label}
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase!.auth.signUp({ email, password: pass });
        if (error) throw error;
        if (!data.session) {
          // New signups are auto-confirmed (DB trigger), so sign straight in.
          const { error: e2 } = await supabase!.auth.signInWithPassword({ email, password: pass });
          if (e2) setMsg("Account created. Check your email to confirm, then sign in.");
        }
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eaf0fb", padding: 20 }}>
      <form onSubmit={submit} style={{ width: 380, background: "#fff", borderRadius: 18, padding: 30, boxShadow: "0 24px 60px rgba(20,30,60,.14)", border: "1px solid #eef1f7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#2f6bed", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 19 }}>I</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-.3px" }}>InvoiceOS</div>
            <div style={{ fontSize: 10.5, color: "#9aa3b5", fontWeight: 600, letterSpacing: ".3px" }}>SELLER SUITE</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#7c8598", fontWeight: 600, margin: "14px 0 18px" }}>
          {mode === "in" ? "Sign in to your account." : "Create your account — your data stays private to you."}
        </div>

        <label style={lbl}>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={fld} />
        <label style={lbl}>Password</label>
        <input type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" style={fld} />

        {err && <div style={{ color: "#d64545", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{err}</div>}
        {msg && <div style={{ color: "#1f9d63", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{msg}</div>}

        <button type="submit" disabled={busy} style={{ width: "100%", border: "none", background: "#2f6bed", color: "#fff", fontWeight: 800, fontSize: 14, padding: 12, borderRadius: 10, cursor: "pointer", opacity: busy ? 0.6 : 1, marginTop: 4 }}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12.5, color: "#7c8598", fontWeight: 600, marginTop: 16 }}>
          {mode === "in" ? "No account yet?" : "Already have an account?"}{" "}
          <span onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setMsg(""); }} style={{ color: "#2f6bed", fontWeight: 800, cursor: "pointer" }}>
            {mode === "in" ? "Create one" : "Sign in"}
          </span>
        </div>
      </form>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 11, color: "#9aa3b5", fontWeight: 700, marginBottom: 5 };
const fld: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f5", borderRadius: 9, fontSize: 13, fontWeight: 600, marginBottom: 14 };
