import { useState, useEffect, useRef } from "react";

// ── 持久化存储 ──────────────────────────────────────────
const STORAGE_KEY = "ctdp_state_v1";
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

const DEFAULT_STATE = {
  symbol: "",          // 神圣座位标志物名称
  symbolEmoji: "🎯",
  mainChain: [],       // [{id, time, duration, note}]
  auxChain: [],        // [{id, time}]
  groupSize: 3,        // 几个节点 = 一个 ##
  rules: [],           // 下必为例规则列表
  totalFocusMin: 0,
  setupDone: false,
};

// ── 工具 ────────────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function pad(n) { return String(n).padStart(2, "0"); }

// ── 主应用 ───────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(() => loadState() || DEFAULT_STATE);
  const [screen, setScreen] = useState(state.setupDone ? "home" : "setup");
  // timer: 只存开始时间戳，elapsed 实时计算
  const [timer, setTimer] = useState({ running: false, startTs: null });
  // auxTimer: 只存触发时间戳
  const [auxTimer, setAuxTimer] = useState({ active: false, startTs: null });
  const [modal, setModal] = useState(null); // "verdict" | "rule" | "aux_fail" | "celebrate"
  const [ruleText, setRuleText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [setupStep, setSetupStep] = useState(0);
  const [setupData, setSetupData] = useState({ name:"", emoji:"🎯" });
  const [tick, setTick] = useState(0); // 每秒触发重渲染
  const tickRef = useRef(null);

  // 持久化
  useEffect(() => { saveState(state); }, [state]);

  // 每秒 tick 一次，驱动显示刷新（不存储时间，只触发渲染）
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  // 辅助链：检测是否超时
  useEffect(() => {
    if (!auxTimer.active || !auxTimer.startTs) return;
    const elapsed = (Date.now() - auxTimer.startTs) / 1000;
    if (elapsed >= 900) {
      setAuxTimer({ active: false, startTs: null });
      setModal("aux_fail");
    }
  }, [tick, auxTimer]);

  const us = (fn) => setState(s => { const ns = fn(s); saveState(ns); return ns; });

  // ── 操作 ────────────────────────────────────────────────
  function activateSymbol() {
    if (auxTimer.active) {
      setAuxTimer({ active: false, startTs: null });
    }
    setTimer({ running: true, startTs: Date.now() });
  }

  function finishSession() {
    const elapsed = timer.startTs ? (Date.now() - timer.startTs) / 1000 : 0;
    const mins = Math.max(1, Math.round(elapsed / 60));
    setTimer({ running: false, startTs: null });
    const newNode = { id: state.mainChain.length + 1, time: Date.now(), duration: mins, note: noteText };
    us(s => ({ ...s, mainChain: [...s.mainChain, newNode], totalFocusMin: s.totalFocusMin + mins }));
    setNoteText("");
    // 庆祝整数组
    const newLen = state.mainChain.length + 1;
    if (newLen % state.groupSize === 0) setTimeout(() => setModal("celebrate"), 300);
  }

  function triggerVerdict() {
    setTimer(t => ({ ...t, running: false }));
    setModal("verdict");
  }

  function verdictFail() {
    us(s => ({ ...s, mainChain: [], totalFocusMin: 0 }));
    setTimer({ running: false, startTs: null });
    setModal(null);
  }

  function verdictAllow() {
    setModal("rule");
  }

  function confirmRule() {
    if (!ruleText.trim()) return;
    us(s => ({ ...s, rules: [...s.rules, { text: ruleText.trim(), time: Date.now() }] }));
    setRuleText("");
    setModal(null);
    setTimer({ running: false, startTs: null });
  }

  function triggerAux() {
    setAuxTimer({ active: true, startTs: Date.now() });
  }

  function cancelAux() {
    setAuxTimer({ active: false, startTs: null });
  }

  function auxFail() {
    setModal("aux_fail");
  }

  function auxFailVerdict(reset) {
    if (reset) {
      us(s => ({ ...s, auxChain: [], mainChain: [], totalFocusMin: 0 }));
    } else {
      us(s => ({ ...s, rules: [...s.rules, { text: "预约后超时未开始任务", time: Date.now() }] }));
    }
    setAuxTimer({ active: false, startTs: null });
    setModal(null);
  }

  function finishSetup() {
    us(() => ({ ...DEFAULT_STATE, symbol: setupData.name, symbolEmoji: setupData.emoji, setupDone: true }));
    setScreen("home");
  }

  // ── 计算 ─────────────────────────────────────────────────
  const nodeCount = state.mainChain.length;
  const groupCount = Math.floor(nodeCount / state.groupSize);
  const inGroupProgress = nodeCount % state.groupSize;
  const isActive = timer.running;

  // 实时经过秒数（从时间戳算，后台切换回来也准确）
  const elapsedSeconds = isActive && timer.startTs ? Math.floor((Date.now() - timer.startTs) / 1000) : 0;
  const timerDisplay = `${pad(Math.floor(elapsedSeconds / 60))}:${pad(elapsedSeconds % 60)}`;

  // 辅助链剩余秒数
  const auxElapsed = auxTimer.active && auxTimer.startTs ? Math.floor((Date.now() - auxTimer.startTs) / 1000) : 0;
  const auxRemaining = Math.max(0, 900 - auxElapsed);
  const auxMins = Math.floor(auxRemaining / 60);
  const auxSecs = auxRemaining % 60;

  // ── UI ────────────────────────────────────────────────────
  if (screen === "setup") return <SetupScreen step={setupStep} data={setupData} setData={setSetupData} onNext={() => setSetupStep(s=>s+1)} onFinish={finishSetup} />;

  return (
    <div style={styles.root}>
      {/* 背景装饰 */}
      <div style={styles.bgOrb1} />
      <div style={styles.bgOrb2} />

      {/* 顶部状态栏 */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.appName}>CTDP</span>
          <span style={styles.appSub}>链式自控协议</span>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.navBtn} onClick={() => setScreen("rules")}>判例</button>
          <button style={styles.navBtn} onClick={() => setScreen("log")}>记录</button>
        </div>
      </header>

      {screen === "home" && (
        <main style={styles.main}>

          {/* 神圣座位卡片 */}
          <div style={{ ...styles.card, ...(isActive ? styles.cardActive : {}) }}>
            <div style={styles.symbolRow}>
              <span style={styles.symbolEmoji}>{state.symbolEmoji}</span>
              <div>
                <div style={styles.symbolName}>{state.symbol || "神圣座位"}</div>
                <div style={styles.symbolSub}>{isActive ? "专注进行中" : "待激活"}</div>
              </div>
            </div>

            {/* 大计时器 */}
            <div style={{ ...styles.timerDisplay, color: isActive ? "#f0c060" : "#555" }}>
              {isActive ? timerDisplay : "00:00"}
            </div>

            {/* 按钮区 */}
            {!isActive ? (
              <button style={styles.btnPrimary} onClick={activateSymbol}>
                触发 {state.symbolEmoji} 开始专注
              </button>
            ) : (
              <div style={styles.btnRow}>
                <button style={styles.btnSuccess} onClick={finishSession}>✓ 完成任务</button>
                <button style={styles.btnDanger} onClick={triggerVerdict}>⚠ 违规判定</button>
              </div>
            )}

            {isActive && (
              <input
                style={styles.noteInput}
                placeholder="记录本次任务内容（选填）"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
              />
            )}
          </div>

          {/* 链条进度 */}
          <div style={styles.chainCard}>
            <div style={styles.chainHeader}>
              <span style={styles.chainTitle}>主链进度</span>
              <span style={styles.chainBadge}>#{nodeCount} 节点</span>
            </div>

            {/* 组级进度 */}
            <div style={styles.groupRow}>
              {Array.from({ length: Math.max(groupCount + 1, 3) }).map((_, i) => (
                <div key={i} style={{ ...styles.groupDot, background: i < groupCount ? "#f0c060" : i === groupCount ? "#333" : "#1a1a1a", border: i === groupCount ? "1px solid #444" : "none" }}>
                  {i < groupCount && <span style={{ fontSize: 10 }}>##</span>}
                  {i === groupCount && <span style={{ fontSize: 9, color:"#666" }}>{inGroupProgress}/{state.groupSize}</span>}
                </div>
              ))}
              <span style={styles.groupLabel}>{groupCount} 个任务组</span>
            </div>

            {/* 节点珠链 */}
            <div style={styles.beadRow}>
              {state.mainChain.slice(-20).map((node, i) => (
                <div key={node.id} style={{ ...styles.bead, opacity: 0.4 + (i / 20) * 0.6 }} title={`#${node.id} ${node.duration}min`}>
                  <div style={styles.beadInner} />
                </div>
              ))}
              {nodeCount === 0 && <span style={styles.emptyHint}>完成第一次专注后，链条将在此显示</span>}
            </div>

            <div style={styles.statsRow}>
              <div style={styles.statItem}><span style={styles.statVal}>{nodeCount}</span><span style={styles.statLbl}>节点</span></div>
              <div style={styles.statItem}><span style={styles.statVal}>{groupCount}</span><span style={styles.statLbl}>任务组</span></div>
              <div style={styles.statItem}><span style={styles.statVal}>{state.totalFocusMin}</span><span style={styles.statLbl}>专注分钟</span></div>
            </div>
          </div>

          {/* 预约链 */}
          <div style={styles.auxCard}>
            <div style={styles.auxHeader}>
              <span style={styles.auxTitle}>预约链（辅助链）</span>
              <span style={styles.auxSub}>打一个响指，15分钟后必须开始</span>
            </div>
            {!auxTimer.active ? (
              <button style={styles.btnAux} onClick={triggerAux} disabled={isActive}>
                🫰 触发预约信号
              </button>
            ) : (
              <div style={styles.auxCountdown}>
                <div style={styles.auxTimerText}>{auxMins}:{pad(auxSecs)}</div>
                <div style={styles.auxProgressBar}>
                  <div style={{ ...styles.auxProgressFill, width: `${(auxRemaining / 900) * 100}%` }} />
                </div>
                <div style={styles.auxBtnRow}>
                  <button style={styles.btnAuxStart} onClick={activateSymbol}>立即开始 →</button>
                  <button style={styles.btnAuxCancel} onClick={cancelAux}>取消</button>
                </div>
              </div>
            )}
          </div>

        </main>
      )}

      {screen === "log" && (
        <LogScreen chain={state.mainChain} onBack={() => setScreen("home")} onReset={() => { if(window.confirm("确认清零所有记录？这是一次违规判定，链条将重置。")) { us(s=>({...s,mainChain:[],totalFocusMin:0})); setScreen("home"); }}} />
      )}

      {screen === "rules" && (
        <RulesScreen rules={state.rules} onBack={() => setScreen("home")} />
      )}

      {/* 弹窗 */}
      {modal === "verdict" && (
        <Modal>
          <div style={styles.modalIcon}>⚖️</div>
          <div style={styles.modalTitle}>违规判定</div>
          <div style={styles.modalBody}>下必为例原则：你只能选择其中一项，且该选择永久生效。</div>
          <button style={styles.btnDangerFull} onClick={verdictFail}>
            判定违规 — 链条清零，从 #1 重来
          </button>
          <button style={{ ...styles.btnDangerFull, background:"#1e2a1e", color:"#6dbf6d", marginTop:8 }} onClick={verdictAllow}>
            判定允许 — 但此行为永久合法，记入判例
          </button>
          <button style={styles.btnGhost} onClick={() => { setTimer(t=>({...t,running:true})); setModal(null); }}>返回，继续专注</button>
        </Modal>
      )}

      {modal === "rule" && (
        <Modal>
          <div style={styles.modalIcon}>📜</div>
          <div style={styles.modalTitle}>记录判例</div>
          <div style={styles.modalBody}>描述你允许的行为。此后每次坐上神圣座位，该行为永远合法。</div>
          <input style={styles.ruleInput} placeholder="例：中途回复一条紧急消息" value={ruleText} onChange={e=>setRuleText(e.target.value)} />
          <button style={{ ...styles.btnPrimary, width:"100%", marginTop:12 }} onClick={confirmRule}>确认记入判例</button>
        </Modal>
      )}

      {modal === "aux_fail" && (
        <Modal>
          <div style={styles.modalIcon}>⏰</div>
          <div style={styles.modalTitle}>预约超时</div>
          <div style={styles.modalBody}>15分钟已过，你未能触发神圣座位。下必为例，二选一：</div>
          <button style={styles.btnDangerFull} onClick={() => auxFailVerdict(true)}>预约链 + 主链全部清零</button>
          <button style={{ ...styles.btnDangerFull, background:"#1e2a1e", color:"#6dbf6d", marginTop:8 }} onClick={() => auxFailVerdict(false)}>允许此情况，永久记入判例</button>
        </Modal>
      )}

      {modal === "celebrate" && (
        <Modal>
          <div style={{ fontSize: 64, textAlign:"center", marginBottom:8 }}>🎉</div>
          <div style={styles.modalTitle}>完成任务组 ##{groupCount}</div>
          <div style={styles.modalBody}>已连续完成 {nodeCount} 个节点，累计专注 {state.totalFocusMin} 分钟。链条越长，约束越强。</div>
          <button style={{ ...styles.btnPrimary, width:"100%", marginTop:16 }} onClick={() => setModal(null)}>继续 →</button>
        </Modal>
      )}
    </div>
  );
}

