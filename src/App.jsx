import { useState, useEffect, useRef } from "react";

// ── 持久化存储 ──────────────────────────────────────────
const STORAGE_KEY = "ctdp_state_v2";
function loadState() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

const DEFAULT_STATE = {
  symbol: "", symbolEmoji: "🎯",
  mainChain: [], auxChain: [],
  groupSize: 3, rules: [],
  totalFocusMin: 0, setupDone: false,
};

function formatTime(ts) {
  return new Date(ts).toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function pad(n) { return String(n).padStart(2, "0"); }

// ── 设计色板（Claude米白风格）──────────────────────────
const C = {
  bg:         "#f9f7f4",   // Claude 米白背景
  surface:    "#ffffff",   // 卡片白
  surface2:   "#f3f0ec",   // 次级背景
  border:     "#e8e2da",   // 描边
  borderHi:   "#d4c9be",   // 高亮描边
  blue:       "#4a90c4",   // 主题蓝
  blueLt:     "#e8f2fa",   // 浅蓝背景
  blueMid:    "#c5dff0",   // 中蓝
  green:      "#4a9c6d",   // 确认绿
  greenLt:    "#e8f5ee",   // 浅绿背景
  greenMid:   "#b8dfc8",
  red:        "#c0524a",   // 警告红
  redLt:      "#fdf0ef",
  redMid:     "#f0c0bb",
  text:       "#2d2926",   // 主文字（深暖棕）
  textSub:    "#6b5f55",   // 次要文字
  textMuted:  "#a89a8e",   // 更淡
  shadow:     "rgba(45,41,38,0.08)",
};

// ── 主应用 ─────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(() => loadState() || DEFAULT_STATE);
  const [screen, setScreen] = useState(state.setupDone ? "home" : "setup");
  const [timer, setTimer] = useState({ running: false, startTs: null });
  const [auxTimer, setAuxTimer] = useState({ active: false, startTs: null });
  const [modal, setModal] = useState(null);
  const [ruleText, setRuleText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [setupStep, setSetupStep] = useState(0);
  const [setupData, setSetupData] = useState({ name:"", emoji:"🎯" });
  const [tick, setTick] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);
  useEffect(() => {
    if (!auxTimer.active || !auxTimer.startTs) return;
    if ((Date.now() - auxTimer.startTs) / 1000 >= 900) {
      setAuxTimer({ active: false, startTs: null });
      setModal("aux_fail");
    }
  }, [tick, auxTimer]);

  const us = (fn) => setState(s => { const ns = fn(s); saveState(ns); return ns; });

  function activateSymbol() {
    if (auxTimer.active) setAuxTimer({ active: false, startTs: null });
    setTimer({ running: true, startTs: Date.now() });
  }
  function finishSession() {
    const mins = Math.max(1, Math.round((timer.startTs ? Date.now() - timer.startTs : 0) / 60000));
    setTimer({ running: false, startTs: null });
    const newNode = { id: state.mainChain.length + 1, time: Date.now(), duration: mins, note: noteText };
    us(s => ({ ...s, mainChain: [...s.mainChain, newNode], totalFocusMin: s.totalFocusMin + mins }));
    setNoteText("");
    if ((state.mainChain.length + 1) % state.groupSize === 0) setTimeout(() => setModal("celebrate"), 300);
  }
  function triggerVerdict() { setTimer(t => ({ ...t, running: false })); setModal("verdict"); }
  function verdictFail() {
    us(s => ({ ...s, mainChain: [], totalFocusMin: 0 }));
    setTimer({ running: false, startTs: null }); setModal(null);
  }
  function verdictAllow() { setModal("rule"); }
  function confirmRule() {
    if (!ruleText.trim()) return;
    us(s => ({ ...s, rules: [...s.rules, { text: ruleText.trim(), time: Date.now() }] }));
    setRuleText(""); setModal(null); setTimer({ running: false, startTs: null });
  }
  function triggerAux() { setAuxTimer({ active: true, startTs: Date.now() }); }
  function cancelAux() { setAuxTimer({ active: false, startTs: null }); }
  function auxFailVerdict(reset) {
    if (reset) us(s => ({ ...s, auxChain: [], mainChain: [], totalFocusMin: 0 }));
    else us(s => ({ ...s, rules: [...s.rules, { text: "预约后超时未开始任务", time: Date.now() }] }));
    setAuxTimer({ active: false, startTs: null }); setModal(null);
  }
  function deleteNode(id) {
    us(s => {
      const updated = s.mainChain.filter(n => n.id !== id);
      const totalMin = updated.reduce((acc, n) => acc + n.duration, 0);
      return { ...s, mainChain: updated, totalFocusMin: totalMin };
    });
  }
  function finishSetup() {
    us(() => ({ ...DEFAULT_STATE, symbol: setupData.name, symbolEmoji: setupData.emoji, setupDone: true }));
    setScreen("home");
  }

  // 计算值
  const nodeCount = state.mainChain.length;
  const groupCount = Math.floor(nodeCount / state.groupSize);
  const inGroupProgress = nodeCount % state.groupSize;
  const isActive = timer.running;
  const elapsedSec = isActive && timer.startTs ? Math.floor((Date.now() - timer.startTs) / 1000) : 0;
  const timerDisplay = `${pad(Math.floor(elapsedSec / 60))}:${pad(elapsedSec % 60)}`;
  const auxElapsed = auxTimer.active && auxTimer.startTs ? Math.floor((Date.now() - auxTimer.startTs) / 1000) : 0;
  const auxRemaining = Math.max(0, 900 - auxElapsed);

  if (screen === "setup") return (
    <SetupScreen step={setupStep} data={setupData} setData={setSetupData}
      onNext={() => setSetupStep(s => s+1)} onFinish={finishSetup} />
  );

  return (
    <div style={S.root}>
      {/* 顶栏 */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logoMark}>{state.symbolEmoji}</div>
          <div>
            <div style={S.appName}>CTDP</div>
            <div style={S.appSub}>链式时延协议</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <button style={S.navBtn} onClick={() => setScreen("rules")}>判例</button>
          <button style={S.navBtn} onClick={() => setScreen("log")}>记录</button>
        </div>
      </header>

      {screen === "home" && (
        <main style={S.main}>

          {/* 神圣座位卡片 */}
          <div style={{ ...S.card, ...(isActive ? S.cardActive : {}) }}>
            <div style={S.symbolRow}>
              <div style={{ ...S.symbolBox, background: isActive ? C.blueLt : C.surface2, border: `1px solid ${isActive ? C.blueMid : C.border}` }}>
                <span style={{ fontSize:28 }}>{state.symbolEmoji}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={S.symbolName}>{state.symbol || "神圣座位"}</div>
                <div style={{ ...S.symbolSub, color: isActive ? C.blue : C.textMuted }}>
                  {isActive ? "⚡ 专注进行中" : "触发后进入专注模式"}
                </div>
              </div>
              {isActive && <div style={S.activePill}>进行中</div>}
            </div>

            <div style={{ ...S.timerWrap, background: isActive ? C.blueLt : C.surface2, borderColor: isActive ? C.blueMid : C.border }}>
              <div style={{ ...S.timerNum, color: isActive ? C.blue : C.textMuted }}>{timerDisplay}</div>
              <div style={S.timerLbl}>{isActive ? "已专注" : "等待开始"}</div>
            </div>

            {!isActive ? (
              <button style={S.btnPrimary} onClick={activateSymbol}>
                触发 {state.symbolEmoji} · 开始专注
              </button>
            ) : (
              <div style={S.btnRow}>
                <button style={S.btnGreen} onClick={finishSession}>✓ 完成任务</button>
                <button style={S.btnRed} onClick={triggerVerdict}>⚠ 违规判定</button>
              </div>
            )}

            {isActive && (
              <input style={S.noteInput} placeholder="记录本次任务内容（选填）"
                value={noteText} onChange={e => setNoteText(e.target.value)} />
            )}
          </div>

          {/* 链条进度卡片 */}
          <div style={S.card}>
            <div style={S.sectionHeader}>
              <span style={S.sectionTitle}>主链进度</span>
              <span style={S.badge}>#{nodeCount} 节点</span>
            </div>

            {/* 任务组 */}
            <div style={S.groupRow}>
              {Array.from({ length: Math.max(groupCount + 1, 4) }).map((_, i) => (
                <div key={i} style={{
                  ...S.groupDot,
                  background: i < groupCount ? C.blue : i === groupCount ? C.blueLt : C.surface2,
                  border: `1px solid ${i < groupCount ? C.blue : i === groupCount ? C.blueMid : C.border}`,
                }}>
                  {i < groupCount && <span style={{ fontSize:9, color:"#fff", fontWeight:700 }}>✓</span>}
                  {i === groupCount && <span style={{ fontSize:9, color:C.blue }}>{inGroupProgress}/{state.groupSize}</span>}
                </div>
              ))}
              <span style={S.groupLbl}>{groupCount} 组完成</span>
            </div>

            {/* 珠链 */}
            <div style={S.beadRow}>
              {state.mainChain.slice(-24).map((node, i, arr) => (
                <div key={node.id}
                  style={{ ...S.bead, opacity: 0.3 + (i / arr.length) * 0.7 }}
                  title={`#${node.id} · ${node.duration}分钟${node.note ? " · "+node.note : ""}`}
                />
              ))}
              {nodeCount === 0 && <span style={S.emptyHint}>完成第一次专注后，链条将在此显示</span>}
            </div>

            {/* 统计 */}
            <div style={S.statsRow}>
              <div style={S.statItem}><span style={S.statVal}>{nodeCount}</span><span style={S.statLbl}>节点</span></div>
              <div style={{ ...S.statItem, borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
                <span style={S.statVal}>{groupCount}</span><span style={S.statLbl}>任务组</span>
              </div>
              <div style={S.statItem}><span style={S.statVal}>{state.totalFocusMin}</span><span style={S.statLbl}>分钟</span></div>
            </div>
          </div>

          {/* 预约链卡片 */}
          <div style={S.card}>
            <div style={S.sectionHeader}>
              <span style={S.sectionTitle}>🫰 预约链</span>
              <span style={S.sectionSub}>触发后15分钟内必须开始专注</span>
            </div>
            {!auxTimer.active ? (
              <button style={{ ...S.btnOutline, opacity: isActive ? 0.4 : 1 }}
                onClick={triggerAux} disabled={isActive}>
                打一个响指，预约15分钟后开始
              </button>
            ) : (
              <div style={S.auxBox}>
                <div style={S.auxTimer}>{Math.floor(auxRemaining/60)}:{pad(auxRemaining%60)}</div>
                <div style={S.auxBar}><div style={{ ...S.auxFill, width:`${(auxRemaining/900)*100}%` }} /></div>
                <div style={S.btnRow}>
                  <button style={S.btnPrimary} onClick={activateSymbol}>⚡ 立即开始</button>
                  <button style={S.btnOutlineSm} onClick={cancelAux}>取消</button>
                </div>
              </div>
            )}
          </div>

        </main>
      )}

      {screen === "log" && (
        <LogScreen chain={state.mainChain} onBack={() => setScreen("home")} onDelete={deleteNode} />
      )}
      {screen === "rules" && (
        <RulesScreen rules={state.rules} onBack={() => setScreen("home")} />
      )}

      {/* 弹窗 */}
      {modal === "verdict" && <Modal>
        <div style={S.modalIcon}>⚖️</div>
        <div style={S.modalTitle}>违规判定</div>
        <div style={S.modalBody}>下必为例原则：你只能选择其中一项，且该选择永久生效。</div>
        <button style={S.modalBtnRed} onClick={verdictFail}>判定违规 — 链条清零，从 #1 重来</button>
        <button style={S.modalBtnGreen} onClick={verdictAllow}>判定允许 — 此行为永久合法，记入判例</button>
        <button style={S.modalBtnGhost} onClick={() => { setTimer(t=>({...t,running:true})); setModal(null); }}>返回，继续专注</button>
      </Modal>}

      {modal === "rule" && <Modal>
        <div style={S.modalIcon}>📜</div>
        <div style={S.modalTitle}>记录判例</div>
        <div style={S.modalBody}>描述你允许的行为。此后每次坐上神圣座位，该行为永远合法。</div>
        <input style={S.modalInput} placeholder="例：中途回复一条紧急消息"
          value={ruleText} onChange={e => setRuleText(e.target.value)} />
        <button style={{ ...S.btnPrimary, marginTop:12 }} onClick={confirmRule}>确认记入判例</button>
      </Modal>}

      {modal === "aux_fail" && <Modal>
        <div style={S.modalIcon}>⏰</div>
        <div style={S.modalTitle}>预约超时</div>
        <div style={S.modalBody}>15分钟已过，未能触发神圣座位。下必为例，二选一：</div>
        <button style={S.modalBtnRed} onClick={() => auxFailVerdict(true)}>预约链 + 主链全部清零</button>
        <button style={S.modalBtnGreen} onClick={() => auxFailVerdict(false)}>允许此情况，永久记入判例</button>
      </Modal>}

      {modal === "celebrate" && <Modal>
        <div style={{ fontSize:56, textAlign:"center", marginBottom:8 }}>🎉</div>
        <div style={S.modalTitle}>完成任务组 ##{groupCount}</div>
        <div style={S.modalBody}>已完成 {nodeCount} 个节点，累计专注 {state.totalFocusMin} 分钟。链条越长，约束越强。</div>
        <button style={{ ...S.btnPrimary, marginTop:16 }} onClick={() => setModal(null)}>继续 →</button>
      </Modal>}
    </div>
  );
}

// ── 日志页 ────────────────────────────────────────────
function LogScreen({ chain, onBack, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);
  const total = chain.reduce((s, n) => s + n.duration, 0);

  return (
    <main style={S.main}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={onBack}>← 返回</button>
        <span style={S.pageTitle}>任务记录</span>
        <span style={{ fontSize:12, color:C.textMuted }}>{chain.length} 条</span>
      </div>

      {chain.length > 0 && (
        <div style={S.summaryCard}>
          <div style={S.sumItem}><span style={S.sumVal}>{chain.length}</span><span style={S.sumLbl}>节点</span></div>
          <div style={{ ...S.sumItem, borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
            <span style={S.sumVal}>{total}</span><span style={S.sumLbl}>分钟</span>
          </div>
          <div style={S.sumItem}>
            <span style={S.sumVal}>{(total/60).toFixed(1)}</span><span style={S.sumLbl}>小时</span>
          </div>
        </div>
      )}

      {chain.length === 0 && (
        <div style={S.emptyPage}>
          <div style={{ fontSize:36, marginBottom:10 }}>🔗</div>
          还没有任何记录
          <div style={{ fontSize:12, color:C.textMuted, marginTop:6 }}>完成第一次专注后，记录将在此显示</div>
        </div>
      )}

      <div style={S.logList}>
        {[...chain].reverse().map(node => (
          <div key={node.id} style={S.logItem}>
            <div style={S.logId}>#{node.id}</div>
            <div style={S.logContent}>
              <div style={S.logNote}>{node.note || "（无备注）"}</div>
              <div style={S.logMeta}>{formatTime(node.time)} · {node.duration} 分钟</div>
            </div>
            <div style={S.logRight}>
              <span style={S.logDur}>{node.duration}m</span>
              {confirmId === node.id ? (
                <div style={S.confirmRow}>
                  <button style={S.confirmYes} onClick={() => { onDelete(node.id); setConfirmId(null); }}>确认删除</button>
                  <button style={S.confirmNo} onClick={() => setConfirmId(null)}>取消</button>
                </div>
              ) : (
                <button style={S.deleteBtn} onClick={() => setConfirmId(node.id)}>删除</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ── 判例页 ────────────────────────────────────────────
function RulesScreen({ rules, onBack }) {
  return (
    <main style={S.main}>
      <div style={S.pageHeader}>
        <button style={S.backBtn} onClick={onBack}>← 返回</button>
        <span style={S.pageTitle}>判例库</span>
        <span style={{ fontSize:12, color:C.textMuted }}>{rules.length} 条</span>
      </div>
      <div style={S.rulesHint}>以下行为已被永久判定为合法。坐上神圣座位时，这些情况无需内耗。</div>
      {rules.length === 0 && (
        <div style={S.emptyPage}>
          <div style={{ fontSize:36, marginBottom:10 }}>⚖️</div>
          暂无判例
          <div style={{ fontSize:12, color:C.textMuted, marginTop:6 }}>遇到边界情况时，通过违规判定流程记录</div>
        </div>
      )}
      <div style={S.logList}>
        {rules.map((r, i) => (
          <div key={i} style={{ ...S.logItem, borderLeft:`3px solid ${C.green}` }}>
            <div style={{ ...S.logId, color:C.green }}>✓</div>
            <div style={S.logContent}>
              <div style={S.logNote}>{r.text}</div>
              <div style={S.logMeta}>{formatTime(r.time)}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ── 设置向导 ──────────────────────────────────────────
const EMOJIS = ["🎯","🎩","📖","✏️","🔔","💡","⚡","🌙","🔥","🧠","🫰","📿"];
function SetupScreen({ step, data, setData, onNext, onFinish }) {
  return (
    <div style={S.setupRoot}>
      <div style={S.setupCard}>
        {step === 0 && <>
          <div style={{ fontSize:52, textAlign:"center", marginBottom:16 }}>⚙️</div>
          <div style={S.setupTitle}>链式时延协议</div>
          <div style={S.setupBody}>基于数学与行为经济学的自控系统。<br/>设置一个「神圣座位」标志物，系统将帮你管理整条行为链。</div>
          <button style={{ ...S.btnPrimary, marginTop:24 }} onClick={onNext}>开始设置 →</button>
        </>}
        {step === 1 && <>
          <div style={S.setupTitle}>选择你的标志物</div>
          <div style={S.setupBody}>触发它就意味着你承诺以最好的状态完成一次专注任务。</div>
          <div style={S.emojiGrid}>
            {EMOJIS.map(e => (
              <button key={e} style={{
                ...S.emojiBtn,
                background: data.emoji === e ? C.blue : C.surface2,
                border: `1px solid ${data.emoji === e ? C.blue : C.border}`,
                transform: data.emoji === e ? "scale(1.15)" : "scale(1)",
              }} onClick={() => setData(d => ({...d, emoji:e}))}>{e}</button>
            ))}
          </div>
          <input style={S.modalInput} placeholder="给你的神圣座位起个名字，比如「蓝帽子」"
            value={data.name} onChange={e => setData(d => ({...d, name:e.target.value}))} />
          <button style={{ ...S.btnPrimary, marginTop:16, opacity: data.name.trim() ? 1 : 0.4 }}
            onClick={onFinish} disabled={!data.name.trim()}>确认，开始使用 →</button>
        </>}
      </div>
    </div>
  );
}

function Modal({ children }) {
  return (
    <div style={S.overlay}>
      <div style={S.modalCard}>{children}</div>
    </div>
  );
}

// ── 样式（浅色系）────────────────────────────────────
const S = {
  root: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"-apple-system,'PingFang SC','Helvetica Neue',sans-serif" },

  header: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"12px 20px", background:C.surface,
    borderBottom:`1px solid ${C.border}`,
    position:"sticky", top:0, zIndex:10,
    boxShadow:`0 1px 4px ${C.shadow}`,
  },
  headerLeft: { display:"flex", alignItems:"center", gap:10 },
  logoMark: { width:36, height:36, borderRadius:10, background:C.blueLt, border:`1px solid ${C.blueMid}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 },
  appName: { fontSize:15, fontWeight:700, color:C.text, letterSpacing:2 },
  appSub: { fontSize:10, color:C.textMuted, letterSpacing:1 },
  headerRight: { display:"flex", gap:6 },
  navBtn: { background:C.surface2, border:`1px solid ${C.border}`, color:C.textSub, padding:"6px 14px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },

  main: { padding:"16px 16px 60px", maxWidth:460, margin:"0 auto" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 },
  pageTitle: { fontSize:16, color:C.text, fontWeight:600 },
  backBtn: { background:"none", border:"none", color:C.textSub, cursor:"pointer", fontSize:14, fontFamily:"inherit" },

  card: {
    background:C.surface, border:`1px solid ${C.border}`,
    borderRadius:16, padding:20, marginBottom:12,
    boxShadow:`0 2px 8px ${C.shadow}`,
    transition:"border-color 0.3s, box-shadow 0.3s",
  },
  cardActive: { borderColor:C.blueMid, boxShadow:`0 2px 12px rgba(74,144,196,0.15)` },

  symbolRow: { display:"flex", alignItems:"center", gap:12, marginBottom:16 },
  symbolBox: { width:52, height:52, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.3s" },
  symbolName: { fontSize:17, fontWeight:700, color:C.text },
  symbolSub: { fontSize:12, marginTop:3, transition:"color 0.3s" },
  activePill: { background:C.blueLt, color:C.blue, border:`1px solid ${C.blueMid}`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 },

  timerWrap: { borderRadius:12, padding:"16px 0 12px", marginBottom:16, textAlign:"center", border:"1px solid", transition:"all 0.3s" },
  timerNum: { fontSize:56, fontWeight:300, letterSpacing:6, fontFamily:"'SF Mono','Courier New',monospace", lineHeight:1, transition:"color 0.3s" },
  timerLbl: { fontSize:11, color:C.textMuted, letterSpacing:2, marginTop:6 },

  btnPrimary: { width:"100%", background:C.blue, color:"#fff", border:"none", borderRadius:12, padding:"14px 0", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 2px 8px rgba(74,144,196,0.3)` },
  btnRow: { display:"flex", gap:10 },
  btnGreen: { flex:1, background:C.greenLt, color:C.green, border:`1px solid ${C.greenMid}`, borderRadius:12, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", fontWeight:600 },
  btnRed: { flex:1, background:C.redLt, color:C.red, border:`1px solid ${C.redMid}`, borderRadius:12, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", fontWeight:600 },
  btnOutline: { width:"100%", background:C.surface2, border:`1px dashed ${C.borderHi}`, color:C.textSub, borderRadius:12, padding:"14px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnOutlineSm: { flex:1, background:C.surface2, border:`1px solid ${C.border}`, color:C.textSub, borderRadius:10, padding:"12px 0", fontSize:13, cursor:"pointer", fontFamily:"inherit" },

  noteInput: { width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:13, marginTop:12, fontFamily:"inherit", boxSizing:"border-box", outline:"none" },

  sectionHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  sectionTitle: { fontSize:13, color:C.textSub, fontWeight:600, letterSpacing:1 },
  sectionSub: { fontSize:12, color:C.textMuted },
  badge: { background:C.blueLt, color:C.blue, border:`1px solid ${C.blueMid}`, padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:700 },

  groupRow: { display:"flex", alignItems:"center", gap:6, marginBottom:14, flexWrap:"wrap" },
  groupDot: { width:36, height:36, borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.3s" },
  groupLbl: { fontSize:11, color:C.textMuted, marginLeft:4 },

  beadRow: { display:"flex", gap:5, flexWrap:"wrap", marginBottom:14, minHeight:18, alignItems:"center" },
  bead: { width:14, height:14, borderRadius:"50%", background:C.blue },
  emptyHint: { fontSize:12, color:C.textMuted, fontStyle:"italic" },

  statsRow: { display:"flex", borderTop:`1px solid ${C.border}`, paddingTop:12 },
  statItem: { flex:1, textAlign:"center" },
  statVal: { display:"block", fontSize:22, fontWeight:700, color:C.text },
  statLbl: { display:"block", fontSize:10, color:C.textMuted, marginTop:2, letterSpacing:1 },

  auxBox: { textAlign:"center" },
  auxTimer: { fontSize:40, fontWeight:300, color:C.blue, fontFamily:"'SF Mono','Courier New',monospace", letterSpacing:4, marginBottom:10 },
  auxBar: { height:3, background:C.surface2, borderRadius:2, marginBottom:14, overflow:"hidden" },
  auxFill: { height:"100%", background:`linear-gradient(90deg,${C.blue},${C.green})`, borderRadius:2, transition:"width 1s linear" },

  overlay: { position:"fixed", inset:0, background:"rgba(45,41,38,0.4)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20 },
  modalCard: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:24, width:"100%", maxWidth:380, boxShadow:`0 16px 48px rgba(45,41,38,0.2)` },
  modalIcon: { fontSize:40, textAlign:"center", marginBottom:10 },
  modalTitle: { fontSize:18, fontWeight:700, textAlign:"center", marginBottom:8, color:C.text },
  modalBody: { fontSize:13, color:C.textSub, textAlign:"center", marginBottom:16, lineHeight:1.7 },
  modalInput: { width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:14, fontFamily:"inherit", boxSizing:"border-box", outline:"none" },
  modalBtnRed: { width:"100%", background:C.redLt, color:C.red, border:`1px solid ${C.redMid}`, borderRadius:10, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", marginTop:4, fontWeight:600 },
  modalBtnGreen: { width:"100%", background:C.greenLt, color:C.green, border:`1px solid ${C.greenMid}`, borderRadius:10, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", marginTop:8, fontWeight:600 },
  modalBtnGhost: { width:"100%", background:"none", color:C.textMuted, border:"none", padding:"10px 0", fontSize:13, cursor:"pointer", fontFamily:"inherit", marginTop:4 },

  // 日志页
  summaryCard: { display:"flex", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px 0", marginBottom:14, boxShadow:`0 2px 8px ${C.shadow}` },
  sumItem: { flex:1, textAlign:"center" },
  sumVal: { display:"block", fontSize:22, fontWeight:700, color:C.blue },
  sumLbl: { display:"block", fontSize:10, color:C.textMuted, marginTop:3, letterSpacing:1 },

  logList: { display:"flex", flexDirection:"column", gap:8 },
  logItem: { background:C.surface, border:`1px solid ${C.border}`, borderLeft:`3px solid ${C.blue}`, borderRadius:12, padding:"12px 14px", display:"flex", gap:10, alignItems:"flex-start", boxShadow:`0 1px 4px ${C.shadow}` },
  logId: { fontSize:11, color:C.blue, fontWeight:700, minWidth:28, paddingTop:2 },
  logContent: { flex:1 },
  logNote: { fontSize:14, color:C.text, marginBottom:4 },
  logMeta: { fontSize:11, color:C.textMuted },
  logRight: { display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, minWidth:60 },
  logDur: { fontSize:12, color:C.textMuted, background:C.surface2, padding:"2px 8px", borderRadius:8 },
  deleteBtn: { fontSize:11, color:C.red, background:C.redLt, border:`1px solid ${C.redMid}`, borderRadius:8, padding:"3px 8px", cursor:"pointer", fontFamily:"inherit" },
  confirmRow: { display:"flex", flexDirection:"column", gap:4 },
  confirmYes: { fontSize:11, color:"#fff", background:C.red, border:"none", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontFamily:"inherit", fontWeight:600 },
  confirmNo: { fontSize:11, color:C.textSub, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"4px 8px", cursor:"pointer", fontFamily:"inherit" },

  emptyPage: { textAlign:"center", color:C.textSub, padding:"48px 0", fontSize:14, lineHeight:2 },
  rulesHint: { fontSize:13, color:C.textSub, marginBottom:14, lineHeight:1.7 },

  setupRoot: { minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
  setupCard: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:30, width:"100%", maxWidth:380, boxShadow:`0 8px 32px ${C.shadow}` },
  setupTitle: { fontSize:20, fontWeight:700, textAlign:"center", color:C.blue, marginBottom:12 },
  setupBody: { fontSize:14, color:C.textSub, textAlign:"center", lineHeight:1.8, marginBottom:8 },
  emojiGrid: { display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, margin:"16px 0" },
  emojiBtn: { fontSize:22, borderRadius:10, padding:"8px 0", cursor:"pointer", transition:"transform 0.15s, background 0.15s" },
};
