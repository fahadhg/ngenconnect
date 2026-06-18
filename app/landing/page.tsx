"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

/* ─── Animated counter ───────────────────────────────────────────────────── */
function useCounter(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCount(Math.floor(ease * target));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setCount(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return { count, activate: () => setActive(true) };
}

/* ─── Intersection observer hook ─────────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ─── Stat counter block ─────────────────────────────────────────────────── */
function StatCounter({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, inView } = useInView(0.3);
  const { count, activate } = useCounter(value);
  useEffect(() => { if (inView) activate(); }, [inView]);
  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl font-black font-display text-white mb-2 tabular-nums">
        {count.toLocaleString()}<span className="text-[#FF6B35]">{suffix}</span>
      </div>
      <div className="text-sm text-gray-400 font-medium tracking-wide">{label}</div>
    </div>
  );
}

/* ─── Scroll-reveal wrapper ──────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Feature card ───────────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, delay }: { icon: React.ReactNode; title: string; desc: string; delay: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Reveal delay={delay}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden cursor-default group"
        style={{ transition: "border-color 0.3s, transform 0.3s, box-shadow 0.3s", transform: hovered ? "translateY(-4px)" : "none", boxShadow: hovered ? "0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,107,53,0.3)" : "none", borderColor: hovered ? "rgba(255,107,53,0.4)" : "rgba(255,255,255,0.1)" }}
      >
        {/* Glow on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,107,53,0.08) 0%, transparent 70%)" }} />
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/20 flex items-center justify-center mb-5 text-[#FF6B35]" style={{ transition: "background 0.3s", background: hovered ? "rgba(255,107,53,0.15)" : "rgba(255,107,53,0.1)" }}>
            {icon}
          </div>
          <h3 className="text-lg font-bold text-white mb-3 font-display">{title}</h3>
          <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
        </div>
      </div>
    </Reveal>
  );
}

/* ─── Animated search mockup ─────────────────────────────────────────────── */
function SearchMockup() {
  const { ref, inView } = useInView(0.2);
  const queries = [
    "AS9100 aerospace machining titanium Ontario",
    "3D printing metal parts Quebec",
    "CNC machining stainless steel Alberta",
    "AI quality inspection automotive",
  ];
  const [qIdx, setQIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "pause" | "erasing">("typing");

  useEffect(() => {
    if (!inView) return;
    let timeout: ReturnType<typeof setTimeout>;
    const current = queries[qIdx];
    if (phase === "typing") {
      if (typed.length < current.length) {
        timeout = setTimeout(() => setTyped(current.slice(0, typed.length + 1)), 45);
      } else {
        timeout = setTimeout(() => setPhase("pause"), 1800);
      }
    } else if (phase === "pause") {
      timeout = setTimeout(() => setPhase("erasing"), 400);
    } else {
      if (typed.length > 0) {
        timeout = setTimeout(() => setTyped(typed.slice(0, -1)), 20);
      } else {
        setQIdx((i) => (i + 1) % queries.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [inView, typed, phase, qIdx]);

  const results = [
    { name: "Precision ADM", province: "Ontario", score: 96, tags: ["AS9100D", "Titanium", "LPBF"] },
    { name: "Applied Precision 3D", province: "Ontario", score: 91, tags: ["SLS", "FDM", "Aerospace"] },
    { name: "Canadian Additive Mfg", province: "Ontario", score: 87, tags: ["Metal", "Ceramics", "Nuclear"] },
  ];

  return (
    <div
      ref={ref}
      style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(40px)", transition: "opacity 0.8s ease, transform 0.8s ease" }}
      className="relative mx-auto max-w-2xl"
    >
      {/* Browser chrome */}
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl" style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)" }}>
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <div className="flex-1 mx-3">
            <div className="bg-white/5 border border-white/10 rounded-md px-3 py-1 text-xs text-gray-400 text-center">ngen-connect.vercel.app</div>
          </div>
        </div>
        {/* App content */}
        <div className="p-5">
          {/* Search bar */}
          <div className="flex gap-2 mb-5">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <span className="flex-1 min-h-[1.25rem]">{typed}<span className="inline-block w-0.5 h-4 bg-[#FF6B35] ml-0.5 animate-pulse" /></span>
            </div>
            <div className="px-4 py-2.5 bg-[#FF6B35] rounded-xl text-sm font-semibold text-white flex-shrink-0">Search</div>
          </div>
          {/* Results */}
          <div className="space-y-2.5">
            {results.map((r, i) => (
              <div key={r.name} className="flex items-center gap-3 p-3.5 rounded-xl border border-white/8 hover:border-[#FF6B35]/30 transition-colors" style={{ background: "rgba(255,255,255,0.03)", animationDelay: `${i * 100}ms` }}>
                <div className="w-8 h-8 rounded-lg bg-[#FF6B35]/10 border border-[#FF6B35]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-black text-[#FF6B35]">#{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white">{r.name}</span>
                    <span className="text-[10px] font-bold text-[#FF6B35] bg-[#FF6B35]/10 px-1.5 py-0.5 rounded">NGen</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {r.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">{t}</span>)}
                    <span className="text-[10px] text-gray-500">{r.province}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="text-lg font-black text-emerald-400">{r.score}<span className="text-xs font-semibold text-gray-500">%</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Floating glow */}
      <div className="absolute -inset-8 -z-10 rounded-3xl opacity-20" style={{ background: "radial-gradient(circle, rgba(255,107,53,0.4) 0%, transparent 70%)", filter: "blur(40px)" }} />
    </div>
  );
}

/* ─── Marquee strip ──────────────────────────────────────────────────────── */
const SECTORS = ["Aerospace", "Automotive", "Medical Devices", "Industrial Equipment", "Clean Energy", "Defence", "Mining", "Robotics & Automation", "AI & Software", "Advanced Materials", "Additive Manufacturing", "Electronics"];
function Marquee() {
  return (
    <div className="relative overflow-hidden py-4">
      <div className="flex" style={{ animation: "marquee 30s linear infinite" }}>
        {[...SECTORS, ...SECTORS].map((s, i) => (
          <div key={i} className="flex-shrink-0 mx-4 px-5 py-2 rounded-full border border-white/10 bg-white/4 text-sm text-gray-300 font-medium whitespace-nowrap">
            {s}
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 w-24 pointer-events-none" style={{ background: "linear-gradient(to right, #0A1628, transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-24 pointer-events-none" style={{ background: "linear-gradient(to left, #0A1628, transparent)" }} />
    </div>
  );
}

/* ─── Main landing page ──────────────────────────────────────────────────── */
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <>
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes float1 { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(40px,-30px) scale(1.05) } 66% { transform: translate(-20px,20px) scale(0.97) } }
        @keyframes float2 { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(-30px,40px) scale(1.03) } 66% { transform: translate(25px,-25px) scale(0.98) } }
        @keyframes float3 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(20px,30px) } }
        @keyframes gridPulse { 0%,100% { opacity: 0.03 } 50% { opacity: 0.06 } }
        @keyframes spin-slow { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes dash { to { stroke-dashoffset: -40 } }
      `}</style>

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300" style={{ background: scrolled ? "rgba(10,22,40,0.95)" : "transparent", backdropFilter: scrolled ? "blur(20px)" : "none", borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF6B35] flex items-center justify-center">
              <span className="text-white font-black text-sm">N</span>
            </div>
            <span className="font-display font-bold text-white text-lg">NGen <span className="text-[#FF6B35]">Connect</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#stats" className="hover:text-white transition-colors">About</a>
          </div>
          <Link href="/" className="px-5 py-2 bg-[#FF6B35] hover:bg-orange-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25">
            Get Access →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute" style={{ top: "10%", left: "15%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,107,53,0.12) 0%, transparent 70%)", animation: "float1 18s ease-in-out infinite", filter: "blur(40px)" }} />
          <div className="absolute" style={{ top: "40%", right: "10%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,16,46,0.08) 0%, transparent 70%)", animation: "float2 22s ease-in-out infinite", filter: "blur(50px)" }} />
          <div className="absolute" style={{ bottom: "10%", left: "35%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 70%)", animation: "float3 15s ease-in-out infinite", filter: "blur(30px)" }} />
          {/* Grid */}
          <svg className="absolute inset-0 w-full h-full" style={{ animation: "gridPulse 6s ease-in-out infinite" }}>
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#FF6B35]/30 bg-[#FF6B35]/8 mb-8" style={{ animation: "fadeIn 0.6s ease forwards" }}>
            <div className="w-2 h-2 rounded-full bg-[#FF6B35]" style={{ animation: "pulse 2s infinite" }} />
            <span className="text-xs font-semibold text-[#FF6B35] tracking-wider uppercase">Powered by AI · Canadian Industry 4.0</span>
          </div>

          {/* Headline */}
          <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight mb-6" style={{ animation: "slideUp 0.7s ease 0.1s both" }}>
            Canada's AI<br />
            <span style={{ background: "linear-gradient(135deg, #FF6B35 0%, #ff9a6b 40%, #FF6B35 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundSize: "200% auto", animation: "gradientShift 4s linear infinite" }}>Manufacturing</span>
            <style>{`@keyframes gradientShift { to { background-position: 200% center }}`}</style>
            <br />Network
          </h1>

          {/* Subtext */}
          <p className="text-gray-400 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10" style={{ animation: "slideUp 0.7s ease 0.2s both" }}>
            Instantly connect with 1,000+ Canadian manufacturers, suppliers, and Industry 4.0 technology providers using natural language AI search.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center" style={{ animation: "slideUp 0.7s ease 0.3s both" }}>
            <Link href="/" className="group px-8 py-4 bg-[#FF6B35] hover:bg-orange-500 text-white font-bold rounded-2xl text-base transition-all duration-200 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-105 flex items-center gap-2 justify-center">
              Start Searching
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <a href="#features" className="px-8 py-4 border border-white/15 hover:border-white/30 text-white font-semibold rounded-2xl text-base transition-all duration-200 hover:bg-white/5 flex items-center gap-2 justify-center">
              See Features
            </a>
          </div>

          {/* Floating stats */}
          <div className="grid grid-cols-3 gap-4 mt-16 max-w-lg mx-auto" style={{ animation: "slideUp 0.7s ease 0.4s both" }}>
            {[["1,000+", "Companies"], ["12", "Provinces"], ["35+", "Sectors"]].map(([val, label]) => (
              <div key={label} className="p-4 rounded-xl border border-white/8 bg-white/4 backdrop-blur-sm">
                <div className="text-2xl font-black font-display text-white">{val}</div>
                <div className="text-xs text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, #0A1628)" }} />
      </section>

      {/* ── Marquee ── */}
      <section className="py-8 border-y border-white/8">
        <p className="text-center text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5">Industries covered</p>
        <Marquee />
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF6B35]/20 bg-[#FF6B35]/8 text-[#FF6B35] text-xs font-semibold uppercase tracking-wider mb-5">Features</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-white mb-4">Everything you need to<br />find the right partner</h2>
              <p className="text-gray-400 text-lg max-w-xl mx-auto">From AI-powered search to real-time trade intelligence — built for Canadian manufacturing professionals.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard delay={0} title="AI-Powered Search" desc="Describe what you need in plain language. Our semantic AI searches 1,000+ companies and returns the most relevant matches with detailed capability analysis." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} />
            <FeatureCard delay={80} title="Trade Intelligence" desc="Real-time tariff exposure analysis, FTA coverage, and bilateral trade data for every country Canada does business with. Know your risk before you export." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064" /></svg>} />
            <FeatureCard delay={160} title="Comparative Analysis" desc="Get AI-generated side-by-side comparisons. Ask follow-up questions about your results — the system keeps context across the entire conversation." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" /></svg>} />
            <FeatureCard delay={240} title="Company Map" desc="Visualize the entire Canadian manufacturing ecosystem geographically. Filter by sector, capability, or certification and see where expertise is concentrated." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4" /></svg>} />
            <FeatureCard delay={320} title="Trade Events" desc="Stay ahead of Canadian trade missions, international summits, and trade shows. Enriched with bilateral trade data and FTA coverage for every country involved." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
            <FeatureCard delay={400} title="Smart Filters" desc="Narrow results by sector, capabilities, certifications, materials, province, and company size. Cascading filters automatically surface what's relevant." icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>} />
          </div>
        </div>
      </section>

      {/* ── Product preview ── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF6B35]/20 bg-[#FF6B35]/8 text-[#FF6B35] text-xs font-semibold uppercase tracking-wider mb-5">Live Preview</div>
              <h2 className="font-display font-black text-4xl text-white mb-4">See it in action</h2>
              <p className="text-gray-400 text-base max-w-md mx-auto">Natural language search that understands manufacturing context.</p>
            </div>
          </Reveal>
          <SearchMockup />
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-28 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF6B35]/20 bg-[#FF6B35]/8 text-[#FF6B35] text-xs font-semibold uppercase tracking-wider mb-5">Process</div>
              <h2 className="font-display font-black text-4xl sm:text-5xl text-white mb-4">Three steps to your<br />perfect match</h2>
            </div>
          </Reveal>

          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-8 top-8 bottom-8 w-px hidden md:block" style={{ background: "linear-gradient(to bottom, #FF6B35, rgba(255,107,53,0.1))" }} />

            <div className="space-y-8">
              {[
                { n: "01", title: "Describe your need", desc: "Type what you're looking for in plain language — no keywords, no Boolean operators. 'Titanium machining for aerospace with AS9100 cert in Ontario' works perfectly." },
                { n: "02", title: "AI searches & ranks", desc: "Your query is embedded using Google's Gemini model and matched against 1,000+ companies using cosine similarity. The top matches are returned in milliseconds." },
                { n: "03", title: "Get a detailed analysis", desc: "Claude Sonnet reads the matched companies and writes a structured analysis: what differentiates each one, which best fits your specific context, and actionable next steps." },
              ].map(({ n, title, desc }, i) => (
                <Reveal key={n} delay={i * 120}>
                  <div className="flex gap-6 md:gap-10">
                    <div className="flex-shrink-0 w-16 h-16 rounded-2xl border border-[#FF6B35]/30 bg-[#FF6B35]/8 flex items-center justify-center relative z-10">
                      <span className="font-display font-black text-lg text-[#FF6B35]">{n}</span>
                    </div>
                    <div className="pt-3">
                      <h3 className="font-display font-bold text-xl text-white mb-2">{title}</h3>
                      <p className="text-gray-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="py-24 px-6 border-y border-white/8">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
          <StatCounter value={1000} suffix="+" label="Companies in database" />
          <StatCounter value={12} suffix="" label="Provinces & territories" />
          <StatCounter value={35} suffix="+" label="Industry sectors" />
          <StatCounter value={5} suffix="" label="AI models supported" />
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <div className="relative rounded-3xl overflow-hidden p-12 text-center border border-[#FF6B35]/20" style={{ background: "linear-gradient(135deg, rgba(255,107,53,0.08) 0%, rgba(10,22,40,0.9) 50%, rgba(200,16,46,0.06) 100%)" }}>
              {/* Background glow */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 opacity-30" style={{ background: "radial-gradient(ellipse, #FF6B35 0%, transparent 70%)", filter: "blur(30px)" }} />
              </div>
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#FF6B35]/30 bg-[#FF6B35]/10 text-[#FF6B35] text-xs font-semibold uppercase tracking-wider mb-6">For NGen Members & Partners</div>
                <h2 className="font-display font-black text-4xl sm:text-5xl text-white mb-5 leading-tight">
                  Ready to find your<br />
                  <span style={{ background: "linear-gradient(135deg, #FF6B35, #ff9a6b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>next partner?</span>
                </h2>
                <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
                  Access the full Canadian Industry 4.0 database. Search, compare, and connect — all in one platform.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link href="/" className="group px-8 py-4 bg-[#FF6B35] hover:bg-orange-500 text-white font-bold rounded-2xl text-base transition-all duration-200 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-105 flex items-center gap-2 justify-center">
                    Open NGen Connect
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FF6B35] flex items-center justify-center">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <span className="font-display font-bold text-white">NGen <span className="text-[#FF6B35]">Connect</span></span>
          </div>
          <p className="text-xs text-gray-500">© 2026 NGen — Next Generation Manufacturing Canada. All rights reserved.</p>
          <Link href="/" className="text-xs text-gray-400 hover:text-white transition-colors">Launch App →</Link>
        </div>
      </footer>
    </>
  );
}
