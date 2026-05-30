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
          <div style={styles.appDot} />
          <div>
            <div style={styles.appName}>CTDP</div>
            <div style={styles.appSub}>链式时延协议</div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.navBtn} onClick={() => setScreen("rules")}>📜 判例</button>
          <button style={styles.navBtn} onClick={() => setScreen("log")}>📋 记录</button>
        </div>
      </header>

      {screen === "home" && (
        <main style={styles.main}>

          {/* 神圣座位卡片 */}
          <div style={{ ...styles.card, ...(isActive ? styles.cardActive : {}) }}>

            {/* 标志物行 */}
            <div style={styles.symbolRow}>
              <div style={styles.symbolEmojiWrap}>
                <span style={styles.symbolEmoji}>{state.symbolEmoji}</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={styles.symbolName}>{state.symbol || "神圣座位"}</div>
                <div style={styles.symbolSub}>{isActive ? "⚡ 专注进行中" : "触发后进入专注模式"}</div>
              </div>
              {isActive && (
                <div style={{ ...styles.symbolStatus, background:"rgba(126,200,227,0.12)", color:C.blue, border:`1px solid rgba(126,200,227,0.25)` }}>
                  进行中
                </div>
              )}
            </div>

            {/* 计时器区域 */}
            <div style={styles.timerWrap}>
              <div style={{ ...styles.timerDisplay, color: isActive ? C.blue : C.textMuted }}>
                {timerDisplay}
              </div>
              <div style={styles.timerLabel}>{isActive ? "已专注" : "等待开始"}</div>
            </div>

            {/* 按钮区 */}
            {!isActive ? (
              <button style={styles.btnPrimary} onClick={activateSymbol}>
                触发 {state.symbolEmoji} · 开始专注
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

          {/* 链条进度卡片 */}
          <div style={styles.chainCard}>
            <div style={styles.chainHeader}>
              <span style={styles.chainTitle}>主链进度</span>
              <span style={styles.chainBadge}>#{nodeCount} 节点</span>
            </div>

            {/* 任务组方块 */}
            <div style={styles.groupRow}>
              {Array.from({ length: Math.max(groupCount + 1, 4) }).map((_, i) => (
                <div key={i} style={{
                  ...styles.groupDot,
                  background: i < groupCount
                    ? `linear-gradient(135deg, ${C.blue}, ${C.blueDim})`
                    : i === groupCount
                    ? `rgba(126,200,227,0.08)`
                    : `rgba(255,255,255,0.03)`,
                  border: i === groupCount
                    ? `1px solid rgba(126,200,227,0.3)`
                    : i < groupCount
                    ? "none"
                    : `1px solid ${C.border}`,
                  boxShadow: i < groupCount ? `0 2px 8px rgba(126,200,227,0.2)` : "none",
                }}>
                  {i < groupCount && <span style={{ fontSize:9, color:"#fff", fontWeight:700 }}>✓</span>}
                  {i === groupCount && <span style={{ fontSize:9, color:C.textDim }}>{inGroupProgress}/{state.groupSize}</span>}
                </div>
              ))}
              <span style={styles.groupLabel}>{groupCount} 组完成</span>
            </div>

            {/* 节点珠链 */}
            <div style={styles.beadRow}>
              {state.mainChain.slice(-24).map((node, i, arr) => (
                <div
                  key={node.id}
                  style={{ ...styles.bead, opacity: 0.3 + (i / arr.length) * 0.7 }}
                  title={`#${node.id} · ${node.duration}分钟${node.note ? " · " + node.note : ""}`}
                >
                  <div style={styles.beadInner} />
                </div>
              ))}
              {nodeCount === 0 && <span style={styles.emptyHint}>完成第一次专注后，链条将在此显示</span>}
            </div>

            {/* 统计栏 */}
            <div style={styles.statsRow}>
              <div style={styles.statItem}>
                <span style={styles.statVal}>{nodeCount}</span>
                <span style={styles.statLbl}>节点</span>
              </div>
              <div style={{ ...styles.statItem, borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
                <span style={styles.statVal}>{groupCount}</span>
                <span style={styles.statLbl}>任务组</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statVal}>{state.totalFocusMin}</span>
                <span style={styles.statLbl}>分钟</span>
              </div>
            </div>
          </div>

          {/* 预约链卡片 */}
          <div style={styles.auxCard}>
            <div style={styles.auxHeader}>
              <span style={styles.auxTitle}>🫰 预约链</span>
              <span style={styles.auxSub}>触发信号后，15分钟内必须开始专注</span>
            </div>
            {!auxTimer.active ? (
              <button
                style={{ ...styles.btnAux, opacity: isActive ? 0.4 : 1, cursor: isActive ? "not-allowed" : "pointer" }}
                onClick={triggerAux}
                disabled={isActive}
              >
                打一个响指，预约15分钟后开始
              </button>
            ) : (
              <div style={styles.auxCountdown}>
                <div style={styles.auxTimerText}>{auxMins}:{pad(auxSecs)}</div>
                <div style={styles.auxProgressBar}>
                  <div style={{ ...styles.auxProgressFill, width: `${(auxRemaining / 900) * 100}%` }} />
                </div>
                <div style={styles.auxBtnRow}>
                  <button style={styles.btnAuxStart} onClick={activateSymbol}>⚡ 立即开始</button>
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
          <button style={{ ...styles.btnDangerFull, background: C.mintBg, color: C.mint, border:`1px solid ${C.mintBorder}`, marginTop:8 }} onClick={verdictAllow}>
            判定允许 — 此行为永久合法，记入判例
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
          <button style={{ ...styles.btnDangerFull, background: C.mintBg, color: C.mint, border:`1px solid ${C.mintBorder}`, marginTop:8 }} onClick={() => auxFailVerdict(false)}>允许此情况，永久记入判例</button>
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
  const total = chain.reduce((s, n) => s + n.duration, 0);
  return (
    <main style={styles.main}>
      <div style={styles.pageHeader}>
        <button style={styles.backBtn} onClick={onBack}>← 返回</button>
        <span style={styles.pageTitle}>任务记录</span>
        <button style={{ ...styles.navBtn, color: C.rose, borderColor: C.roseBorder }} onClick={onReset}>清零</button>
      </div>

      {chain.length > 0 && (
        <div style={styles.logSummary}>
          <div style={styles.logSumItem}>
            <span style={styles.logSumVal}>{chain.length}</span>
            <span style={styles.logSumLbl}>节点</span>
          </div>
          <div style={{ ...styles.logSumItem, borderLeft:`1px solid ${C.border}`, borderRight:`1px solid ${C.border}` }}>
            <span style={styles.logSumVal}>{total}</span>
            <span style={styles.logSumLbl}>分钟</span>
          </div>
          <div style={styles.logSumItem}>
            <span style={styles.logSumVal}>{Math.round(total / 60 * 10) / 10}</span>
            <span style={styles.logSumLbl}>小时</span>
          </div>
        </div>
      )}

      {chain.length === 0 && (
        <div style={styles.emptyPage}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
          还没有任何记录<br/>
          <span style={{ fontSize:12, color:C.textMuted }}>完成第一次专注后，记录将在此显示</span>
        </div>
      )}

      <div style={styles.logList}>
        {[...chain].reverse().map(node => (
          <div key={node.id} style={styles.logItem}>
            <div style={styles.logId}>#{node.id}</div>
            <div style={styles.logContent}>
              <div style={styles.logNote}>{node.note || "（无备注）"}</div>
              <div style={styles.logMeta}>{formatTime(node.time)} · {node.duration} 分钟</div>
            </div>
            <div style={styles.logDuration}>{node.duration}m</div>
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
        <span style={{ fontSize:12, color:C.textMuted }}>{rules.length} 条</span>
      </div>
      <div style={styles.rulesHint}>
        以下行为已被永久判定为合法。坐上神圣座位时，这些情况无需内耗——直接允许即可。
      </div>
      {rules.length === 0 && (
        <div style={styles.emptyPage}>
          <div style={{ fontSize:40, marginBottom:12 }}>⚖️</div>
          暂无判例<br/>
          <span style={{ fontSize:12, color:C.textMuted }}>遇到边界情况时，通过违规判定流程记录</span>
        </div>
      )}
      <div style={styles.logList}>
        {rules.map((r, i) => (
          <div key={i} style={{ ...styles.logItem, borderLeft:`3px solid ${C.mint}` }}>
            <div style={{ ...styles.logId, color: C.mint }}>✓</div>
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
                <button key={e} style={{
                  ...styles.emojiBtn,
                  background: data.emoji === e
                    ? `linear-gradient(135deg, ${C.blue}, ${C.blueDim})`
                    : `rgba(255,255,255,0.04)`,
                  boxShadow: data.emoji === e ? `0 4px 12px rgba(126,200,227,0.3)` : "none",
                  transform: data.emoji === e ? "scale(1.15)" : "scale(1)",
                }} onClick={() => setData(d=>({...d,emoji:e}))}>{e}</button>
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

// ── 设计系统 ─────────────────────────────────────────────
// 主色：柔和天蓝  辅色：薄荷绿确认 / 玫瑰红警告
const C = {
  bg:        "#080e14",   // 深海背景
  surface:   "#0d1620",   // 卡片底色
  surface2:  "#111e2e",   // 次级卡片
  border:    "#1a2e42",   // 普通描边
  borderHi:  "#2a4a6a",   // 高亮描边
  blue:      "#7ec8e3",   // 主题蓝
  blueDim:   "#4a90b0",   // 暗蓝
  blueGlow:  "rgba(126,200,227,0.15)",
  blueDeep:  "#0e2030",   // 深蓝背景块
  mint:      "#6edbb0",   // 确认绿
  mintBg:    "#0d2a1e",
  mintBorder:"#1a4a32",
  rose:      "#e07080",   // 警告红
  roseBg:    "#2a0e14",
  roseBorder:"#4a1a22",
  text:      "#d4e8f0",   // 主文字
  textDim:   "#7a9bb0",   // 次要文字
  textMuted: "#3a5566",   // 更淡
};

// ── 样式 ──────────────────────────────────────────────────
const styles = {
  root: {
    minHeight:"100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "-apple-system, 'PingFang SC', 'Helvetica Neue', sans-serif",
    position:"relative", overflow:"hidden",
  },
  bgOrb1: {
    position:"fixed", top:-160, right:-120, width:500, height:500, borderRadius:"50%",
    background:`radial-gradient(circle, rgba(126,200,227,0.07) 0%, transparent 65%)`,
    pointerEvents:"none",
  },
  bgOrb2: {
    position:"fixed", bottom:-100, left:-100, width:400, height:400, borderRadius:"50%",
    background:`radial-gradient(circle, rgba(110,219,176,0.05) 0%, transparent 65%)`,
    pointerEvents:"none",
  },

  // ── 顶栏
  header: {
    display:"flex", justifyContent:"space-between", alignItems:"center",
    padding:"14px 20px",
    background:"rgba(8,14,20,0.8)",
    backdropFilter:"blur(12px)",
    borderBottom:`1px solid ${C.border}`,
    position:"sticky", top:0, zIndex:10,
  },
  headerLeft: { display:"flex", alignItems:"center", gap:10 },
  appDot: {
    width:8, height:8, borderRadius:"50%",
    background:`linear-gradient(135deg, ${C.blue}, ${C.mint})`,
    boxShadow:`0 0 8px ${C.blue}`,
  },
  appName: { fontSize:16, fontWeight:700, letterSpacing:3, color:C.blue },
  appSub: { fontSize:10, color:C.textMuted, letterSpacing:2, marginTop:1 },
  headerRight: { display:"flex", gap:6 },
  navBtn: {
    background:"transparent",
    border:`1px solid ${C.border}`,
    color: C.textDim,
    padding:"6px 14px", borderRadius:20,
    cursor:"pointer", fontSize:12,
    fontFamily:"inherit",
    transition:"all 0.2s",
  },

  // ── 主区域
  main: { padding:"16px 16px 80px", maxWidth:460, margin:"0 auto" },
  pageHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  pageTitle: { fontSize:16, color:C.text, fontWeight:600 },
  backBtn: { background:"none", border:"none", color:C.textDim, cursor:"pointer", fontSize:14, fontFamily:"inherit" },

  // ── 神圣座位卡片
  card: {
    background: `linear-gradient(145deg, ${C.surface} 0%, ${C.surface2} 100%)`,
    border:`1px solid ${C.border}`,
    borderRadius:20, padding:22, marginBottom:14,
    transition:"border-color 0.4s, box-shadow 0.4s",
  },
  cardActive: {
    borderColor: C.blue,
    boxShadow:`0 0 32px ${C.blueGlow}, inset 0 0 20px rgba(126,200,227,0.03)`,
  },

  symbolRow: { display:"flex", alignItems:"center", gap:14, marginBottom:18 },
  symbolEmojiWrap: {
    width:52, height:52, borderRadius:14,
    background:`linear-gradient(135deg, ${C.blueDeep}, #0a1a28)`,
    border:`1px solid ${C.borderHi}`,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:26,
    boxShadow:`0 4px 12px rgba(0,0,0,0.4)`,
  },
  symbolEmoji: { fontSize:26 },
  symbolName: { fontSize:17, fontWeight:700, color:C.text, letterSpacing:0.5 },
  symbolSub: { fontSize:12, color:C.textDim, marginTop:3 },
  symbolStatus: {
    marginLeft:"auto",
    padding:"4px 10px", borderRadius:20,
    fontSize:11, fontWeight:600, letterSpacing:1,
  },

  timerWrap: {
    background:`rgba(0,0,0,0.25)`,
    borderRadius:16, padding:"18px 0 14px",
    marginBottom:18, textAlign:"center",
    border:`1px solid rgba(126,200,227,0.08)`,
  },
  timerDisplay: {
    fontSize:60, fontWeight:300, letterSpacing:6,
    fontVariantNumeric:"tabular-nums",
    fontFamily:"'SF Mono', 'Courier New', monospace",
    lineHeight:1,
  },
  timerLabel: { fontSize:11, color:C.textMuted, letterSpacing:2, marginTop:6 },

  btnPrimary: {
    width:"100%",
    background:`linear-gradient(135deg, ${C.blue} 0%, ${C.blueDim} 100%)`,
    color:"#fff", border:"none", borderRadius:14,
    padding:"15px 0", fontSize:15, fontWeight:700,
    cursor:"pointer", fontFamily:"inherit", letterSpacing:1,
    boxShadow:`0 4px 20px rgba(126,200,227,0.3)`,
    transition:"all 0.2s",
  },
  btnRow: { display:"flex", gap:10 },
  btnSuccess: {
    flex:1,
    background: C.mintBg,
    color: C.mint,
    border:`1px solid ${C.mintBorder}`,
    borderRadius:14, padding:"13px 0", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", fontWeight:600,
    transition:"all 0.2s",
  },
  btnDanger: {
    flex:1,
    background: C.roseBg,
    color: C.rose,
    border:`1px solid ${C.roseBorder}`,
    borderRadius:14, padding:"13px 0", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", fontWeight:600,
    transition:"all 0.2s",
  },
  btnDangerFull: {
    width:"100%",
    background: C.roseBg, color: C.rose,
    border:`1px solid ${C.roseBorder}`,
    borderRadius:12, padding:"13px 0", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", marginTop:8, fontWeight:600,
  },
  btnGhost: {
    width:"100%", background:"none", color:C.textMuted,
    border:"none", padding:"10px 0", fontSize:13,
    cursor:"pointer", fontFamily:"inherit", marginTop:4,
  },

  noteInput: {
    width:"100%",
    background:"rgba(0,0,0,0.3)",
    border:`1px solid ${C.border}`,
    borderRadius:10, padding:"10px 14px",
    color: C.textDim, fontSize:13, marginTop:14,
    fontFamily:"inherit", boxSizing:"border-box",
    outline:"none",
  },

  // ── 链条卡片
  chainCard: {
    background:`linear-gradient(145deg, ${C.surface} 0%, ${C.surface2} 100%)`,
    border:`1px solid ${C.border}`,
    borderRadius:20, padding:20, marginBottom:14,
  },
  chainHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  chainTitle: { fontSize:13, color:C.textDim, letterSpacing:2, fontWeight:600, textTransform:"uppercase" },
  chainBadge: {
    background:`rgba(126,200,227,0.1)`,
    color: C.blue,
    border:`1px solid rgba(126,200,227,0.2)`,
    padding:"3px 12px", borderRadius:20, fontSize:12, fontWeight:700,
  },

  groupRow: { display:"flex", alignItems:"center", gap:6, marginBottom:14, flexWrap:"wrap" },
  groupDot: {
    width:38, height:38, borderRadius:10,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:10, fontWeight:700,
    transition:"all 0.3s",
  },
  groupLabel: { fontSize:11, color:C.textMuted, marginLeft:6 },

  beadRow: { display:"flex", gap:5, flexWrap:"wrap", marginBottom:16, minHeight:22, alignItems:"center" },
  bead: {
    width:16, height:16, borderRadius:"50%",
    background:`linear-gradient(135deg, ${C.blue}, ${C.blueDim})`,
    boxShadow:`0 2px 6px rgba(126,200,227,0.3)`,
    display:"flex", alignItems:"center", justifyContent:"center",
  },
  beadInner: { width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.25)" },
  emptyHint: { fontSize:12, color:C.textMuted, fontStyle:"italic" },

  statsRow: {
    display:"flex", gap:0,
    borderTop:`1px solid ${C.border}`, paddingTop:14,
  },
  statItem: { flex:1, textAlign:"center" },
  statVal: { display:"block", fontSize:24, fontWeight:700, color:C.text },
  statLbl: { display:"block", fontSize:10, color:C.textMuted, marginTop:3, letterSpacing:1, textTransform:"uppercase" },

  // ── 预约链卡片
  auxCard: {
    background:`linear-gradient(145deg, #0a1420 0%, #0c1828 100%)`,
    border:`1px solid ${C.border}`,
    borderRadius:20, padding:20, marginBottom:14,
  },
  auxHeader: { marginBottom:14 },
  auxTitle: { fontSize:13, color:C.textDim, letterSpacing:2, fontWeight:600, display:"block", marginBottom:4, textTransform:"uppercase" },
  auxSub: { fontSize:12, color:C.textMuted },
  btnAux: {
    width:"100%",
    background:"rgba(126,200,227,0.06)",
    border:`1px dashed rgba(126,200,227,0.25)`,
    color: C.blueDim, borderRadius:14,
    padding:"14px 0", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", letterSpacing:1,
    transition:"all 0.2s",
  },
  auxCountdown: { textAlign:"center" },
  auxTimerText: {
    fontSize:44, fontWeight:300, color:C.blue,
    fontFamily:"'SF Mono', 'Courier New', monospace",
    letterSpacing:6, marginBottom:10,
  },
  auxProgressBar: {
    height:3, background:"rgba(126,200,227,0.1)",
    borderRadius:2, marginBottom:14, overflow:"hidden",
  },
  auxProgressFill: {
    height:"100%",
    background:`linear-gradient(90deg, ${C.blue}, ${C.mint})`,
    borderRadius:2, transition:"width 1s linear",
  },
  auxBtnRow: { display:"flex", gap:8 },
  btnAuxStart: {
    flex:2,
    background:`rgba(126,200,227,0.1)`,
    color: C.blue,
    border:`1px solid rgba(126,200,227,0.25)`,
    borderRadius:10, padding:"11px 0", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", fontWeight:600,
  },
  btnAuxCancel: {
    flex:1, background:"none", color:C.textMuted,
    border:`1px solid ${C.border}`,
    borderRadius:10, padding:"11px 0", fontSize:13,
    cursor:"pointer", fontFamily:"inherit",
  },

  // ── 弹窗
  overlay: {
    position:"fixed", inset:0,
    background:"rgba(4,10,16,0.92)",
    backdropFilter:"blur(8px)",
    display:"flex", alignItems:"center", justifyContent:"center",
    zIndex:100, padding:20,
  },
  modalCard: {
    background:`linear-gradient(145deg, #0d1a28, #111e2e)`,
    border:`1px solid ${C.borderHi}`,
    borderRadius:24, padding:28,
    width:"100%", maxWidth:380,
    boxShadow:"0 24px 60px rgba(0,0,0,0.6)",
  },
  modalIcon: { fontSize:44, textAlign:"center", marginBottom:10 },
  modalTitle: { fontSize:19, fontWeight:700, textAlign:"center", marginBottom:8, color:C.text },
  modalBody: { fontSize:13, color:C.textDim, textAlign:"center", marginBottom:18, lineHeight:1.7 },
  ruleInput: {
    width:"100%",
    background:"rgba(0,0,0,0.4)",
    border:`1px solid ${C.borderHi}`,
    borderRadius:10, padding:"12px 14px",
    color:C.text, fontSize:14,
    fontFamily:"inherit", boxSizing:"border-box", outline:"none",
  },

  // ── 日志 / 判例
  logList: { display:"flex", flexDirection:"column", gap:8 },
  logSummary: {
    display:"flex", background:C.surface, border:`1px solid ${C.border}`,
    borderRadius:14, padding:"14px 0", marginBottom:14,
  },
  logSumItem: { flex:1, textAlign:"center" },
  logSumVal: { display:"block", fontSize:22, fontWeight:700, color:C.blue },
  logSumLbl: { display:"block", fontSize:10, color:C.textMuted, marginTop:3, letterSpacing:1, textTransform:"uppercase" },
  logItem: {
    background: C.surface,
    border:`1px solid ${C.border}`,
    borderLeft:`3px solid ${C.blue}`,
    borderRadius:12, padding:"13px 16px",
    display:"flex", gap:12, alignItems:"center",
  },
  logId: { fontSize:11, color:C.blue, fontWeight:700, minWidth:28, letterSpacing:0.5 },
  logContent: { flex:1 },
  logNote: { fontSize:14, color:C.text, marginBottom:4 },
  logMeta: { fontSize:11, color:C.textMuted },
  logDuration: { fontSize:12, color:C.textMuted, background:`rgba(126,200,227,0.08)`, padding:"3px 8px", borderRadius:8 },
  emptyPage: { textAlign:"center", color:C.textDim, padding:"48px 0", fontSize:14, lineHeight:2 },
  rulesHint: { fontSize:13, color:C.textDim, marginBottom:14, lineHeight:1.7, padding:"0 2px" },

  // ── 设置向导
  setupRoot: {
    minHeight:"100vh",
    background: C.bg,
    display:"flex", alignItems:"center", justifyContent:"center",
    padding:24, position:"relative", overflow:"hidden",
  },
  setupCard: {
    background:`linear-gradient(145deg, ${C.surface}, ${C.surface2})`,
    border:`1px solid ${C.borderHi}`,
    borderRadius:24, padding:32,
    width:"100%", maxWidth:380,
    position:"relative", zIndex:1,
    boxShadow:"0 20px 60px rgba(0,0,0,0.5)",
  },
  setupIcon: { fontSize:52, textAlign:"center", marginBottom:14 },
  setupTitle: {
    fontSize:22, fontWeight:700, textAlign:"center",
    color:C.blue, marginBottom:12, letterSpacing:1,
  },
  setupBody: { fontSize:14, color:C.textDim, textAlign:"center", lineHeight:1.8, marginBottom:8 },
  emojiGrid: { display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:8, margin:"18px 0" },
  emojiBtn: {
    fontSize:22, border:"none", borderRadius:10,
    padding:"9px 0", cursor:"pointer", transition:"transform 0.15s, box-shadow 0.15s",
  },
};