// ── 日志页 ───────────────────────────────────────────────
function LogScreen({ chain, onBack, onReset }) {
  return (
    <main style={styles.main}>
      <div style={styles.pageHeader}>
        <button style={styles.backBtn} onClick={onBack}>← 返回</button>
        <span style={styles.pageTitle}>任务记录</span>
        <button style={{ ...styles.navBtn, color:"#e05555" }} onClick={onReset}>清零</button>
      </div>
      {chain.length === 0 && <div style={styles.emptyPage}>还没有任何记录</div>}
      <div style={styles.logList}>
        {[...chain].reverse().map(node => (
          <div key={node.id} style={styles.logItem}>
            <div style={styles.logId}>#{node.id}</div>
            <div style={styles.logContent}>
              <div style={styles.logNote}>{node.note || "（无备注）"}</div>
              <div style={styles.logMeta}>{formatTime(node.time)} · {node.duration}分钟</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ── 判例页 ───────────────────────────────────────────────
function RulesScreen({ rules, onBack }) {
  return (
    <main style={styles.main}>
      <div style={styles.pageHeader}>
        <button style={styles.backBtn} onClick={onBack}>← 返回</button>
        <span style={styles.pageTitle}>判例库</span>
        <span />
      </div>
      <div style={styles.rulesHint}>以下行为已被判定为永久合法，坐在神圣座位上时无需内耗。</div>
      {rules.length === 0 && <div style={styles.emptyPage}>暂无判例。遇到边界情况时，通过违规判定流程记录。</div>}
      <div style={styles.logList}>
        {rules.map((r, i) => (
          <div key={i} style={{ ...styles.logItem, borderLeft:"2px solid #3a6b3a" }}>
            <div style={{ ...styles.logId, color:"#6dbf6d" }}>✓</div>
            <div style={styles.logContent}>
              <div style={styles.logNote}>{r.text}</div>
              <div style={styles.logMeta}>{formatTime(r.time)}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ── 设置向导 ─────────────────────────────────────────────
const EMOJIS = ["🎯","🎩","📖","✏️","🔔","💡","⚡","🌙","🔥","🧠","🫰","📿"];
function SetupScreen({ step, data, setData, onNext, onFinish }) {
  return (
    <div style={styles.setupRoot}>
      <div style={styles.bgOrb1} /><div style={styles.bgOrb2} />
      <div style={styles.setupCard}>
        {step === 0 && (
          <>
            <div style={styles.setupIcon}>⚙️</div>
            <div style={styles.setupTitle}>链式时延协议</div>
            <div style={styles.setupBody}>基于数学与行为经济学的自控系统。<br/>你只需要设置一个「神圣座位」的标志物，系统将帮你管理整条行为链。</div>
            <button style={{ ...styles.btnPrimary, width:"100%", marginTop:24 }} onClick={onNext}>开始设置 →</button>
          </>
        )}
        {step === 1 && (
          <>
            <div style={styles.setupTitle}>选择你的标志物</div>
            <div style={styles.setupBody}>这个标志物代表你的「神圣座位」。触发它就意味着你承诺以最好的状态完成一次专注任务。</div>
            <div style={styles.emojiGrid}>
              {EMOJIS.map(e => (
                <button key={e} style={{ ...styles.emojiBtn, background: data.emoji === e ? "#f0c060" : "#1a1a1a", color: data.emoji === e ? "#000" : "#fff" }} onClick={() => setData(d=>({...d,emoji:e}))}>{e}</button>
              ))}
            </div>
            <input style={styles.ruleInput} placeholder="给你的神圣座位起个名字，比如「蓝帽子」" value={data.name} onChange={e=>setData(d=>({...d,name:e.target.value}))} />
            <button style={{ ...styles.btnPrimary, width:"100%", marginTop:16 }} onClick={onFinish} disabled={!data.name.trim()}>确认，开始使用 →</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 弹窗容器 ─────────────────────────────────────────────
function Modal({ children }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modalCard}>{children}</div>
    </div>
  );
}

// ── 样式 ──────────────────────────────────────────────────
const styles = {
  root: { minHeight:"100vh", background:"#0d0d0d", color:"#e8e0d0", fontFamily:"'Georgia', 'Noto Serif SC', serif", position:"relative", overflow:"hidden" },
  bgOrb1: { position:"fixed", top:-120, right:-100, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(240,192,96,0.08) 0%, transparent 70%)", pointerEvents:"none" },
  bgOrb2: { position:"fixed", bottom:-80, left:-80, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle, rgba(96,160,240,0.06) 0%, transparent 70%)", pointerEvents:"none" },

  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", borderBottom:"1px solid #1f1f1f" },
  headerLeft: { display:"flex", flexDirection:"column" },
  appName: { fontSize:18, fontWeight:"bold", letterSpacing:4, color:"#f0c060" },
  appSub: { fontSize:11, color:"#555", letterSpacing:1 },
  headerRight: { display:"flex", gap:8 },
  navBtn: { background:"none", border:"1px solid #2a2a2a", color:"#888", padding:"5px 12px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit" },

  main: { padding:"16px 16px 80px", maxWidth:480, margin:"0 auto" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 },
  pageTitle: { fontSize:16, color:"#ccc", letterSpacing:1 },
  backBtn: { background:"none", border:"none", color:"#888", cursor:"pointer", fontSize:14, fontFamily:"inherit" },

  card: { background:"#111", border:"1px solid #222", borderRadius:16, padding:20, marginBottom:16, transition:"border-color 0.3s, box-shadow 0.3s" },
  cardActive: { borderColor:"#f0c060", boxShadow:"0 0 24px rgba(240,192,96,0.12)" },

  symbolRow: { display:"flex", alignItems:"center", gap:12, marginBottom:16 },
  symbolEmoji: { fontSize:36 },
  symbolName: { fontSize:18, fontWeight:"bold", color:"#e8e0d0" },
  symbolSub: { fontSize:12, color:"#666", marginTop:2 },

  timerDisplay: { fontSize:56, fontWeight:"bold", textAlign:"center", letterSpacing:4, margin:"8px 0 20px", fontVariantNumeric:"tabular-nums", fontFamily:"'Courier New', monospace" },

  btnPrimary: { background:"#f0c060", color:"#000", border:"none", borderRadius:10, padding:"13px 24px", fontSize:15, fontWeight:"bold", cursor:"pointer", fontFamily:"inherit", letterSpacing:1 },
  btnRow: { display:"flex", gap:8 },
  btnSuccess: { flex:1, background:"#1a3a1a", color:"#6dbf6d", border:"1px solid #2a5a2a", borderRadius:10, padding:"12px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnDanger: { flex:1, background:"#3a1a1a", color:"#e05555", border:"1px solid #5a2a2a", borderRadius:10, padding:"12px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnDangerFull: { width:"100%", background:"#3a1a1a", color:"#e05555", border:"1px solid #5a2a2a", borderRadius:10, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", marginTop:4 },
  btnGhost: { width:"100%", background:"none", color:"#555", border:"none", padding:"10px 0", fontSize:13, cursor:"pointer", fontFamily:"inherit", marginTop:4 },

  noteInput: { width:"100%", background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:8, padding:"10px 12px", color:"#aaa", fontSize:13, marginTop:12, fontFamily:"inherit", boxSizing:"border-box" },

  chainCard: { background:"#111", border:"1px solid #1e1e1e", borderRadius:16, padding:20, marginBottom:16 },
  chainHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  chainTitle: { fontSize:14, color:"#888", letterSpacing:1 },
  chainBadge: { background:"#1a1a1a", color:"#f0c060", padding:"3px 10px", borderRadius:20, fontSize:13, fontWeight:"bold" },

  groupRow: { display:"flex", alignItems:"center", gap:6, marginBottom:14, flexWrap:"wrap" },
  groupDot: { width:36, height:36, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#000", fontWeight:"bold" },
  groupLabel: { fontSize:12, color:"#555", marginLeft:4 },

  beadRow: { display:"flex", gap:4, flexWrap:"wrap", marginBottom:14, minHeight:20 },
  bead: { width:14, height:14, borderRadius:"50%", background:"#f0c060", display:"flex", alignItems:"center", justifyContent:"center" },
  beadInner: { width:6, height:6, borderRadius:"50%", background:"rgba(0,0,0,0.3)" },
  emptyHint: { fontSize:12, color:"#444", fontStyle:"italic" },

  statsRow: { display:"flex", gap:0, borderTop:"1px solid #1a1a1a", paddingTop:12 },
  statItem: { flex:1, textAlign:"center" },
  statVal: { display:"block", fontSize:22, fontWeight:"bold", color:"#e8e0d0" },
  statLbl: { display:"block", fontSize:11, color:"#555", marginTop:2 },

  auxCard: { background:"#0e0e14", border:"1px solid #1a1a2e", borderRadius:16, padding:20, marginBottom:16 },
  auxHeader: { marginBottom:12 },
  auxTitle: { fontSize:14, color:"#888", letterSpacing:1, display:"block", marginBottom:4 },
  auxSub: { fontSize:12, color:"#444" },
  btnAux: { width:"100%", background:"#0a0a1a", border:"1px solid #2a2a4a", color:"#8888cc", borderRadius:10, padding:"13px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit", letterSpacing:1 },
  auxCountdown: { textAlign:"center" },
  auxTimerText: { fontSize:40, fontWeight:"bold", color:"#8888cc", fontFamily:"'Courier New', monospace", letterSpacing:4, marginBottom:8 },
  auxProgressBar: { height:4, background:"#1a1a2e", borderRadius:2, marginBottom:12, overflow:"hidden" },
  auxProgressFill: { height:"100%", background:"#8888cc", borderRadius:2, transition:"width 1s linear" },
  auxBtnRow: { display:"flex", gap:8 },
  btnAuxStart: { flex:2, background:"#1a1a3a", color:"#aaaaee", border:"1px solid #3a3a6a", borderRadius:8, padding:"10px 0", fontSize:14, cursor:"pointer", fontFamily:"inherit" },
  btnAuxCancel: { flex:1, background:"none", color:"#555", border:"1px solid #2a2a2a", borderRadius:8, padding:"10px 0", fontSize:13, cursor:"pointer", fontFamily:"inherit" },

  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modalCard: { background:"#141414", border:"1px solid #2a2a2a", borderRadius:20, padding:24, width:"100%", maxWidth:380 },
  modalIcon: { fontSize:40, textAlign:"center", marginBottom:8 },
  modalTitle: { fontSize:18, fontWeight:"bold", textAlign:"center", marginBottom:8, color:"#e8e0d0" },
  modalBody: { fontSize:13, color:"#888", textAlign:"center", marginBottom:16, lineHeight:1.6 },
  ruleInput: { width:"100%", background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:8, padding:"11px 12px", color:"#ccc", fontSize:14, fontFamily:"inherit", boxSizing:"border-box" },

  logList: { display:"flex", flexDirection:"column", gap:8 },
  logItem: { background:"#111", border:"1px solid #1e1e1e", borderLeft:"2px solid #f0c060", borderRadius:8, padding:"12px 14px", display:"flex", gap:12, alignItems:"flex-start" },
  logId: { fontSize:12, color:"#f0c060", fontWeight:"bold", minWidth:28, paddingTop:2 },
  logContent: { flex:1 },
  logNote: { fontSize:14, color:"#ccc", marginBottom:4 },
  logMeta: { fontSize:12, color:"#555" },
  emptyPage: { textAlign:"center", color:"#444", padding:"40px 0", fontSize:14 },
  rulesHint: { fontSize:13, color:"#555", marginBottom:12, lineHeight:1.5 },

  setupRoot: { minHeight:"100vh", background:"#0d0d0d", display:"flex", alignItems:"center", justifyContent:"center", padding:24, position:"relative", overflow:"hidden" },
  setupCard: { background:"#111", border:"1px solid #222", borderRadius:20, padding:28, width:"100%", maxWidth:380, position:"relative", zIndex:1 },
  setupIcon: { fontSize:48, textAlign:"center", marginBottom:12 },
  setupTitle: { fontSize:22, fontWeight:"bold", textAlign:"center", color:"#f0c060", marginBottom:12, letterSpacing:1 },
  setupBody: { fontSize:14, color:"#888", textAlign:"center", lineHeight:1.7, marginBottom:8 },
  emojiGrid: { display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:8, margin:"16px 0" },
  emojiBtn: { fontSize:24, border:"none", borderRadius:8, padding:"8px 0", cursor:"pointer", transition:"transform 0.1s" },
};
