const BUILD = "bridge-v1.0.24.10-auction-table-badges";
const ROOM_SCHEMA_VERSION = 66;
const SEATS = [
  { id: 0, key: "N", name: "北", team: "NS" },
  { id: 1, key: "E", name: "東", team: "EW" },
  { id: 2, key: "S", name: "南", team: "NS" },
  { id: 3, key: "W", name: "西", team: "EW" }
];
const SUITS = {
  C: { symbol: "♣", name: "梅花", order: 0, trick: 0, color: "black", score: 20 },
  D: { symbol: "♦", name: "方塊", order: 1, trick: 1, color: "red", score: 20 },
  H: { symbol: "♥", name: "紅心", order: 2, trick: 2, color: "red", score: 30 },
  S: { symbol: "♠", name: "黑桃", order: 3, trick: 3, color: "black", score: 30 },
  NT: { symbol: "NT", name: "無王", order: 4, trick: -1, color: "black", score: 30 }
};
const SUIT_ORDER = ["C", "D", "H", "S", "NT"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const HCP = { A: 4, K: 3, Q: 2, J: 1 };
const AI_ACTION_DELAY_MS = 2000;
const TRICK_CLEAR_DELAY_MS = 2000;
const PACING_OPTIONS_MS = [800, 1200, 2000, 3000, 5000];
const PRESENCE_HEARTBEAT_MS = 10000;
const PRESENCE_OFFLINE_MS = 25000;
const ACTION_STUCK_MS = 18000;
const STALE_PROCESSING_MS = 12000;
const HOST_FAILOVER_GRACE_MS = 35000;
const STORAGE = {
  name: "bridge.playerName",
  theme: "bridge.theme",
  hints: "bridge.hints",
  sound: "bridge.sound",
  vibration: "bridge.vibration",
  touch: "bridge.touch",
  confirmPlay: "bridge.confirmPlay",
  handSortMode: "bridge.handSortMode",
  soundProfile: "bridge.soundProfile",
  logVisible: "bridge.logVisible",
  stats: "bridge.stats",
  lastRoom: "bridge.lastRoom",
  lastRoomAt: "bridge.lastRoomAt",
  clientId: "bridge.clientId",
  checklist: "bridge.releaseChecklist",
  tutorialChapter1: "bridge.tutorial.chapter1",
  tutorialChapter2: "bridge.tutorial.chapter2",
  tutorialChapter3: "bridge.tutorial.chapter3",
  testViewSeat: "bridge.testViewSeat"
};
const firebaseConfig = {
  apiKey: "AIzaSyDbOGwdYNY4mFG8Sgy8w_QdJpziWVoNx10",
  authDomain: "napoleon-secretary-3.firebaseapp.com",
  databaseURL: "https://napoleon-secretary-3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "napoleon-secretary-3",
  storageBucket: "napoleon-secretary-3.firebasestorage.app",
  messagingSenderId: "189925612153",
  appId: "1:189925612153:web:a6db7ea4dc1e8945c152a8"
};

const $ = (id) => document.getElementById(id);
const appState = {
  firebase: null,
  uid: null,
  firebaseUid: null,
  localUid: `local-${Math.random().toString(36).slice(2, 10)}`,
  clientId: null,
  connected: false,
  roomCode: null,
  room: null,
  roomUnsub: null,
  offline: false,
  spectator: false,
  botTimer: null,
  trickPauseTimer: null,
  presenceTimer: null,
  presenceRefKey: null,
  lastPresenceWriteAt: 0,
  pendingInviteRoom: null,
  inviteAutoJoinAttempted: false,
  audioContext: null,
  lastResultKey: null,
  processingActions: false,
  lastTurnNoticeKey: null,
  updateWorker: null,
  uiTicker: null,
  pendingPlay: null,
  replay: { game: null, steps: [], index: 0 },
  privateHands: {},
  privateHandsUnsub: null,
  privateHandsSubKey: null,
  undoSnapshot: null,
  recordsDrawerOpen: false,
  mobileRecordTab: "tools",
  lastHostTransferAttemptAt: 0,
  lastArbiterNoticeKey: null,
  testViewSeat: null,
  testMode: false
};

function init() {
  appState.clientId = ensureClientId();
  appState.localUid = `local-${appState.clientId}`;
  appState.uid = appState.localUid;
  applyTheme(loadSetting(STORAGE.theme, "auto"));
  watchSystemTheme();
  $("playerName").value = localStorage.getItem(STORAGE.name) || randomGuestName();
  $("themeSelect").value = loadSetting(STORAGE.theme, "auto");
  setCheckbox("hintToggle", getBool(STORAGE.hints, true));
  setCheckbox("soundToggle", getBool(STORAGE.sound, false));
  setCheckbox("vibrationToggle", getBool(STORAGE.vibration, false));
  setCheckbox("touchComfortToggle", getBool(STORAGE.touch, false));
  setCheckbox("confirmPlayToggle", getBool(STORAGE.confirmPlay, false));
  const handSortSelect = $("handSortMode");
  if (handSortSelect) handSortSelect.value = loadSetting(STORAGE.handSortMode, "suit");
  $("soundProfile").value = loadSetting(STORAGE.soundProfile, "soft");
  applyPlayerHintsVisible(getBool(STORAGE.hints, true));
  applyTouchComfort();
  applyPlayConfirmMode();
  applyLogVisibility(getBool(STORAGE.logVisible, false));

  const roomFromUrl = getInviteRoomFromLocation();
  if (roomFromUrl) {
    appState.pendingInviteRoom = roomFromUrl;
    $("roomCode").value = roomFromUrl;
    $("connectStatus").textContent = `偵測到邀請房號 ${roomFromUrl}，正在自動連線並加入…`;
  } else {
    const last = localStorage.getItem(STORAGE.lastRoom);
    const at = Number(localStorage.getItem(STORAGE.lastRoomAt) || 0);
    if (last && Date.now() - at < 1000 * 60 * 60 * 12) $("roomCode").placeholder = `上次房號 ${last}`;
  }

  bindEvents();
  if (appState.pendingInviteRoom) setTimeout(autoJoinInviteRoom, 250);
  startUiTicker();
  renderLocalStatsSummary();
  renderReleaseChecklist();
  appState.testViewSeat = loadTestViewSeat();
  $("versionFooter").textContent = `合約橋牌 ${BUILD}｜預設閉手變體｜Firebase 多人房間`;
  showOnboardingIfFirstVisit();
}

function bindEvents() {
  $("btnStartOffline").addEventListener("click", startOfflineGame);
  $("btnQuickBeginner").addEventListener("click", () => { setPlayerHintsVisible(true); $("offlineMode").value = "closed"; startOfflineGame(); });
  $("btnQuickStandard").addEventListener("click", () => { $("offlineMode").value = "standard"; startOfflineGame(); });
  $("btnQuickClosed").addEventListener("click", () => { $("offlineMode").value = "closed"; startOfflineGame(); });
  $("btnQuickMultiplayer").addEventListener("click", () => $("roomCode").scrollIntoView({ behavior: "smooth", block: "center" }));
  $("btnRunAiTest").addEventListener("click", runAiHealthCheck);
  $("btnRunDiagnostics").addEventListener("click", runDiagnostics);
  $("btnStartSeatSimulator")?.addEventListener("click", startSeatSimulatorGame);
  $("btnRunFirebaseDeployCheck")?.addEventListener("click", runFirebaseDeploymentCheck);
  $("btnShowLocalStats").addEventListener("click", renderLocalStatsSummary);
  $("btnShareStats").addEventListener("click", shareLocalStats);
  $("btnShareAchievements").addEventListener("click", shareAchievements);
  $("btnExportLocalData").addEventListener("click", exportLocalData);
  $("btnImportLocalData").addEventListener("click", () => $("importDataDialog").showModal());
  $("btnPasteCurrentBackup").addEventListener("click", () => { $("importDataText").value = JSON.stringify(collectLocalData(), null, 2); });
  $("btnApplyImportData").addEventListener("click", restoreLocalDataFromDialog);
  $("closeImportData").addEventListener("click", () => $("importDataDialog").close());
  $("btnCopyErrorReport").addEventListener("click", copyErrorReport);
  $("btnCopySupportBundle").addEventListener("click", copySupportBundle);
  $("btnClearPwaCache").addEventListener("click", clearPwaCachesAndReload);
  $("btnResetLocalData").addEventListener("click", resetLocalData);
  $("btnConnect").addEventListener("click", connectFirebase);
  $("btnCreateRoom").addEventListener("click", createRoom);
  $("btnJoinRoom").addEventListener("click", () => joinRoomFromInput(false));
  $("btnJoinSpectator").addEventListener("click", () => joinRoomFromInput(true));
  $("btnLeave").addEventListener("click", leaveRoom);
  $("btnGameExit").addEventListener("click", leaveRoom);
  $("btnCopyLink").addEventListener("click", copyInviteLink);
  $("btnAddBot").addEventListener("click", hostAddBot);
  $("btnRemoveBot").addEventListener("click", hostRemoveBot);
  $("btnStartGame").addEventListener("click", hostStartGame);
  $("btnTakeOverOfflineLobby").addEventListener("click", hostTakeOverOfflinePlayers);
  $("btnTakeOverOfflineGame").addEventListener("click", hostTakeOverOfflinePlayers);
  $("btnTakeOverCurrentGame")?.addEventListener("click", hostTakeOverCurrentOfflinePlayer);
  $("btnForceContinueGame")?.addEventListener("click", hostForceContinueGame);
  $("btnExtendRoomLobby").addEventListener("click", hostExtendRoom);
  $("btnCopyRoomMaintenanceLobby").addEventListener("click", copyRoomMaintenanceSummary);
  $("btnCloseRoomLobby").addEventListener("click", hostCloseRoom);
  $("btnCloseRoomGame").addEventListener("click", hostCloseRoom);
  $("lobbyMode").addEventListener("change", hostUpdateSettingsFromLobby);
  $("lobbyVulnerability").addEventListener("change", hostUpdateSettingsFromLobby);
  $("difficulty").addEventListener("input", () => { $("difficultyLabel").textContent = $("difficulty").value; hostUpdateSettingsFromLobby(); });
  $("lobbyPacing")?.addEventListener("change", hostUpdateSettingsFromLobby);
  $("lobbyScoringMode")?.addEventListener("change", hostUpdateSettingsFromLobby);
  $("allowSpectators")?.addEventListener("change", hostUpdateSettingsFromLobby);
  $("allowBotFill")?.addEventListener("change", hostUpdateSettingsFromLobby);
  $("btnToggleReady")?.addEventListener("click", toggleMyReady);
  $("btnTransferHost")?.addEventListener("click", hostTransferToSelectedSeat);
  $("gamePacing")?.addEventListener("change", hostUpdatePacingFromGame);
  $("btnCopyLinkGame")?.addEventListener("click", copyInviteLink);
  $("btnUndoLastGame")?.addEventListener("click", hostUndoLastAction);
  $("btnUndoTrickGame")?.addEventListener("click", hostUndoWholeTrick);
  $("btnUndoToPlayStartGame")?.addEventListener("click", hostUndoToPlayStart);
  $("btnRedealCurrentGame")?.addEventListener("click", hostRedealCurrentBoard);
  $("btnCopyErrorReportGame")?.addEventListener("click", copyDetailedErrorReport);
  $("btnCopyErrorReportSide")?.addEventListener("click", copyDetailedErrorReport);
  $("btnDownloadErrorSnapshotGame")?.addEventListener("click", downloadErrorSnapshot);
  $("btnDownloadErrorSnapshotSide")?.addEventListener("click", downloadErrorSnapshot);
  $("btnRepairStuckGame")?.addEventListener("click", hostRepairStuckGame);
  $("btnCopySyncDiagnostics")?.addEventListener("click", copySyncDiagnosticsReport);
  $("btnDownloadSyncDiagnostics")?.addEventListener("click", downloadSyncDiagnosticsSnapshot);
  $("btnResetTutorialChapter1")?.addEventListener("click", resetTutorialChapter1);
  $("btnTurnAlertFocus")?.addEventListener("click", scrollToCurrentAction);
  $("showAiThoughts").addEventListener("change", hostUpdateSettingsFromLobby);
  $("btnToggleLog").addEventListener("click", () => setLogVisible(!getBool(STORAGE.logVisible, false)));
  $("btnOnboarding").addEventListener("click", () => showOnboardingDialog(true));
  $("closeOnboarding").addEventListener("click", () => finishOnboarding(false));
  $("btnStartAfterGuide").addEventListener("click", () => finishOnboarding(false));
  $("btnEnableHintsFromGuide").addEventListener("click", () => { setPlayerHintsVisible(true); finishOnboarding(false); });
  $("btnOpenReleaseNotes").addEventListener("click", () => $("releaseNotesDialog").showModal());
  $("closeReleaseNotes").addEventListener("click", () => $("releaseNotesDialog").close());
  $("btnOpenTutorialFromRelease").addEventListener("click", () => { $("releaseNotesDialog").close(); $("tutorialDialog").showModal(); });
  $("btnOpenReleaseChecklist").addEventListener("click", () => { renderReleaseChecklist(); $("releaseChecklistDialog").showModal(); });
  $("closeReleaseChecklist").addEventListener("click", () => $("releaseChecklistDialog").close());
  $("btnChecklistDiagnostics").addEventListener("click", () => { runDiagnostics(); renderReleaseChecklist(); });
  $("btnCopyChecklistResult").addEventListener("click", copyReleaseChecklistResult);
  $("btnResetChecklist").addEventListener("click", resetReleaseChecklist);
  $("btnOpenTutorial").addEventListener("click", () => $("tutorialDialog").showModal());
  $("closeTutorial").addEventListener("click", () => $("tutorialDialog").close());
  $("btnTutorialEnableHints").addEventListener("click", () => { setPlayerHintsVisible(true); toast("已開啟玩家提示"); });
  $("btnTutorialOpenRules").addEventListener("click", () => { $("tutorialDialog").close(); $("rulesDialog").showModal(); });
  $("btnRules").addEventListener("click", () => $("rulesDialog").showModal());
  $("closeRules").addEventListener("click", () => $("rulesDialog").close());
  $("btnCopyPublicLink").addEventListener("click", copyPublicGameLink);
  $("btnCopyPublicIntro").addEventListener("click", copyPublicIntroText);
  $("btnOpenPublicStatus").addEventListener("click", openPublicStatusDialog);
  $("btnOpenPublicStatusTop").addEventListener("click", openPublicStatusDialog);
  $("closePublicStatus").addEventListener("click", () => $("publicStatusDialog").close());
  $("btnCopyPublicStatus").addEventListener("click", copyPublicStatusReport);
  $("btnCopyPublicLinkInDialog").addEventListener("click", copyPublicGameLink);
  $("btnClearPwaCachePublic").addEventListener("click", clearPwaCachesAndReload);
  $("btnOpenShareKit").addEventListener("click", openShareKitDialog);
  $("closeShareKit").addEventListener("click", () => $("shareKitDialog").close());
  document.querySelectorAll("[data-share-copy]").forEach((btn) => btn.addEventListener("click", () => copyShareKitText(btn.dataset.shareCopy)));
  $("themeSelect").addEventListener("change", (e) => applyTheme(e.target.value, true));
  $("hintToggle").addEventListener("change", (e) => setPlayerHintsVisible(e.target.checked));
  $("soundToggle").addEventListener("change", (e) => setSoundEnabled(e.target.checked));
  $("vibrationToggle").addEventListener("change", (e) => setVibrationEnabled(e.target.checked));
  $("touchComfortToggle").addEventListener("change", (e) => setTouchComfortEnabled(e.target.checked));
  $("soundProfile").addEventListener("change", (e) => { localStorage.setItem(STORAGE.soundProfile, e.target.value); toast("音效風格已更新"); });
  $("btnTestSound").addEventListener("click", () => { setSoundEnabled(true); playSfx("turn"); toast("音效測試"); });
  $("btnTestVibration").addEventListener("click", () => { setVibrationEnabled(true); vibrate([24, 35, 24]); toast("震動測試"); });
  $("resultClose").addEventListener("click", () => $("resultOverlay").classList.add("hidden"));
  $("resultReplay").addEventListener("click", () => openReplayDialog(currentGame()));
  $("resultNewDeal").addEventListener("click", () => { $("resultOverlay").classList.add("hidden"); hostStartGame(); });
  $("closeReplay").addEventListener("click", () => $("replayDialog").close());
  $("btnShareReplay").addEventListener("click", shareReplay);
  $("btnCopyHandRecordGame")?.addEventListener("click", copyCurrentHandRecord);
  $("btnDownloadHandRecordGame")?.addEventListener("click", downloadCurrentHandRecord);
  $("btnCopyReviewGame")?.addEventListener("click", copyCurrentReview);
  $("resultCopyHandRecord")?.addEventListener("click", copyCurrentHandRecord);
  $("resultDownloadHandRecord")?.addEventListener("click", downloadCurrentHandRecord);
  $("resultCopyReview")?.addEventListener("click", copyCurrentReview);
  $("btnCopyHandRecordReplay")?.addEventListener("click", copyCurrentHandRecord);
  $("btnReplayPrev")?.addEventListener("click", () => moveReplayStep(-1));
  $("btnReplayNext")?.addEventListener("click", () => moveReplayStep(1));
  $("btnReplayPlay")?.addEventListener("click", autoPlayReplay);
  $("replayStepSelect")?.addEventListener("change", (e) => setReplayStep(Number(e.target.value || 0)));
  $("btnRecordDrawerToggle")?.addEventListener("click", toggleRecordDrawer);
  document.querySelectorAll("[data-test-view-seat]").forEach((btn) => btn.addEventListener("click", () => setTestViewSeat(btn.dataset.testViewSeat)));
  document.querySelectorAll("[data-record-tab-btn]").forEach((btn) => btn.addEventListener("click", () => setRecordTab(btn.dataset.recordTabBtn)));
  $("btnReloadUpdate").addEventListener("click", reloadForUpdate);
  $("btnDismissUpdate").addEventListener("click", () => $("updateBanner").classList.add("hidden"));
}

function setCheckbox(id, value) { const el = $(id); if (el) el.checked = Boolean(value); }
function loadSetting(key, fallback) { return localStorage.getItem(key) ?? fallback; }
function getBool(key, fallback) { const v = localStorage.getItem(key); return v == null ? fallback : v === "true"; }
function randomGuestName() { return `玩家${Math.floor(100 + Math.random() * 900)}`; }

function loadTestViewSeat() {
  const raw = localStorage.getItem(STORAGE.testViewSeat);
  if (raw === "spectator") return "spectator";
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}
function setTestViewSeat(value) {
  if (value === "clear" || value == null || value === "") {
    appState.testViewSeat = null;
    appState.spectator = false;
    localStorage.removeItem(STORAGE.testViewSeat);
    toast("已關閉座位視角模擬");
  } else if (value === "spectator") {
    appState.testViewSeat = "spectator";
    appState.spectator = true;
    localStorage.setItem(STORAGE.testViewSeat, "spectator");
    toast("已切換成觀戰視角測試");
  } else {
    const seat = Number(value);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) return;
    appState.testViewSeat = seat;
    appState.spectator = false;
    localStorage.setItem(STORAGE.testViewSeat, String(seat));
    toast(`已切換成 ${seatName(seat)} 視角`);
  }
  renderAll();
}
function isSeatSimulationActive(room = appState.room) {
  return Boolean(appState.testMode || room?.meta?.testSeatSimulation || appState.testViewSeat !== null);
}

function ensureClientId() {
  let id = localStorage.getItem(STORAGE.clientId);
  if (!id) {
    id = `client-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE.clientId, id);
  }
  return id;
}

function applyTheme(theme, persist = false) {
  if (persist) localStorage.setItem(STORAGE.theme, theme);
  const actual = theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "twilight" : "ocean") : theme;
  document.documentElement.dataset.theme = actual;
  const picker = $("themeSelect");
  if (picker) picker.value = theme;
}
function watchSystemTheme() {
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (loadSetting(STORAGE.theme, "auto") === "auto") applyTheme("auto");
  });
}
function setPlayerHintsVisible(v) { localStorage.setItem(STORAGE.hints, String(v)); setCheckbox("hintToggle", v); applyPlayerHintsVisible(v); }
function applyPlayerHintsVisible(v) { $("playerTips")?.classList.toggle("hidden", !v); }
function setSoundEnabled(v) { localStorage.setItem(STORAGE.sound, String(v)); setCheckbox("soundToggle", v); if (v) playSfx("turn"); }
function setVibrationEnabled(v) { localStorage.setItem(STORAGE.vibration, String(v)); setCheckbox("vibrationToggle", v); if (v) vibrate(18); }
function setTouchComfortEnabled(v) { localStorage.setItem(STORAGE.touch, String(v)); setCheckbox("touchComfortToggle", v); applyTouchComfort(); }
function applyTouchComfort() { document.body.classList.toggle("touch-comfort", getBool(STORAGE.touch, false)); }
function applyPlayConfirmMode() { document.body.classList.toggle("confirm-play-mode", getBool(STORAGE.confirmPlay, false)); }
function setLogVisible(v) { localStorage.setItem(STORAGE.logVisible, String(v)); applyLogVisibility(v); }
function applyLogVisibility(v) {
  document.body.classList.toggle("log-visible", v);
  $("btnToggleLog").textContent = v ? "隱藏紀錄" : "顯示紀錄";
  $("logSummary").textContent = v ? "牌局紀錄已顯示。" : "牌局紀錄已隱藏。";
}
function showOnboardingIfFirstVisit() {
  if (!localStorage.getItem("bridge.seenOnboarding")) showOnboardingDialog(false);
}
function showOnboardingDialog(force) { if (force || !localStorage.getItem("bridge.seenOnboarding")) $("onboardingDialog").showModal(); }
function finishOnboarding() { localStorage.setItem("bridge.seenOnboarding", "1"); $("onboardingDialog").close(); }

async function connectFirebase() {
  setStatus("正在連線 Firebase…");
  try {
    if (!appState.firebase) {
      const [appMod, authMod, dbMod] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js")
      ]);
      const firebaseApp = appMod.initializeApp(firebaseConfig);
      appState.firebase = {
        app: firebaseApp,
        auth: authMod.getAuth(firebaseApp),
        db: dbMod.getDatabase(firebaseApp),
        ref: dbMod.ref,
        set: dbMod.set,
        update: dbMod.update,
        get: dbMod.get,
        onValue: dbMod.onValue,
        push: dbMod.push,
        remove: dbMod.remove,
        serverTimestamp: dbMod.serverTimestamp,
        onDisconnect: dbMod.onDisconnect,
        runTransaction: dbMod.runTransaction,
        signInAnonymously: authMod.signInAnonymously
      };
    }
    const credential = await appState.firebase.signInAnonymously(appState.firebase.auth);
    appState.firebaseUid = credential.user.uid;
    appState.clientId ||= ensureClientId();
    appState.uid = appState.firebaseUid;
    appState.connected = true;
    $("btnCreateRoom").disabled = false;
    $("btnJoinRoom").disabled = false;
    $("btnJoinSpectator").disabled = false;
    setStatus(`Firebase 已連線：${appState.firebaseUid.slice(0, 8)}…`);
    playSfx("success");
    return true;
  } catch (error) {
    console.error(error);
    setStatus(`Firebase 連線失敗：${error.message}`);
    toast("Firebase 連線失敗");
    return false;
  }
}
function setStatus(text) { $("connectStatus").textContent = text; }

function normalizeRoomCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function getInviteRoomFromLocation() {
  const candidates = [];
  try {
    const params = new URLSearchParams(location.search);
    candidates.push(params.get("room"), params.get("r"), params.get("code"));
  } catch (error) {
    console.warn("無法讀取邀請網址參數", error);
  }
  try {
    const rawHash = String(location.hash || "").replace(/^#/, "");
    const hashQuery = rawHash.includes("?") ? rawHash.slice(rawHash.indexOf("?") + 1) : rawHash;
    if (hashQuery && hashQuery.includes("=")) {
      const params = new URLSearchParams(hashQuery);
      candidates.push(params.get("room"), params.get("r"), params.get("code"));
    }
  } catch (error) {
    console.warn("無法讀取邀請網址 hash 參數", error);
  }
  return normalizeRoomCode(candidates.find((value) => normalizeRoomCode(value)) || "");
}
async function autoJoinInviteRoom() {
  const code = normalizeRoomCode(appState.pendingInviteRoom);
  if (!code || appState.inviteAutoJoinAttempted || appState.room) return;
  appState.inviteAutoJoinAttempted = true;
  $("roomCode").value = code;
  setStatus(`正在透過邀請連結加入房間 ${code}…`);
  await joinRoomByCode(code, false, true);
}
function startUiTicker() {
  if (appState.uiTicker) clearInterval(appState.uiTicker);
  appState.uiTicker = setInterval(renderTemporalHud, 1000);
}

function renderTemporalHud() {
  const room = appState.room;
  if (!room || room.meta?.status !== "game" || !room.game) return;
  try {
    normalizeGame(room.game);
    renderPhase(room.game);
    renderDealProgress(room.game, room);
    renderTurnWaitCard(room);
    renderGameRoomStatus(room);
    renderSyncTestPanel(room);
    renderTable(room);
    renderMobileQuickNav(room);
  } catch (error) {
    console.warn("temporal HUD refresh failed", error);
  }
}

function roomPath(code = appState.roomCode) { return `rooms/${code}`; }
function actionsPath(code = appState.roomCode) { return `rooms/${code}/actions`; }
function privateHandsPath(code = appState.roomCode) { return `roomPrivateHands/${code}`; }
function roomUndoPath(code = appState.roomCode) { return `roomUndo/${code}`; }

async function createRoom() {
  if (!appState.connected && !(await connectFirebase())) return;
  savePlayerName();
  const code = await generateUniqueRoomCode();
  appState.roomCode = code;
  appState.offline = false;
  appState.spectator = false;
  appState.testMode = false;
  appState.testViewSeat = null;
  localStorage.removeItem(STORAGE.testViewSeat);
  const now = Date.now();
  const room = {
    meta: { code, hostUid: appState.uid, arbiterUid: appState.uid, status: "lobby", createdAt: now, updatedAt: now, expiresAt: now + 24 * 60 * 60 * 1000, schemaVersion: ROOM_SCHEMA_VERSION, appBuild: BUILD },
    lobby: {
      dealer: 2,
      boardNo: 1,
      settings: defaultSettingsFromUI("lobby"),
      lockedSeats: {},
      seats: {
        0: null,
        1: null,
        2: makeSeat(2, appState.uid, $("playerName").value, "human"),
        3: null
      }
    },
    actions: null,
    actionAudit: null,
    match: null,
    game: null
  };
  await appState.firebase.set(appState.firebase.ref(appState.firebase.db, roomPath(code)), room);
  localStorage.setItem(STORAGE.lastRoom, code);
  localStorage.setItem(STORAGE.lastRoomAt, String(now));
  updateRoomUrl(code);
  subscribeRoom(code);
  toast(`已建立房間 ${code}`);
}
async function generateUniqueRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 20; i++) {
    const code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const snap = await appState.firebase.get(appState.firebase.ref(appState.firebase.db, roomPath(code)));
    if (!snap.exists()) return code;
  }
  return `B${Date.now().toString(36).toUpperCase().slice(-5)}`;
}
function makeSeat(seat, uid, name, type = "human", clientId = null) {
  const now = Date.now();
  const isHuman = type === "human";
  return {
    seat,
    uid,
    clientId: isHuman ? (clientId || appState.clientId || uid) : null,
    name: String(name || randomGuestName()).slice(0, 12),
    type,
    joinedAt: now,
    lastSeen: now,
    online: true,
    ready: type === "bot" ? true : false
  };
}
async function joinRoomFromInput(spectator = false) {
  const code = normalizeRoomCode($("roomCode").value);
  await joinRoomByCode(code, spectator, false);
}
async function joinRoomByCode(code, spectator = false, fromInvite = false) {
  code = normalizeRoomCode(code);
  if (!code) return toast(fromInvite ? "邀請連結沒有房號" : "請輸入房號");
  $("roomCode").value = code;
  if (!appState.connected && !(await connectFirebase())) {
    if (fromInvite) setStatus(`偵測到邀請房號 ${code}，但 Firebase 連線失敗，請稍後重試。`);
    return;
  }
  savePlayerName();
  const snap = await appState.firebase.get(appState.firebase.ref(appState.firebase.db, roomPath(code)));
  if (!snap.exists()) {
    setStatus(fromInvite ? `找不到邀請房間 ${code}，請確認房主還在房間內。` : "找不到房間");
    return toast("找不到房間");
  }
  const room = snap.val();
  if (spectator && room?.lobby?.settings?.allowSpectators === false) {
    setStatus(`房間 ${code} 已關閉觀戰加入`);
    return toast("房主目前不開放觀戰");
  }
  if (room?.meta?.status === "closed") {
    setStatus(`房間 ${code} 已關閉`);
    return toast("房間已關閉");
  }
  appState.roomCode = code;
  appState.offline = false;
  appState.testMode = Boolean(room?.meta?.testSeatSimulation);
  if (!room?.meta?.testSeatSimulation) { appState.testViewSeat = null; localStorage.removeItem(STORAGE.testViewSeat); }
  appState.spectator = spectator;
  if (!spectator) {
    const existing = findSeatByUid(room, appState.uid, appState.clientId);
    if (existing != null) {
      const previous = room.lobby?.seats?.[existing] || {};
      await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath(code)), {
        [`lobby/seats/${existing}`]: {
          ...previous,
          seat: existing,
          uid: appState.uid,
          clientId: appState.clientId,
          name: String($("playerName").value || previous.name || randomGuestName()).slice(0, 12),
          type: "human",
          online: true,
          lastSeen: Date.now(),
          rejoinedAt: Date.now()
        },
        "meta/updatedAt": Date.now()
      });
      toast(`已恢復 ${seatName(existing)} 座位`);
    } else if (room?.meta?.status === "lobby") {
      const firstEmpty = firstEmptySeat(room);
      if (firstEmpty == null) {
        if (room?.lobby?.settings?.allowSpectators === false) {
          appState.roomCode = null;
          appState.spectator = false;
          return toast("座位已滿，且房主未開放觀戰");
        }
        appState.spectator = true;
        toast("座位已滿，改以觀戰加入");
      } else {
        await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath(code)), {
          [`lobby/seats/${firstEmpty}`]: makeSeat(firstEmpty, appState.uid, $("playerName").value, "human"),
          "meta/updatedAt": Date.now()
        });
      }
    } else {
      if (room?.lobby?.settings?.allowSpectators === false) {
        appState.roomCode = null;
        appState.spectator = false;
        return toast("牌局已開始，且房主未開放觀戰");
      }
      appState.spectator = true;
      toast("牌局已開始，沒有原座位，改以觀戰加入");
    }
  }
  localStorage.setItem(STORAGE.lastRoom, code);
  localStorage.setItem(STORAGE.lastRoomAt, String(Date.now()));
  updateRoomUrl(code);
  subscribeRoom(code);
  toast(appState.spectator ? `以觀戰加入 ${code}` : `已加入房間 ${code}`);
}
function subscribeRoom(code) {
  if (appState.roomUnsub) appState.roomUnsub();
  stopPrivateHandsSubscription();
  stopPrivateHandsSubscription();
  appState.privateHands = {};
  const roomRef = appState.firebase.ref(appState.firebase.db, roomPath(code));
  appState.roomUnsub = appState.firebase.onValue(roomRef, (snap) => {
    const value = snap.val();
    if (!value) {
      toast("房間不存在或已刪除");
      leaveRoom(true);
      return;
    }
    appState.room = normalizeRoom(value);
    ensurePrivateHandsSubscription();
    maintainPresence();
    maybeAutoTransferHost();
    renderAll();
    maybeProcessActions();
    maybeResolveTrickPause();
    maybeScheduleBot();
  }, (error) => {
    console.error(error);
    toast("房間同步失敗");
  });
}
function stopPrivateHandsSubscription() {
  if (appState.privateHandsUnsub) appState.privateHandsUnsub();
  appState.privateHandsUnsub = null;
  appState.privateHandsSubKey = null;
}
function ensurePrivateHandsSubscription() {
  if (appState.offline || !appState.connected || !appState.roomCode || !appState.room?.game) return;
  const mySeat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  const key = isHost() ? `${appState.roomCode}:host-all` : `${appState.roomCode}:seat-${mySeat ?? "spectator"}`;
  if (appState.privateHandsSubKey === key) return;
  stopPrivateHandsSubscription();
  appState.privateHandsSubKey = key;
  const path = isHost() ? privateHandsPath(appState.roomCode) : (mySeat == null ? null : `${privateHandsPath(appState.roomCode)}/${mySeat}`);
  if (!path) { appState.privateHands = {}; appState.room = normalizeRoom(appState.room); renderAll(); return; }
  appState.privateHandsUnsub = appState.firebase.onValue(appState.firebase.ref(appState.firebase.db, path), (snap) => {
    const value = snap.val();
    if (isHost()) appState.privateHands = normalizePrivateHandMap(value || {});
    else appState.privateHands = mySeat == null ? {} : { [mySeat]: normalizePrivateHandEntry(value || {}) };
    if (appState.room) appState.room = normalizeRoom(appState.room);
    renderAll();
    maybeProcessActions();
    maybeResolveTrickPause();
    maybeScheduleBot();
  }, (error) => {
    console.warn("private hands sync failed", error);
    toast("私人手牌同步失敗，請確認 Firebase 規則或重新整理");
  });
}
function normalizeRoom(room) {
  room.lobby ||= { dealer: 2, boardNo: 1, settings: defaultSettingsFromUI("lobby"), seats: {} };
  room.lobby.seats ||= {};
  room.lobby.lockedSeats ||= {};
  for (let i = 0; i < 4; i++) if (room.lobby.seats[i] === undefined) room.lobby.seats[i] = null;
  room.lobby.settings ||= defaultSettingsFromUI("lobby");
  if (room.lobby.settings.allowBotFill == null) room.lobby.settings.allowBotFill = true;
  room.meta ||= {};
  room.meta.arbiterUid ||= room.meta.hostUid;
  room.match ||= defaultMatchState(room.lobby.settings);
  if (room.game) room.game = hydrateGameForViewer(room.game, room);
  return room;
}
function listFromFirebase(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null);
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key])
    .filter((item) => item !== undefined && item !== null);
}

function normalizePrivateHandEntry(entry) {
  if (Array.isArray(entry)) return { current: listFromFirebase(entry), initial: listFromFirebase(entry) };
  entry ||= {};
  return { current: listFromFirebase(entry.current || entry.hand || []), initial: listFromFirebase(entry.initial || entry.current || entry.hand || []) };
}
function normalizePrivateHandMap(map) {
  const out = {};
  for (let seat = 0; seat < 4; seat++) {
    const entry = map?.[seat] ?? map?.[String(seat)];
    if (entry) out[seat] = normalizePrivateHandEntry(entry);
  }
  return out;
}
function privateHandPayloadFromGame(game) {
  normalizeGame(game);
  const payload = {};
  for (let seat = 0; seat < 4; seat++) payload[seat] = { current: listFromFirebase(game.hands?.[seat] || []), initial: listFromFirebase(game.initialHands?.[seat] || game.hands?.[seat] || []) };
  return payload;
}
function publicGameFromFull(fullGame) {
  const game = structuredCloneCompat(fullGame);
  normalizeGame(game);
  const privatePayload = privateHandPayloadFromGame(game);
  const revealedHands = {};
  const revealedInitialHands = {};
  if (game.mode === "standard" && game.dummyVisible && game.dummy != null) revealedHands[game.dummy] = privatePayload[game.dummy].current;
  if (game.phase === "scoring") {
    for (let seat = 0; seat < 4; seat++) {
      revealedHands[seat] = privatePayload[seat].current;
      revealedInitialHands[seat] = privatePayload[seat].initial;
    }
  }
  game.handCounts = [0, 1, 2, 3].map((seat) => privatePayload[seat].current.length);
  game.hands = null;
  game.initialHands = null;
  game.revealedHands = revealedHands;
  game.revealedInitialHands = revealedInitialHands;
  game.security = {
    design: "firebase-split-public-private-hands",
    enforcedInClient: true,
    publicPath: "rooms/{code}/game",
    privatePath: "roomPrivateHands/{code}/{seat}",
    actionModel: "players submit intent to rooms/{code}/actions; host validates before state update",
    limitations: "Pure client-side host arbitration still trusts the host device. Deploy database.rules.secure.example.json for per-seat read restrictions."
  };
  return game;
}
function hydrateGameForViewer(publicGame, room) {
  const game = structuredCloneCompat(publicGame || {});
  const rawHands = game.hands;
  const rawInitial = game.initialHands;
  const revealed = game.revealedHands || {};
  const revealedInitial = game.revealedInitialHands || {};
  const privateMap = appState.offline ? {} : (appState.privateHands || {});
  const hands = [];
  const initialHands = [];
  for (let seat = 0; seat < 4; seat++) {
    const privateEntry = privateMap[seat] || privateMap[String(seat)];
    const revealedCurrent = revealed[seat] ?? revealed[String(seat)];
    const revealedStart = revealedInitial[seat] ?? revealedInitial[String(seat)];
    const fallbackCurrent = rawHands ? (rawHands[seat] ?? rawHands[String(seat)]) : [];
    const fallbackStart = rawInitial ? (rawInitial[seat] ?? rawInitial[String(seat)]) : [];
    hands[seat] = listFromFirebase(privateEntry?.current || revealedCurrent || fallbackCurrent || []);
    initialHands[seat] = listFromFirebase(privateEntry?.initial || revealedStart || fallbackStart || hands[seat] || []);
  }
  game.hands = hands;
  game.initialHands = initialHands;
  game.handCounts = [0, 1, 2, 3].map((seat) => Number(publicGame?.handCounts?.[seat] ?? hands[seat].length ?? 0));
  return normalizeGame(game);
}
function defaultMatchState(settings = {}) {
  const mode = settings.scoringMode || "single";
  return { mode, targetBoards: chicagoBoardCount(mode), boards: [], totalScore: { NS: 0, EW: 0 }, setNo: 1, startedAt: Date.now(), updatedAt: Date.now(), completedSets: [] };
}
function chicagoBoardCount(modeOrSettings) {
  const mode = typeof modeOrSettings === "string" ? modeOrSettings : (modeOrSettings?.scoringMode || modeOrSettings?.mode || "single");
  const match = String(mode || "").match(/^chicago(\d+)$/);
  return match ? Math.max(4, Math.min(16, Number(match[1]) || 4)) : 1;
}
function isChicagoMode(mode) { return /^chicago\d+$/.test(String(mode || "")); }
function scoreModeLabel(mode) { return isChicagoMode(mode) ? `Chicago ${chicagoBoardCount(mode)} 副制` : "單副練習"; }
function prepareMatchForNextGame(room) {
  const settings = room?.lobby?.settings || {};
  let match = structuredCloneCompat(room?.match || defaultMatchState(settings));
  if (match.mode !== (settings.scoringMode || "single")) match = defaultMatchState(settings);
  match.mode = settings.scoringMode || "single";
  match.targetBoards = chicagoBoardCount(match.mode);
  match.boards ||= [];
  match.totalScore ||= { NS: 0, EW: 0 };
  match.completedSets ||= [];
  if (room?.game?.phase === "scoring" && room.game.result && !match.boards.some((b) => b.gameId === room.game.id)) {
    match.boards.push({
      no: room.game.boardNo,
      gameId: room.game.id,
      contract: room.game.contract ? contractText(room.game.contract, room.game.declarer) : "Passed out",
      result: room.game.result.summary || "已結算",
      delta: room.game.result.scoreDelta || { NS: 0, EW: 0 },
      totalAfter: room.game.score || match.totalScore,
      at: Date.now()
    });
    match.totalScore = { NS: Number(room.game.score?.NS || match.totalScore.NS || 0), EW: Number(room.game.score?.EW || match.totalScore.EW || 0) };
  }
  if (match.mode === "single") { match.boards = []; match.totalScore = { NS: 0, EW: 0 }; match.completedSets = []; match.targetBoards = 1; }
  const targetBoards = chicagoBoardCount(match.mode);
  if (isChicagoMode(match.mode) && match.boards.length >= targetBoards) {
    const completedBoards = match.boards.slice(-targetBoards);
    const finalScore = { NS: Number(match.totalScore?.NS || 0), EW: Number(match.totalScore?.EW || 0) };
    const winner = finalScore.NS === finalScore.EW ? "平手" : finalScore.NS > finalScore.EW ? "南北" : "東西";
    const margin = Math.abs(finalScore.NS - finalScore.EW);
    match = {
      mode: settings.scoringMode || match.mode,
      targetBoards,
      boards: [],
      totalScore: { NS: 0, EW: 0 },
      setNo: Number(match.setNo || 1) + 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedSets: [...listFromFirebase(match.completedSets).slice(-3), { setNo: Number(match.setNo || 1), boards: completedBoards, totalScore: finalScore, winner, margin, completedAt: Date.now(), targetBoards }],
      lastCompletedSet: { setNo: Number(match.setNo || 1), boards: completedBoards, totalScore: finalScore, winner, margin, completedAt: Date.now(), targetBoards }
    };
  }
  match.updatedAt = Date.now();
  return match;
}
function matchHandNumber(match) { const target = chicagoBoardCount(match?.mode || match); return (listFromFirebase(match?.boards).length % Math.max(1, target)) + 1; }

function normalizeGame(game) {
  game.auction = listFromFirebase(game.auction);
  game.currentTrick = listFromFirebase(game.currentTrick);
  game.trickHistory = listFromFirebase(game.trickHistory);
  game.log = listFromFirebase(game.log);
  if (game.pendingTrick) game.pendingTrick.plays = listFromFirebase(game.pendingTrick.plays);
  const rawHands = game.hands || {};
  game.hands = [0, 1, 2, 3].map((seat) => listFromFirebase(rawHands[seat] ?? rawHands[String(seat)]));
  const rawInitialHands = game.initialHands || game.hands || {};
  game.initialHands = [0, 1, 2, 3].map((seat) => listFromFirebase(rawInitialHands[seat] ?? rawInitialHands[String(seat)]));
  game.handCounts = [0, 1, 2, 3].map((seat) => Number(game.handCounts?.[seat] ?? game.hands?.[seat]?.length ?? game.initialHands?.[seat]?.length ?? 0));
  game.security ||= { design: "public-state-private-hands", policy: "UI hides unrevealed hands; secure Firebase rules can enforce per-seat private data", schemaVersion: 1 };
  game.processedActions ||= {};
  game.actionSerial = Number(game.actionSerial || 0);
  game.tricksWon ||= { NS: 0, EW: 0 };
  game.score ||= { NS: 0, EW: 0 };
  game.auction ||= [];
  game.currentTrick ||= [];
  game.trickHistory ||= [];
  game.log ||= [];
  return game;
}
function findSeatByUid(room, uid = appState.uid, clientId = appState.clientId) {
  if (appState.testViewSeat === "spectator") return null;
  if (Number.isInteger(appState.testViewSeat) && appState.testViewSeat >= 0 && appState.testViewSeat <= 3 && isSeatSimulationActive(room)) return appState.testViewSeat;
  const seats = room?.lobby?.seats || {};
  for (let i = 0; i < 4; i++) if (uid && seats[i]?.uid === uid) return i;
  for (let i = 0; i < 4; i++) if (clientId && seats[i]?.type === "human" && seats[i]?.clientId === clientId) return i;
  return null;
}
function firstEmptySeat(room) {
  const order = [2, 0, 1, 3];
  const seats = room?.lobby?.seats || {};
  const locked = room?.lobby?.lockedSeats || {};
  return order.find((seat) => !seats[seat] && !locked[seat] && !locked[String(seat)]) ?? null;
}
function isSeatOnline(player, now = Date.now()) {
  if (!player || player.type !== "human") return false;
  return player.online !== false && now - Number(player.lastSeen || 0) < PRESENCE_OFFLINE_MS + 5000;
}
function hostSeat(room = appState.room) {
  const hostUid = room?.meta?.hostUid;
  const seats = room?.lobby?.seats || {};
  for (let seat = 0; seat < 4; seat++) if (seats[seat]?.uid === hostUid) return seat;
  return null;
}
function eligibleHostSeat(room = appState.room) {
  const now = Date.now();
  for (const seat of [2, 0, 1, 3]) {
    const player = room?.lobby?.seats?.[seat];
    if (isSeatOnline(player, now)) return seat;
  }
  return null;
}
function hostFailoverReady(room, now = Date.now()) {
  const hSeat = hostSeat(room);
  const hostPlayer = hSeat == null ? null : room?.lobby?.seats?.[hSeat];
  if (isSeatOnline(hostPlayer, now)) return { ready: false, reason: "host-online", hostSeat: hSeat };
  const lastSeen = Number(hostPlayer?.lastSeen || 0);
  const waited = lastSeen ? now - lastSeen : HOST_FAILOVER_GRACE_MS + 1;
  if (waited < HOST_FAILOVER_GRACE_MS) return { ready: false, reason: "grace", hostSeat: hSeat, remainingMs: HOST_FAILOVER_GRACE_MS - waited };
  return { ready: true, reason: hSeat == null ? "host-not-seated" : "host-offline", hostSeat: hSeat };
}
async function maybeAutoTransferHost() {
  if (appState.offline || appState.spectator || !appState.connected || !appState.roomCode || !appState.room) return;
  if (isHostOrArbiter()) return;
  const now = Date.now();
  if (now - appState.lastHostTransferAttemptAt < 6000) return;
  const failover = hostFailoverReady(appState.room, now);
  if (!failover.ready) return;
  const candidate = eligibleHostSeat(appState.room);
  const mySeat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  if (candidate == null || mySeat !== candidate) return;
  appState.lastHostTransferAttemptAt = now;
  try {
    let becameHost = false;
    const metaRef = appState.firebase.ref(appState.firebase.db, `${roomPath()}/meta`);
    await appState.firebase.runTransaction(metaRef, (meta) => {
      if (!meta) return meta;
      const latestRoom = appState.room;
      const latestCheck = hostFailoverReady({ ...latestRoom, meta }, Date.now());
      if (!latestCheck.ready) return;
      becameHost = true;
      const history = listFromFirebase(meta.hostTransferLog).slice(-8);
      history.push({ from: meta.hostUid || null, to: appState.uid, seat: mySeat, at: Date.now(), reason: latestCheck.reason, build: BUILD });
      return { ...meta, hostUid: appState.uid, arbiterUid: appState.uid, hostTransferredAt: Date.now(), hostTransferReason: latestCheck.reason, hostTransferLog: history, updatedAt: Date.now() };
    });
    if (becameHost) toast("原房主離線超過安全等待時間，已自動轉移房主 / 仲裁者給你");
  } catch (error) {
    console.warn("auto host transfer failed", error);
  }
}
function savePlayerName() { localStorage.setItem(STORAGE.name, $("playerName").value || randomGuestName()); }

function maintainPresence() {
  if (appState.offline || appState.spectator || !appState.connected || !appState.room || !appState.roomCode) {
    stopPresenceHeartbeat();
    return;
  }
  const seat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  const player = appState.room?.lobby?.seats?.[seat];
  if (seat == null || player?.type !== "human") {
    stopPresenceHeartbeat();
    return;
  }
  if (!appState.presenceTimer) {
    updateOwnPresence(true);
    appState.presenceTimer = setInterval(() => updateOwnPresence(false), PRESENCE_HEARTBEAT_MS);
  }
  registerPresenceDisconnect(seat);
}

function stopPresenceHeartbeat() {
  clearInterval(appState.presenceTimer);
  appState.presenceTimer = null;
  appState.presenceRefKey = null;
}

async function updateOwnPresence(force = false) {
  if (appState.offline || appState.spectator || !appState.connected || !appState.roomCode || !appState.room) return;
  const now = Date.now();
  if (!force && now - appState.lastPresenceWriteAt < PRESENCE_HEARTBEAT_MS - 500) return;
  const seat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  if (seat == null) return;
  appState.lastPresenceWriteAt = now;
  try {
    await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath()), {
      [`lobby/seats/${seat}/uid`]: appState.uid,
      [`lobby/seats/${seat}/clientId`]: appState.clientId,
      [`lobby/seats/${seat}/name`]: String($("playerName").value || appState.room.lobby.seats[seat]?.name || randomGuestName()).slice(0, 12),
      [`lobby/seats/${seat}/online`]: true,
      [`lobby/seats/${seat}/lastSeen`]: now
    });
  } catch (error) {
    console.warn("presence update failed", error);
  }
}

function registerPresenceDisconnect(seat) {
  if (!appState.connected || appState.offline || appState.spectator || seat == null) return;
  const key = `${appState.roomCode}:${seat}`;
  if (appState.presenceRefKey === key) return;
  appState.presenceRefKey = key;
  try {
    const ref = appState.firebase.ref(appState.firebase.db, `${roomPath()}/lobby/seats/${seat}`);
    appState.firebase.onDisconnect(ref).update({ online: false, lastSeen: appState.firebase.serverTimestamp() });
  } catch (error) {
    console.warn("presence onDisconnect failed", error);
  }
}

async function markOwnSeatOffline() {
  if (appState.offline || appState.spectator || !appState.connected || !appState.room || !appState.roomCode) return;
  const seat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  if (seat == null) return;
  try {
    await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath()), {
      [`lobby/seats/${seat}/online`]: false,
      [`lobby/seats/${seat}/lastSeen`]: Date.now()
    });
  } catch (error) {
    console.warn("mark offline failed", error);
  }
}

function defaultSettingsFromUI(scope = "offline") {
  if (scope === "lobby") {
    return {
      mode: $("lobbyMode")?.value || "closed",
      vulnerability: $("lobbyVulnerability")?.value || "cycle",
      difficulty: Number($("difficulty")?.value || 10),
      showAiThoughts: Boolean($("showAiThoughts")?.checked ?? true),
      pacingMs: sanitizePacingMs($("lobbyPacing")?.value || AI_ACTION_DELAY_MS),
      scoringMode: $("lobbyScoringMode")?.value || "single",
      allowSpectators: Boolean($("allowSpectators")?.checked ?? true),
      allowBotFill: Boolean($("allowBotFill")?.checked ?? true)
    };
  }
  return {
    mode: $("offlineMode")?.value || "closed",
    vulnerability: $("offlineVulnerability")?.value || "cycle",
    difficulty: Number($("offlineDifficulty")?.value || 10),
    showAiThoughts: true,
    pacingMs: sanitizePacingMs($("offlinePacing")?.value || AI_ACTION_DELAY_MS),
    scoringMode: $("offlineScoringMode")?.value || "single",
    allowSpectators: true,
    allowBotFill: true
  };
}
function sanitizePacingMs(value) {
  const ms = Number(value);
  return PACING_OPTIONS_MS.includes(ms) ? ms : AI_ACTION_DELAY_MS;
}
function getPacingMs(settings) { return sanitizePacingMs(settings?.pacingMs || AI_ACTION_DELAY_MS); }
function getAiActionDelayMs(settings) { return getPacingMs(settings); }
function getTrickClearDelayMs(settings) { return getPacingMs(settings); }
function delaySecondsLabel(ms) { return `${(Number(ms) / 1000).toFixed(Number(ms) % 1000 ? 1 : 0)} 秒`; }
function pacingLabel(settings) { return delaySecondsLabel(getPacingMs(settings)); }
async function hostUpdateSettingsFromLobby() {
  const room = appState.room;
  if (!room || !isHost()) return;
  const settings = defaultSettingsFromUI("lobby");
  await updateRoom({ "lobby/settings": settings, "meta/updatedAt": Date.now() });
}

async function toggleMyReady() {
  if (!appState.room || appState.offline || appState.spectator) return;
  const seat = findSeatByUid(appState.room, appState.uid, appState.clientId);
  if (seat == null) return toast("你目前不是座位玩家");
  const current = Boolean(appState.room?.lobby?.seats?.[seat]?.ready);
  await updateRoom({ [`lobby/seats/${seat}/ready`]: !current, [`lobby/seats/${seat}/readyAt`]: Date.now(), "meta/updatedAt": Date.now() });
  toast(!current ? "已標記準備好了" : "已取消準備");
}
async function hostToggleSeatLock(seat) {
  if (!isHost()) return toast("只有房主可以鎖定座位");
  seat = Number(seat);
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return;
  const locked = Boolean(appState.room?.lobby?.lockedSeats?.[seat] || appState.room?.lobby?.lockedSeats?.[String(seat)]);
  await updateRoom({ [`lobby/lockedSeats/${seat}`]: !locked, "meta/updatedAt": Date.now() });
  toast(`${seatName(seat)} 已${locked ? "解除鎖定" : "鎖定"}`);
}
async function hostClearSeat(seat) {
  if (!isHost()) return toast("只有房主可以清空座位");
  seat = Number(seat);
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) return;
  if (appState.room?.lobby?.seats?.[seat]?.uid === appState.uid) return toast("不能清空房主自己的座位；可先轉讓房主");
  await updateRoom({ [`lobby/seats/${seat}`]: null, "meta/updatedAt": Date.now() });
  toast(`${seatName(seat)} 已清空`);
}
async function hostTransferToSelectedSeat() {
  if (!isHost()) return toast("只有房主可以轉讓房主");
  const seat = Number($("transferHostSeat")?.value);
  const player = appState.room?.lobby?.seats?.[seat];
  if (!player || player.type !== "human" || !player.uid) return toast("請選擇在線真人座位");
  const history = listFromFirebase(appState.room?.meta?.hostTransferLog).slice(-8);
  history.push({ from: appState.uid, to: player.uid, seat, at: Date.now(), reason: "manual-transfer", build: BUILD });
  await updateRoom({ "meta/hostUid": player.uid, "meta/arbiterUid": player.uid, "meta/hostTransferredAt": Date.now(), "meta/hostTransferReason": "manual-transfer", "meta/hostTransferLog": history, "meta/updatedAt": Date.now() });
  toast(`已轉讓房主給 ${player.name || seatName(seat)}`);
}

async function hostUpdatePacingFromGame() {
  const room = appState.room;
  if (!room || !(appState.offline || isHost())) return;
  const ms = sanitizePacingMs($("gamePacing")?.value || getPacingMs(room.lobby?.settings));
  const settings = { ...(room.lobby?.settings || defaultSettingsFromUI("offline")), pacingMs: ms };
  await updateRoom({ "lobby/settings": settings, "meta/updatedAt": Date.now() });
  toast(`遊戲節奏已改為 ${delaySecondsLabel(ms)}`);
}
async function updateRoom(patch, options = {}) {
  if (appState.offline) {
    for (const [path, value] of Object.entries(patch)) setDeep(appState.room, path, value);
    renderAll();
    maybeResolveTrickPause();
    maybeScheduleBot();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "game") && patch.game) {
    const fullGame = normalizeGame(structuredCloneCompat(patch.game));
    const rootPatch = {};
    for (const [path, value] of Object.entries(patch)) {
      if (path === "game") continue;
      rootPatch[`${roomPath()}/${path}`] = value;
    }
    rootPatch[`${roomPath()}/game`] = publicGameFromFull(fullGame);
    const privatePayload = privateHandPayloadFromGame(fullGame);
    for (let seat = 0; seat < 4; seat++) rootPatch[`${privateHandsPath()}/${seat}`] = privatePayload[seat];
    try {
      await appState.firebase.update(appState.firebase.ref(appState.firebase.db), rootPatch);
      return;
    } catch (error) {
      const message = (error && (error.message || error.code) ? `${error.code || ""} ${error.message || ""}` : String(error || "")).toLowerCase();
      const canFallback = options.allowLegacyPublicGameFallback !== false && (message.includes("permission") || message.includes("denied") || message.includes("PERMISSION_DENIED".toLowerCase()));
      if (!canFallback) throw error;
      console.warn("secure private-hand write failed; falling back to legacy public game state", error);
      await updateRoomLegacyPublicGame(patch, fullGame, error);
      return;
    }
  }
  await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath()), patch);
}

async function updateRoomLegacyPublicGame(patch, fullGame, originalError) {
  const legacyPatch = {};
  for (const [path, value] of Object.entries(patch)) {
    if (path === "game") continue;
    legacyPatch[path] = value;
  }
  const legacyGame = normalizeGame(structuredCloneCompat(fullGame));
  legacyGame.security = {
    ...(legacyGame.security || {}),
    design: "legacy-public-hands-fallback",
    warning: "Firebase rules did not allow roomPrivateHands writes, so this room started with legacy public hands. Update database.rules.json to restore anti-cheat split hands.",
    originalError: String(originalError?.message || originalError?.code || originalError || "permission denied"),
    build: BUILD,
    at: Date.now()
  };
  legacyPatch.game = legacyGame;
  legacyPatch["meta/securityFallback"] = "legacy-public-hands";
  legacyPatch["meta/securityFallbackAt"] = Date.now();
  legacyPatch["meta/securityFallbackBuild"] = BUILD;
  await appState.firebase.update(appState.firebase.ref(appState.firebase.db, roomPath()), legacyPatch);
  toast("已用相容模式開始；建議同步更新 Firebase rules 以恢復防作弊手牌拆分。", 5200);
}

function setDeep(obj, path, value) {
  const parts = path.split("/");
  let target = obj;
  while (parts.length > 1) {
    const p = parts.shift();
    if (!target[p] || typeof target[p] !== "object") target[p] = {};
    target = target[p];
  }
  target[parts[0]] = value;
}


async function startSeatSimulatorGame() {
  savePlayerName();
  const settings = defaultSettingsFromUI("offline");
  appState.offline = true;
  appState.connected = false;
  appState.spectator = false;
  appState.testMode = true;
  appState.testViewSeat = 2;
  localStorage.setItem(STORAGE.testViewSeat, "2");
  appState.roomCode = "TEST4";
  appState.uid = appState.localUid;
  const now = Date.now();
  appState.room = {
    meta: { code: "TEST4", hostUid: appState.uid, arbiterUid: appState.uid, status: "lobby", createdAt: now, updatedAt: now, schemaVersion: ROOM_SCHEMA_VERSION, appBuild: BUILD, testSeatSimulation: true },
    lobby: {
      dealer: 2,
      boardNo: 1,
      settings: { ...settings, allowBotFill: false },
      lockedSeats: {},
      seats: {
        0: makeSeat(0, appState.uid, "測試北家", "human", appState.clientId),
        1: makeSeat(1, appState.uid, "測試東家", "human", appState.clientId),
        2: makeSeat(2, appState.uid, $("playerName").value || "測試南家", "human", appState.clientId),
        3: makeSeat(3, appState.uid, "測試西家", "human", appState.clientId)
      }
    },
    actions: null,
    actionAudit: null,
    match: defaultMatchState(settings),
    game: null
  };
  await hostStartGame();
  toast("已啟動四座位視角模擬：可用牌局中的測試視角按鈕切換 N/E/S/W");
}

async function runFirebaseDeploymentCheck() {
  const el = $("deploymentCheckStatus");
  if (el) el.innerHTML = "正在檢查 Firebase 部署…";
  if (!appState.connected && !(await connectFirebase())) {
    if (el) el.textContent = "Firebase 尚未連線，且連線失敗。";
    return;
  }
  const code = `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`.replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const now = Date.now();
  const checks = [];
  const note = (name, ok, detail) => checks.push({ name, ok, detail });
  try {
    const tempRoom = {
      meta: { code, hostUid: appState.uid, arbiterUid: appState.uid, status: "lobby", createdAt: now, updatedAt: now, expiresAt: now + 300000, schemaVersion: ROOM_SCHEMA_VERSION, appBuild: BUILD, diagnostic: true },
      lobby: { dealer: 2, boardNo: 1, settings: defaultSettingsFromUI("lobby"), lockedSeats: {}, seats: { 2: makeSeat(2, appState.uid, "部署檢查", "human") } },
      game: null,
      actions: null,
      actionAudit: null,
      match: null
    };
    await appState.firebase.set(appState.firebase.ref(appState.firebase.db, roomPath(code)), tempRoom);
    note("建立臨時房間", true, `rooms/${code}`);
    await appState.firebase.set(appState.firebase.ref(appState.firebase.db, `${privateHandsPath(code)}/2`), { current: [], initial: [] });
    const ownSnap = await appState.firebase.get(appState.firebase.ref(appState.firebase.db, `${privateHandsPath(code)}/2`));
    note("私人手牌路徑可寫可讀", ownSnap.exists(), "房主 / 仲裁者可寫入私人手牌，座位本人可讀。若一般玩家讀不到，請檢查 rules。 ");
    try {
      await appState.firebase.push(appState.firebase.ref(appState.firebase.db, actionsPath(code)), { type: "call", seat: 2, actorSeat: 2, uid: appState.uid, clientActionId: `diag-${now}`, createdAt: Date.now(), call: { type: "pass" } });
      note("action queue 可提交", true, "座位本人可提交自己的 action。 ");
    } catch (error) {
      note("action queue 可提交", false, error.message || String(error));
    }
    note("非本人 / 觀戰權限", true, "瀏覽器無法偽裝第二個 auth.uid；請用第二台裝置驗證觀戰者不能讀 roomPrivateHands。 ");
  } catch (error) {
    note("Firebase 檢查流程", false, error.message || String(error));
  } finally {
    try { await appState.firebase.remove(appState.firebase.ref(appState.firebase.db, roomPath(code))); } catch (_) {}
    try { await appState.firebase.remove(appState.firebase.ref(appState.firebase.db, privateHandsPath(code))); } catch (_) {}
  }
  const okCount = checks.filter((c) => c.ok).length;
  const html = `<b>Firebase 部署檢查：${okCount}/${checks.length} 通過</b><ul>${checks.map((c) => `<li class="${c.ok ? "ok" : "danger"}"><span>${escapeHtml(c.name)}</span><b>${c.ok ? "通過" : "失敗"}</b><em>${escapeHtml(c.detail || "")}</em></li>`).join("")}</ul>`;
  if (el) el.innerHTML = html;
  toast(`Firebase 部署檢查完成：${okCount}/${checks.length}`);
}

function startOfflineGame() {
  savePlayerName();
  const settings = defaultSettingsFromUI("offline");
  appState.offline = true;
  appState.spectator = false;
  appState.testMode = false;
  appState.testViewSeat = null;
  localStorage.removeItem(STORAGE.testViewSeat);
  appState.connected = false;
  appState.roomCode = "OFFLINE";
  appState.uid = appState.localUid;
  appState.room = {
    meta: { code: "OFFLINE", hostUid: appState.uid, arbiterUid: appState.uid, status: "lobby", createdAt: Date.now(), updatedAt: Date.now(), schemaVersion: ROOM_SCHEMA_VERSION, appBuild: BUILD },
    lobby: {
      dealer: 2,
      boardNo: 1,
      settings,
      seats: {
        0: makeSeat(0, "bot-north", "北方電腦", "bot"),
        1: makeSeat(1, "bot-east", "東方電腦", "bot"),
        2: makeSeat(2, appState.uid, $("playerName").value, "human"),
        3: makeSeat(3, "bot-west", "西方電腦", "bot")
      }
    },
    actions: null,
    actionAudit: null,
    match: defaultMatchState(settings),
    game: null
  };
  hostStartGame();
}

async function hostAddBot() {
  if (!isHost()) return toast("只有房主可以補電腦");
  if (appState.room?.lobby?.settings?.allowBotFill === false) return toast("目前房間已關閉 AI 補位");
  const empty = firstEmptySeat(appState.room);
  if (empty == null) return toast("座位已滿");
  await updateRoom({ [`lobby/seats/${empty}`]: makeSeat(empty, `bot-${empty}-${Date.now()}`, `${SEATS[empty].name}方電腦`, "bot"), "meta/updatedAt": Date.now() });
}
async function hostRemoveBot() {
  if (!isHost()) return toast("只有房主可以移除電腦");
  const seats = appState.room?.lobby?.seats || {};
  const botSeat = [3, 1, 0, 2].find((s) => seats[s]?.type === "bot");
  if (botSeat == null) return toast("沒有電腦可移除");
  await updateRoom({ [`lobby/seats/${botSeat}`]: null, "meta/updatedAt": Date.now() });
}
async function hostTakeOverOfflinePlayers() {
  if (!isHost()) return;
  const room = appState.room;
  const patch = { "meta/updatedAt": Date.now() };
  let count = 0;
  for (let seat = 0; seat < 4; seat++) {
    const player = room.lobby.seats[seat];
    if (player?.type === "human" && player.uid !== appState.uid && isPlayerOffline(player)) {
      patch[`lobby/seats/${seat}`] = makeSeat(seat, `bot-takeover-${seat}-${Date.now()}`, `${SEATS[seat].name}方代打`, "bot");
      count++;
    }
  }
  if (!count) return toast("沒有離線真人座位可接管");
  await updateRoom(patch);
  toast(`已接管 ${count} 個座位`);
}

async function hostTakeOverCurrentOfflinePlayer() {
  if (!isHost()) return toast("只有房主可以接管");
  const room = appState.room;
  const game = room?.game;
  if (!game || room?.meta?.status !== "game") return toast("目前沒有進行中的牌局");
  const info = currentWaitInfo(game, room);
  const seat = info.controllerSeat;
  const player = room?.lobby?.seats?.[seat];
  if (!info.canTakeOver || seat == null || !player) return toast("目前輪到的座位不是離線真人");
  await updateRoom({
    [`lobby/seats/${seat}`]: makeSeat(seat, `bot-current-${seat}-${Date.now()}`, `${SEATS[seat].name}方代打`, "bot"),
    "meta/updatedAt": Date.now()
  });
  toast(`已讓電腦接管 ${seatName(seat)}`);
}

async function hostForceContinueGame() {
  if (!(appState.offline || isHost())) return toast("只有房主可以處理等待");
  const room = appState.room;
  const game = currentGame();
  if (!room || !game || room.meta?.status !== "game") return toast("目前沒有進行中的牌局");
  const current = structuredCloneCompat(game);
  if (current.phase === "trickPause" && current.pendingTrick) {
    if (!finishPendingTrick(current, true)) return toast("目前無法收牌");
    await updateRoom({ game: current, "meta/status": "game", "meta/updatedAt": Date.now() });
    toast("已立即收牌並繼續");
    return;
  }
  if (["auction", "openingLead", "play"].includes(current.phase)) {
    const controller = controllingSeatForCurrentAction(current);
    const player = room.lobby?.seats?.[controller];
    if (player?.type === "bot") {
      const action = chooseBotAction(current, controller, room.lobby);
      if (!action) return toast("AI 暫時沒有可執行動作");
      appendAiThought(current, controller, action, room.lobby);
      const result = applyAction(current, { ...action, uid: player.uid, actorSeat: controller, createdAt: Date.now() }, room.lobby);
      if (!result.ok) return toast(result.message || "AI 動作失敗");
      await updateRoom({ game: current, "meta/status": "game", "meta/updatedAt": Date.now() });
      toast("已立即執行 AI 動作");
      return;
    }
  }
  maybeResolveTrickPause();
  maybeScheduleBot();
  toast("目前沒有可強制處理的 AI 或清桌等待");
}


async function writeUndoSnapshot(fullGame, action) {
  if (appState.offline) { appState.undoSnapshot = { game: fullGame, action, at: Date.now() }; return; }
  if (!isHost() || !appState.firebase || !appState.roomCode || !fullGame) return;
  const payload = { publicGame: publicGameFromFull(fullGame), privateHands: privateHandPayloadFromGame(fullGame), action: sanitizeActionForAudit(action), at: Date.now(), build: BUILD };
  try { await appState.firebase.set(appState.firebase.ref(appState.firebase.db, roomUndoPath()), payload); }
  catch (error) { console.warn("write undo snapshot failed", error); }
}
async function hostUndoLastAction() {
  if (!(appState.offline || isHost())) return toast("只有房主可以撤銷");
  let snapshot = appState.undoSnapshot;
  if (!appState.offline) {
    const snap = await appState.firebase.get(appState.firebase.ref(appState.firebase.db, roomUndoPath()));
    const value = snap.val();
    if (value?.publicGame) snapshot = { game: hydrateGameForViewer(value.publicGame, appState.room), privateHands: value.privateHands, at: value.at, action: value.action };
    if (value?.privateHands) {
      const map = normalizePrivateHandMap(value.privateHands);
      snapshot.game.hands = [0,1,2,3].map((seat) => listFromFirebase(map[seat]?.current || []));
      snapshot.game.initialHands = [0,1,2,3].map((seat) => listFromFirebase(map[seat]?.initial || []));
    }
  }
  if (!snapshot?.game) return toast("沒有可撤銷的上一動作");
  const game = normalizeGame(structuredCloneCompat(snapshot.game));
  game.log.push(`房主撤銷上一動作，回到 ${new Date(snapshot.at || Date.now()).toLocaleTimeString()} 的狀態。`);
  await updateRoom({ game, actions: null, "meta/updatedAt": Date.now() });
  toast("已撤銷上一動作");
}
function resetGameToStart(game) {
  const base = structuredCloneCompat(game);
  normalizeGame(base);
  const hands = [0,1,2,3].map((seat) => sortHand(originalHand(base, seat).map((card) => ({...card}))));
  return {
    ...base,
    id: `${base.id || "g"}-redo-${Date.now().toString(36)}`,
    phase: "auction",
    currentPlayer: base.dealer,
    hands,
    initialHands: hands.map((hand) => hand.map((card) => ({...card}))),
    handCounts: [13,13,13,13],
    auction: [],
    contract: null,
    declarer: null,
    dummy: null,
    openingLeader: null,
    dummyVisible: false,
    currentTrick: [],
    pendingTrick: null,
    trickHistory: [],
    tricksWon: { NS: 0, EW: 0 },
    result: null,
    score: structuredCloneCompat(base.matchStartScore || { NS: 0, EW: 0 }),
    log: [`第 ${base.boardNo} 副已由房主重打。本副恢復到發牌後、叫牌前。`],
    updatedAt: Date.now()
  };
}
async function hostUndoWholeTrick() {
  if (!(appState.offline || isHost())) return toast("只有房主可以撤銷");
  const game = currentGame();
  if (!game) return toast("目前沒有牌局");
  const next = structuredCloneCompat(game);
  normalizeGame(next);
  if (next.phase === "scoring" && next.result?.scoreDelta) {
    next.score.NS = Math.max(0, Number(next.score.NS || 0) - Number(next.result.scoreDelta.NS || 0));
    next.score.EW = Math.max(0, Number(next.score.EW || 0) - Number(next.result.scoreDelta.EW || 0));
    next.result = null;
  }
  let plays = [];
  let leadSeat = null;
  let winner = null;
  let team = null;
  if (next.pendingTrick && listFromFirebase(next.pendingTrick.plays).length) {
    plays = listFromFirebase(next.pendingTrick.plays);
    leadSeat = plays[0]?.seat;
    winner = next.pendingTrick.winner;
    team = next.pendingTrick.team;
  } else if (next.trickHistory.length) {
    const last = next.trickHistory.pop();
    plays = listFromFirebase(last.plays);
    leadSeat = plays[0]?.seat;
    winner = last.winner;
    team = last.team;
    if (team && next.tricksWon?.[team] > 0) next.tricksWon[team] -= 1;
  } else if (next.currentTrick.length) {
    plays = listFromFirebase(next.currentTrick);
    leadSeat = plays[0]?.seat;
  }
  if (!plays.length) return toast("沒有可撤銷的墩");
  await writeUndoSnapshot(structuredCloneCompat(game), { type: "undo-whole-trick", uid: appState.uid, actorSeat: findSeatByUid(appState.room, appState.uid, appState.clientId), at: Date.now() });
  for (const play of plays) {
    if (play?.card && Number.isInteger(Number(play.seat))) next.hands[Number(play.seat)].push({ ...play.card });
  }
  for (let seat = 0; seat < 4; seat++) sortHand(next.hands[seat]);
  next.handCounts = [0,1,2,3].map((seat) => next.hands[seat].length);
  next.currentTrick = [];
  next.pendingTrick = null;
  next.currentPlayer = Number(leadSeat ?? next.currentPlayer);
  next.phase = next.contract ? (next.trickHistory.length || next.openingLeader !== next.currentPlayer ? "play" : "openingLead") : "auction";
  if (next.phase === "openingLead") next.dummyVisible = false;
  next.log.push(`房主撤銷整墩，回到 ${seatName(next.currentPlayer)} 出牌前。`);
  next.updatedAt = Date.now();
  await updateRoom({ game: next, actions: null, "meta/updatedAt": Date.now() });
  toast("已撤銷整墩");
}
async function hostUndoToPlayStart() {
  if (!(appState.offline || isHost())) return toast("只有房主可以撤銷");
  const game = currentGame();
  if (!game) return toast("目前沒有牌局");
  const next = structuredCloneCompat(game);
  normalizeGame(next);
  if (!next.contract || next.openingLeader == null) return toast("尚未完成叫牌，不能回到叫牌結束");
  if (!confirm("確定要撤銷到叫牌結束？會清空本副所有已出牌，但保留叫牌與合約。")) return;
  await writeUndoSnapshot(structuredCloneCompat(game), { type: "undo-to-play-start", uid: appState.uid, actorSeat: findSeatByUid(appState.room, appState.uid, appState.clientId), at: Date.now() });
  const hands = [0,1,2,3].map((seat) => sortHand(originalHand(next, seat).map((card) => ({ ...card }))));
  next.hands = hands;
  next.initialHands = hands.map((hand) => hand.map((card) => ({ ...card })));
  next.handCounts = [13,13,13,13];
  next.currentTrick = [];
  next.pendingTrick = null;
  next.trickHistory = [];
  next.tricksWon = { NS: 0, EW: 0 };
  if (next.result?.scoreDelta) {
    next.score.NS = Math.max(0, Number(next.score.NS || 0) - Number(next.result.scoreDelta.NS || 0));
    next.score.EW = Math.max(0, Number(next.score.EW || 0) - Number(next.result.scoreDelta.EW || 0));
  }
  next.result = null;
  next.phase = "openingLead";
  next.currentPlayer = next.openingLeader;
  next.dummyVisible = false;
  next.processedActions = {};
  next.actionSerial = Number(next.actionSerial || 0) + 1;
  next.log.push("房主撤銷到叫牌結束，保留合約並重新從首攻開始。");
  next.updatedAt = Date.now();
  await updateRoom({ game: next, actions: null, "meta/updatedAt": Date.now() });
  toast("已撤銷到叫牌結束");
}
async function hostRedealCurrentBoard() {
  if (!(appState.offline || isHost())) return toast("只有房主可以重打本副");
  const game = currentGame();
  if (!game) return toast("目前沒有牌局");
  if (!confirm("確定要重打本副？目前叫牌與出牌會清空，但保留同一副發牌。")) return;
  await writeUndoSnapshot(structuredCloneCompat(game), { type: "redeal-current-board", actorSeat: findSeatByUid(appState.room, appState.uid), uid: appState.uid, at: Date.now() });
  await updateRoom({ game: resetGameToStart(game), actions: null, "meta/updatedAt": Date.now() });
  toast("已重打本副");
}

async function hostExtendRoom() {
  if (!isHost()) return;
  await updateRoom({ "meta/expiresAt": Date.now() + 24 * 60 * 60 * 1000, "meta/updatedAt": Date.now() });
  toast("已延長 24 小時");
}
async function hostCloseRoom() {
  if (!isHost()) return;
  await updateRoom({ "meta/status": "closed", "meta/updatedAt": Date.now() });
  toast("房間已關閉");
}
function isHost() { return Boolean(appState.room?.meta?.hostUid && appState.room.meta.hostUid === appState.uid); }
function isArbiter() { return Boolean(appState.room?.meta?.arbiterUid && appState.room.meta.arbiterUid === appState.uid); }
function isHostOrArbiter() { return isHost() || isArbiter(); }
function isMySeat(seat) { return findSeatByUid(appState.room, appState.uid) === Number(seat); }

async function hostStartGame() {
  const startBtn = $("btnStartGame");
  const oldLabel = startBtn?.textContent || "開始對戰";
  try {
    if (!appState.room) return toast("尚未建立或加入房間");
    if (!appState.offline && !isHost()) return toast("只有房主可以開始");
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = "開始中…"; }
    const room = structuredCloneCompat(appState.room);
    room.lobby ||= { seats: {}, settings: defaultSettingsFromUI("lobby"), dealer: 2, boardNo: 1 };
    room.lobby.seats ||= {};
    room.lobby.settings ||= defaultSettingsFromUI("lobby");
    const settings = room.lobby?.settings || {};
    const emptySeats = [0, 1, 2, 3].filter((seat) => !room.lobby.seats[seat]);
    if (emptySeats.length && settings.allowBotFill === false) return toast("目前關閉 AI 補位，請等四位玩家就座或重新開啟 AI 補位");
    if (!appState.offline && room.meta?.status === "lobby") {
      const humans = [0, 1, 2, 3].map((seat) => room.lobby.seats[seat]).filter((p) => p?.type === "human");
      const unready = humans.filter((p) => p.ready === false || p.ready == null);
      if (unready.length) toast(`提醒：${unready.length} 位真人尚未按準備，房主仍可開局。`);
    }
    for (let seat = 0; seat < 4; seat++) {
      if (!room.lobby.seats[seat]) room.lobby.seats[seat] = makeSeat(seat, `bot-${seat}-${Date.now()}`, `${SEATS[seat].name}方電腦`, "bot");
      if (room.lobby.seats[seat]?.type === "bot") room.lobby.seats[seat].ready = true;
    }
    room.match = prepareMatchForNextGame(room);
    const game = createNewGame(room);
    const nextDealer = (game.dealer + 1) % 4;
    const patch = {
      "meta/status": "game",
      "meta/updatedAt": Date.now(),
      "lobby/seats": room.lobby.seats,
      "lobby/dealer": nextDealer,
      "lobby/boardNo": game.boardNo + 1,
      match: room.match,
      game,
      actions: null,
      actionAudit: null
    };
    await updateRoom(patch, { allowLegacyPublicGameFallback: true });
    $("resultOverlay")?.classList.add("hidden");
    playSfx("start");
    toast("牌局已開始");
  } catch (error) {
    console.error("hostStartGame failed", error);
    const detail = error?.message || error?.code || String(error || "未知錯誤");
    const notice = $("lobbyNotice");
    if (notice) notice.textContent = `開始對戰失敗：${detail}。若是 permission_denied，請同步更新 Firebase Database Rules，或使用這版的相容模式重試。`;
    toast(`開始對戰失敗：${detail}`, 6500);
  } finally {
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = oldLabel; }
  }
}
function createNewGame(room) {
  const deck = shuffle(makeDeck());
  const hands = [[], [], [], []];
  deck.forEach((card, idx) => hands[idx % 4].push(card));
  hands.forEach(sortHand);
  const boardNo = Number(room.lobby.boardNo || 1);
  const settings = room.lobby.settings || defaultSettingsFromUI("offline");
  const match = room.match || defaultMatchState(settings);
  const vulnerability = resolveVulnerability(settings.vulnerability, boardNo, settings, match);
  const dealer = Number(room.lobby.dealer ?? 2);
  return {
    id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    boardNo,
    mode: settings.mode || "standard",
    vulnerability,
    dealer,
    phase: "auction",
    currentPlayer: dealer,
    hands,
    initialHands: hands.map((hand) => hand.map((card) => ({ ...card }))),
    handCounts: [13, 13, 13, 13],
    security: {
      design: "firebase-split-public-private-hands",
      policy: "public game state is written without hands; current and initial hands are written to roomPrivateHands/{code}/{seat}",
      actionModel: "intent submission with host validation",
      schemaVersion: 2
    },
    auction: [],
    contract: null,
    declarer: null,
    dummy: null,
    openingLeader: null,
    dummyVisible: false,
    currentTrick: [],
    pendingTrick: null,
    trickHistory: [],
    tricksWon: { NS: 0, EW: 0 },
    score: { NS: Number(match.totalScore?.NS || 0), EW: Number(match.totalScore?.EW || 0) },
    matchStartScore: { NS: Number(match.totalScore?.NS || 0), EW: Number(match.totalScore?.EW || 0) },
    matchInfo: { mode: match.mode || settings.scoringMode || "single", setNo: match.setNo || 1, handNo: matchHandNumber(match), boardsPlayed: listFromFirebase(match.boards).length, targetBoards: chicagoBoardCount(match.mode || settings.scoringMode) },
    processedActions: {},
    actionSerial: 0,
    result: null,
    log: [`第 ${boardNo} 副開始。${seatName(dealer)}發牌，身價：${vulnerabilityLabel(vulnerability)}，模式：${modeLabel(settings.mode)}。`],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
function makeDeck() {
  const deck = [];
  for (const suit of ["C", "D", "H", "S"]) {
    for (let order = 0; order < RANKS.length; order++) {
      const rank = RANKS[order];
      deck.push({ id: `${suit}${rank}`, suit, rank, order, label: `${rank}${SUITS[suit].symbol}` });
    }
  }
  return deck;
}
function shuffle(cards) {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sortHand(hand) {
  const suitWeight = { S: 0, H: 1, D: 2, C: 3 };
  hand.sort((a, b) => suitWeight[a.suit] - suitWeight[b.suit] || b.order - a.order);
  return hand;
}
function resolveVulnerability(setting, boardNo, settings = {}, match = null) {
  if (isChicagoMode(settings?.scoringMode || match?.mode)) {
    const chicago = ["none", "ns", "ew", "both"];
    return chicago[(matchHandNumber(match) - 1) % 4] || "none";
  }
  if (setting && setting !== "cycle") return setting;
  const cycle = ["none", "ns", "ew", "both", "ns", "ew", "both", "none", "ew", "both", "none", "ns", "both", "none", "ns", "ew"];
  return cycle[(boardNo - 1) % 16] || "none";
}

async function submitAction(action) {
  const game = currentGame();
  if (!game) return;
  playSfx("click");
  vibrate(10);
  const fullAction = {
    ...action,
    uid: appState.uid,
    actorSeat: findSeatByUid(appState.room, appState.uid, appState.clientId),
    clientId: appState.clientId,
    clientActionId: action.clientActionId || `${appState.clientId || "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now()
  };
  if (appState.offline) {
    const next = structuredCloneCompat(game);
    appState.undoSnapshot = { game: structuredCloneCompat(next), action: fullAction, at: Date.now() };
    const result = applyAction(next, fullAction, appState.room.lobby);
    if (!result.ok) return toast(result.message || "不能這樣操作");
    appState.pendingPlay = null;
    await updateRoom({ game: next, "meta/status": "game", "meta/updatedAt": Date.now() });
    return;
  }
  appState.pendingPlay = null;
  await appState.firebase.push(appState.firebase.ref(appState.firebase.db, actionsPath()), fullAction);
}
function maybeProcessActions() {
  if (appState.offline || !isHostOrArbiter() || appState.processingActions) return;
  const room = appState.room;
  const actionsObj = room?.actions || {};
  const entries = Object.entries(actionsObj).sort((a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0));
  if (!entries.length) return;
  processNextAction(entries[0][0], entries[0][1]);
}
async function processNextAction(actionId, action) {
  appState.processingActions = true;
  try {
    const claimed = await claimActionForProcessing(actionId, action);
    if (!claimed) return;
    action = claimed;
    const next = structuredCloneCompat(currentGame());
    normalizeGame(next);
    const patch = { [`actions/${actionId}`]: null, "meta/updatedAt": Date.now() };
    const fingerprint = actionFingerprint(actionId, action);
    if (next.processedActions?.[fingerprint]) {
      patch[`actionAudit/${actionId}`] = { ok: false, duplicate: true, reason: "重複動作已忽略", action: sanitizeActionForAudit(action), at: Date.now(), processor: appState.uid.slice(0, 12) };
      await updateRoom(patch);
      return;
    }
    const sourceCheck = validateSubmittedAction(appState.room, next, action);
    let result = sourceCheck.ok ? applyAction(next, action, appState.room.lobby) : sourceCheck;
    if (result.ok) {
      await writeUndoSnapshot(structuredCloneCompat(currentGame()), action);
      normalizeGame(next);
      rememberProcessedAction(next, fingerprint, action);
      patch.game = next;
      patch[`actionAudit/${actionId}`] = { ok: true, action: sanitizeActionForAudit(action), at: Date.now(), processor: appState.uid.slice(0, 12), fingerprint };
    } else {
      patch[`actionAudit/${actionId}`] = { ok: false, reason: result.message || "動作未通過驗證", action: sanitizeActionForAudit(action), at: Date.now(), processor: appState.uid.slice(0, 12) };
      toast(`已拒絕不合法動作：${result.message || "驗證失敗"}`);
    }
    await updateRoom(patch);
  } catch (error) {
    console.error(error);
    await updateRoom({ [`actions/${actionId}`]: null, [`actionAudit/${actionId}`]: { ok: false, reason: String(error?.message || error), at: Date.now(), processor: appState.uid?.slice(0, 12) || null }, "meta/updatedAt": Date.now() });
  } finally {
    appState.processingActions = false;
    setTimeout(maybeProcessActions, 50);
  }
}
async function claimActionForProcessing(actionId, fallbackAction) {
  if (appState.offline || !appState.firebase?.runTransaction) return fallbackAction;
  const ref = appState.firebase.ref(appState.firebase.db, `${actionsPath()}/${actionId}`);
  const now = Date.now();
  let claimed = null;
  const result = await appState.firebase.runTransaction(ref, (value) => {
    if (!value) return value;
    if (value.status === "processing" && value.processingBy && value.processingBy !== appState.uid && now - Number(value.processingAt || 0) < 8000) return;
    claimed = { ...value, status: "processing", processingBy: appState.uid, processingAt: now, processorBuild: BUILD };
    return claimed;
  });
  if (!result.committed) return null;
  return claimed || result.snapshot?.val() || null;
}
function actionFingerprint(actionId, action) {
  return String(action?.clientActionId || `${action?.type || "?"}:${action?.actorSeat ?? "?"}:${action?.seat ?? "?"}:${action?.call ? callText(action.call) : action?.cardId || "?"}:${actionId || action?.createdAt || "?"}`).replace(/[.#$\/[\]]/g, "_").slice(0, 160);
}
function rememberProcessedAction(game, fingerprint, action) {
  game.processedActions ||= {};
  game.actionSerial = Number(game.actionSerial || 0) + 1;
  game.processedActions[fingerprint] = { serial: game.actionSerial, at: Date.now(), type: action?.type || "unknown", seat: action?.seat ?? null };
  const entries = Object.entries(game.processedActions).sort((a, b) => Number(a[1]?.serial || 0) - Number(b[1]?.serial || 0));
  while (entries.length > 80) {
    const [oldKey] = entries.shift();
    delete game.processedActions[oldKey];
  }
}
function sanitizeActionForAudit(action) {
  return { type: action?.type, seat: action?.seat, actorSeat: action?.actorSeat, uid: action?.uid ? String(action.uid).slice(0, 12) : null, clientId: action?.clientId ? String(action.clientId).slice(0, 12) : null, clientActionId: action?.clientActionId || null, call: action?.call || null, cardId: action?.cardId || null, createdAt: action?.createdAt || null, status: action?.status || null, processingBy: action?.processingBy ? String(action.processingBy).slice(0, 12) : null };
}
function validateSubmittedAction(room, game, action) {
  const actorSeat = Number(action?.actorSeat);
  const actionSeat = Number(action?.seat);
  const player = room?.lobby?.seats?.[actorSeat];
  if (!Number.isInteger(actorSeat) || actorSeat < 0 || actorSeat > 3) return { ok: false, message: "動作缺少有效座位" };
  if (!player) return { ok: false, message: "座位不存在" };
  if (player.type !== "bot" && player.uid !== action.uid) return { ok: false, message: "動作 UID 與座位不符" };
  if (game.phase === "auction") {
    if (action.type !== "call") return { ok: false, message: "叫牌階段只能叫牌" };
    if (actorSeat !== game.currentPlayer || actionSeat !== game.currentPlayer) return { ok: false, message: "不是你的叫牌回合" };
  }
  if (["openingLead", "play"].includes(game.phase)) {
    if (action.type !== "play") return { ok: false, message: "打牌階段只能出牌" };
    const controller = controllingSeatForCurrentAction(game);
    if (actorSeat !== controller) return { ok: false, message: "不是你控制的出牌回合" };
    if (actionSeat !== game.currentPlayer) return { ok: false, message: "出牌座位與目前輪到者不符" };
  }
  return { ok: true };
}
function applyAction(game, action, lobby) {
  if (!game || game.phase === "scoring") return { ok: false, message: "本副已結束" };
  if (game.phase === "trickPause") return { ok: false, message: "上一墩收牌前請稍候" };
  const settings = lobby?.settings || {};
  if (action.type === "call") return applyCall(game, action, lobby);
  if (action.type === "play") return applyPlay(game, action, settings);
  return { ok: false, message: "未知操作" };
}
function applyCall(game, action) {
  normalizeGame(game);
  const seat = Number(action.seat);
  if (game.phase !== "auction") return { ok: false, message: "現在不是叫牌階段" };
  if (seat !== game.currentPlayer) return { ok: false, message: "還沒輪到你叫牌" };
  const call = normalizeCall(action.call);
  if (!isLegalCall(game, call, seat)) return { ok: false, message: "不合法的叫品" };
  game.auction.push({ ...call, seat, at: Date.now() });
  game.log.push(`${seatName(seat)}：${callText(call)}`);
  const end = auctionEndState(game);
  if (end.ended) {
    if (!end.contract) {
      game.phase = "scoring";
      game.result = { passedOut: true, summary: "四家 Pass，該副牌不打。", scoreDelta: { NS: 0, EW: 0 } };
      game.log.push("四家 Pass，本副牌不打。南北 0，東西 0。");
    } else {
      const contract = end.contract;
      game.contract = contract;
      game.declarer = determineDeclarer(game.auction, contract.seat, contract.suit);
      game.dummy = partnerOf(game.declarer);
      game.openingLeader = nextSeat(game.declarer);
      game.currentPlayer = game.openingLeader;
      game.phase = "openingLead";
      game.log.push(`合約成立：${contractText(contract)}，莊家 ${seatName(game.declarer)}，${game.mode === "standard" ? `夢家 ${seatName(game.dummy)}` : "閉手變體不設夢家明牌"}，${seatName(game.openingLeader)}首攻。`);
    }
  } else {
    game.currentPlayer = nextSeat(seat);
  }
  game.updatedAt = Date.now();
  return { ok: true };
}
function normalizeCall(call) {
  if (!call || typeof call !== "object") return { type: "pass" };
  if (call.type === "bid") return { type: "bid", level: Number(call.level), suit: call.suit };
  if (call.type === "double") return { type: "double" };
  if (call.type === "redouble") return { type: "redouble" };
  return { type: "pass" };
}
function highestBid(auction) {
  const calls = listFromFirebase(auction);
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i]?.type === "bid") return calls[i];
  return null;
}
function currentDoubled(auction) {
  let state = 0;
  for (const call of listFromFirebase(auction)) {
    if (call.type === "bid") state = 0;
    if (call.type === "double") state = 1;
    if (call.type === "redouble") state = 2;
  }
  return state;
}
function isLegalCall(game, call, seat) {
  if (call.type === "pass") return true;
  const high = highestBid(game.auction);
  const doubled = currentDoubled(game.auction);
  if (call.type === "bid") {
    if (!call.level || call.level < 1 || call.level > 7 || !SUIT_ORDER.includes(call.suit)) return false;
    if (!high) return true;
    return bidRank(call) > bidRank(high);
  }
  if (call.type === "double") return Boolean(high && teamOf(high.seat) !== teamOf(seat) && doubled === 0);
  if (call.type === "redouble") return Boolean(high && teamOf(high.seat) === teamOf(seat) && doubled === 1);
  return false;
}
function bidRank(call) { return (Number(call.level) - 1) * 5 + SUITS[call.suit].order; }
function legalCalls(game, seat) {
  if (game) game.auction = listFromFirebase(game.auction);
  const calls = [{ type: "pass" }];
  if (isLegalCall(game, { type: "double" }, seat)) calls.push({ type: "double" });
  if (isLegalCall(game, { type: "redouble" }, seat)) calls.push({ type: "redouble" });
  for (let level = 1; level <= 7; level++) {
    for (const suit of SUIT_ORDER) {
      const bid = { type: "bid", level, suit };
      if (isLegalCall(game, bid, seat)) calls.push(bid);
    }
  }
  return calls;
}
function auctionEndState(game) {
  const auction = listFromFirebase(game.auction);
  game.auction = auction;
  if (auction.length >= 4 && auction.slice(-4).every((c) => c.type === "pass") && !highestBid(auction)) return { ended: true, contract: null };
  const high = highestBid(auction);
  if (!high) return { ended: false };
  const highIndex = auction.lastIndexOf(high);
  if (auction.length - highIndex >= 4 && auction.slice(-3).every((c) => c.type === "pass")) {
    return { ended: true, contract: { level: high.level, suit: high.suit, seat: high.seat, doubled: currentDoubled(auction) } };
  }
  return { ended: false };
}
function determineDeclarer(auction, contractSeat, suit) {
  const side = teamOf(contractSeat);
  const first = listFromFirebase(auction).find((call) => call.type === "bid" && call.suit === suit && teamOf(call.seat) === side);
  return first?.seat ?? contractSeat;
}

function applyPlay(game, action, settings) {
  normalizeGame(game);
  const seat = Number(action.seat);
  if (!["openingLead", "play"].includes(game.phase)) return { ok: false, message: "現在不能出牌" };
  if (seat !== game.currentPlayer) return { ok: false, message: "還沒輪到這一手出牌" };
  const hand = game.hands[seat] || [];
  const idx = hand.findIndex((c) => c.id === action.cardId);
  if (idx < 0) return { ok: false, message: "找不到這張牌" };
  const card = hand[idx];
  if (!isLegalCardPlay(game, seat, card)) return { ok: false, message: "必須跟首引花色" };
  hand.splice(idx, 1);
  game.currentTrick.push({ seat, card });
  game.log.push(`${seatName(seat)} 出 ${card.label}`);
  if (game.phase === "openingLead") {
    game.phase = "play";
    if (game.mode === "standard") {
      game.dummyVisible = true;
      game.log.push(`首攻完成，夢家 ${seatName(game.dummy)} 亮牌。`);
    } else {
      game.log.push("閉手變體：沒有夢家亮牌，四手繼續暗牌自行出牌。");
    }
  }
  if (game.currentTrick.length === 4) {
    const winner = trickWinner(game.currentTrick, game.contract?.suit);
    const team = teamOf(winner);
    const trickNo = game.trickHistory.length + 1;
    game.pendingTrick = {
      no: trickNo,
      plays: game.currentTrick.map((play) => ({ seat: play.seat, card: play.card })),
      winner,
      team,
      clearAt: Date.now() + getTrickClearDelayMs(settings)
    };
    game.currentPlayer = winner;
    game.phase = "trickPause";
    game.log.push(`第 ${trickNo} 墩已完成，${seatName(winner)} 暫時領先。${delaySecondsLabel(getTrickClearDelayMs(settings))}後收牌。`);
  } else {
    game.currentPlayer = nextSeat(seat);
  }
  game.updatedAt = Date.now();
  return { ok: true };
}
function finishPendingTrick(game, force = false) {
  normalizeGame(game);
  const pending = game.pendingTrick;
  if (!pending || game.phase !== "trickPause") return false;
  const now = Date.now();
  if (!force && Number(pending.clearAt || 0) > now) return false;
  const winner = Number(pending.winner);
  const team = pending.team || teamOf(winner);
  const plays = listFromFirebase(pending.plays);
  game.tricksWon[team] = (game.tricksWon[team] || 0) + 1;
  game.trickHistory.push({ no: pending.no || game.trickHistory.length + 1, plays, winner, team });
  game.log.push(`第 ${game.trickHistory.length} 墩由 ${seatName(winner)} 贏得，收牌。`);
  game.currentTrick = [];
  game.pendingTrick = null;
  game.currentPlayer = winner;
  if (game.trickHistory.length >= 13) finishScoring(game);
  else game.phase = "play";
  game.updatedAt = Date.now();
  return true;
}

function isLegalCardPlay(game, seat, card) {
  const trick = game.currentTrick || [];
  if (!trick.length) return true;
  const ledSuit = trick[0].card.suit;
  const hand = game.hands[seat] || [];
  const hasLed = hand.some((c) => c.suit === ledSuit);
  return !hasLed || card.suit === ledSuit;
}
function legalCardsForSeat(game, seat) {
  return (game.hands[seat] || []).filter((card) => isLegalCardPlay(game, seat, card));
}
function currentWinningPlay(plays, trumpSuit) {
  plays = listFromFirebase(plays).filter((play) => play && play.card);
  if (!plays.length) return null;
  const ledSuit = plays[0].card.suit;
  let best = plays[0];
  for (const play of plays.slice(1)) {
    if (beats(play.card, best.card, ledSuit, trumpSuit)) best = play;
  }
  return best;
}
function trickWinner(plays, trumpSuit) {
  return currentWinningPlay(plays, trumpSuit)?.seat;
}
function beats(card, best, ledSuit, trumpSuit) {
  if (trumpSuit && trumpSuit !== "NT") {
    if (card.suit === trumpSuit && best.suit !== trumpSuit) return true;
    if (card.suit !== trumpSuit && best.suit === trumpSuit) return false;
    if (card.suit === trumpSuit && best.suit === trumpSuit) return card.order > best.order;
  }
  if (card.suit === ledSuit && best.suit !== ledSuit) return true;
  if (card.suit !== ledSuit && best.suit === ledSuit) return false;
  if (card.suit === best.suit) return card.order > best.order;
  return false;
}
function finishScoring(game) {
  const result = scoreContract(game);
  game.phase = "scoring";
  game.result = result;
  game.score.NS += result.scoreDelta.NS;
  game.score.EW += result.scoreDelta.EW;
  game.log.push(result.summary);
}
function scoreContract(game) {
  if (!game.contract) return { passedOut: true, scoreDelta: { NS: 0, EW: 0 }, summary: "該副牌不打。" };
  const c = game.contract;
  const declaringTeam = teamOf(game.declarer);
  const defendingTeam = declaringTeam === "NS" ? "EW" : "NS";
  const tricks = game.tricksWon[declaringTeam] || 0;
  const target = 6 + c.level;
  const vul = isVulnerable(game.vulnerability, declaringTeam);
  const made = tricks >= target;
  let points = 0;
  let detail = [];
  if (made) {
    const contractPoints = contractBasePoints(c.level, c.suit) * (c.doubled === 2 ? 4 : c.doubled === 1 ? 2 : 1);
    points += contractPoints;
    detail.push(`合約分 ${contractPoints}`);
    if (c.doubled === 1) { points += 50; detail.push("賭倍獎分 50"); }
    if (c.doubled === 2) { points += 100; detail.push("再賭倍獎分 100"); }
    points += contractPoints >= 100 ? (vul ? 500 : 300) : 50;
    detail.push(contractPoints >= 100 ? `成局獎分 ${vul ? 500 : 300}` : "部分合約獎分 50");
    if (c.level === 6) { points += vul ? 750 : 500; detail.push(`小滿貫獎分 ${vul ? 750 : 500}`); }
    if (c.level === 7) { points += vul ? 1500 : 1000; detail.push(`大滿貫獎分 ${vul ? 1500 : 1000}`); }
    const over = tricks - target;
    if (over > 0) {
      const overPoints = overTrickPoints(over, c.suit, c.doubled, vul);
      points += overPoints;
      detail.push(`超 ${over} 墩 ${overPoints}`);
    }
  } else {
    const down = target - tricks;
    points = underTrickPenalty(down, c.doubled, vul);
    detail.push(`倒 ${down} 墩罰分 ${points}`);
  }
  const scoreDelta = { NS: 0, EW: 0 };
  if (made) scoreDelta[declaringTeam] = points;
  else scoreDelta[defendingTeam] = points;
  const signedForNS = scoreDelta.NS - scoreDelta.EW;
  const signText = signedForNS >= 0 ? `南北 +${signedForNS}` : `東西 +${Math.abs(signedForNS)}`;
  const summary = `${contractText(c, game.declarer)} ${made ? "成約" : "失敗"}，莊家方拿 ${tricks}/${target} 墩。${signText}。${detail.join("，")}。`;
  return { made, target, tricks, declaringTeam, defendingTeam, points, scoreDelta, summary, detail };
}
function contractBasePoints(level, suit) {
  if (suit === "NT") return 40 + (level - 1) * 30;
  return SUITS[suit].score * level;
}
function overTrickPoints(over, suit, doubled, vul) {
  if (doubled === 1) return over * (vul ? 200 : 100);
  if (doubled === 2) return over * (vul ? 400 : 200);
  return over * (suit === "NT" ? 30 : SUITS[suit].score);
}
function underTrickPenalty(down, doubled, vul) {
  if (!doubled) return down * (vul ? 100 : 50);
  let total = 0;
  for (let i = 1; i <= down; i++) {
    if (vul) total += i === 1 ? 200 : 300;
    else total += i === 1 ? 100 : i <= 3 ? 200 : 300;
  }
  return doubled === 2 ? total * 2 : total;
}
function isVulnerable(vul, team) { return vul === "both" || vul?.toUpperCase() === team; }

function maybeResolveTrickPause() {
  clearTimeout(appState.trickPauseTimer);
  appState.trickPauseTimer = null;
  const room = appState.room;
  const game = room?.game;
  if (!game || room?.meta?.status !== "game" || game.phase !== "trickPause" || !game.pendingTrick) return;
  if (!appState.offline && !isHost()) return;
  const delay = Math.max(0, Number(game.pendingTrick.clearAt || Date.now()) - Date.now());
  appState.trickPauseTimer = setTimeout(async () => {
    const latestRoom = appState.room;
    const current = structuredCloneCompat(currentGame());
    if (!latestRoom?.game || !current || current.phase !== "trickPause" || !current.pendingTrick) return;
    if (!finishPendingTrick(current, true)) return;
    await updateRoom({ game: current, "meta/status": "game", "meta/updatedAt": Date.now() });
  }, delay);
}

function maybeScheduleBot() {
  clearTimeout(appState.botTimer);
  appState.botTimer = null;
  const room = appState.room;
  const game = room?.game;
  if (!game || room?.meta?.status !== "game" || game.phase === "scoring" || game.phase === "trickPause") return;
  if (!appState.offline && !isHost()) return;
  const controller = controllingSeatForCurrentAction(game);
  const player = room.lobby.seats[controller];
  if (player?.type !== "bot") return;
  appState.botTimer = setTimeout(async () => {
    const latestRoom = appState.room;
    const current = structuredCloneCompat(currentGame());
    if (!latestRoom?.game || !current || current.phase === "scoring") return;
    const latestController = controllingSeatForCurrentAction(current);
    if (latestController !== controller) return;
    const latestPlayer = latestRoom.lobby?.seats?.[controller];
    if (latestPlayer?.type !== "bot") return;
    const action = chooseBotAction(current, controller, latestRoom.lobby);
    if (!action) return;
    appendAiThought(current, controller, action, latestRoom.lobby);
    applyAction(current, { ...action, uid: latestPlayer.uid, actorSeat: controller, createdAt: Date.now() }, latestRoom.lobby);
    await updateRoom({ game: current, "meta/status": "game", "meta/updatedAt": Date.now() });
  }, getAiActionDelayMs(room.lobby?.settings));
}
function controllingSeatForCurrentAction(game) {
  if (game.phase === "trickPause") return null;
  if (game.phase === "play" && game.mode === "standard" && game.currentPlayer === game.dummy) return game.declarer;
  return game.currentPlayer;
}
function chooseBotAction(game, controller, lobby) {
  if (game.phase === "auction") return { type: "call", seat: game.currentPlayer, call: chooseBotCall(game, game.currentPlayer, lobby) };
  if (["openingLead", "play"].includes(game.phase)) {
    const seat = game.currentPlayer;
    const card = chooseBotCard(game, seat, lobby);
    if (card) return { type: "play", seat, cardId: card.id };
  }
  return null;
}

function appendAiThought(game, controller, action, lobby) {
  const settings = lobby?.settings || {};
  if (!settings.showAiThoughts) return;
  normalizeGame(game);
  const seat = Number(action.seat ?? controller);
  const hand = game.hands?.[seat] || [];
  const hcp = handHcp(hand);
  const shape = shapeText(hand);
  let line = `AI 思路｜${seatName(seat)}：牌力 ${hcp} HCP，牌型 ${shape}。`;
  if (action.type === "call") {
    const decision = naturalCallDecision(structuredCloneCompat(game), seat, lobby);
    line += ` 選擇 ${callText(action.call)}。理由：${decision.reason || "依簡易自然制評估。"}`;
  } else if (action.type === "play") {
    const card = hand.find((c) => c.id === action.cardId);
    const legal = legalCardsForSeat(game, seat);
    const led = game.currentTrick?.[0]?.card?.suit;
    const ledText = led ? `首引 ${SUITS[led].symbol}${SUITS[led].name}` : "本墩首攻";
    line += ` ${ledText}，合法牌 ${legal.length} 張，選擇 ${card ? card.label : action.cardId}。`;
  }
  game.log.push(line);
}
function chooseBotCall(game, seat, lobby) {
  return naturalCallDecision(game, seat, lobby).call || { type: "pass" };
}

function naturalCallDecision(game, seat, lobby = {}) {
  normalizeGame(game);
  const legal = legalCalls(game, seat);
  const hand = game.hands?.[seat] || [];
  const hcp = handHcp(hand);
  const shape = suitLengths(hand);
  const auction = listFromFirebase(game.auction || []);
  const high = highestBid(auction);
  const doubledState = currentDoubled(auction);
  const difficulty = Number(lobby?.settings?.difficulty || 12);
  const bid = (level, suit) => legal.find((c) => c.type === "bid" && c.level === level && c.suit === suit);
  const legalDouble = () => legal.find((c) => c.type === "double");
  const legalRedouble = () => legal.find((c) => c.type === "redouble");
  const pass = (reason) => ({ call: { type: "pass" }, reason });
  const choose = (call, reason) => ({ call: call || { type: "pass" }, reason });
  const longestSuit = preferredOpeningSuit(hand);
  const majors = ["S", "H"].filter((suit) => shape[suit] >= 5).sort((a, b) => shape[b] - shape[a] || suitHcp(hand, b) - suitHcp(hand, a));
  const sixSuit = ["S", "H", "D", "C"].find((suit) => shape[suit] >= 6);
  const team = teamOf(seat);
  const lastMine = [...auction].reverse().find((c) => c.seat === seat);
  const alreadyDoubled = auction.some((c) => c.seat === seat && c.type === "double");

  if (!high) {
    if (hcp >= 22 && bid(2, "C")) return choose(bid(2, "C"), `強牌 ${hcp} HCP，使用強 2♣ 開叫。`);
    if (isBalanced(hand) && hcp >= 20 && hcp <= 21 && bid(2, "NT")) return choose(bid(2, "NT"), `均型 ${hcp} HCP，符合 20–21 點 2NT 開叫。`);
    if (isBalanced(hand) && hcp >= 15 && hcp <= 17 && bid(1, "NT")) return choose(bid(1, "NT"), `均型 ${hcp} HCP，符合 15–17 點 1NT 開叫。`);
    if (hcp >= 12 || (hcp >= 11 && (shape["S"] >= 5 || shape["H"] >= 5 || shape[longestSuit] >= 6))) {
      const suit = majors[0] || longestSuit;
      return choose(bid(1, suit), `${hcp} HCP，牌型 ${shapeText(hand)}；自然制開叫以一階長門為主，避免無根據跳叫。`);
    }
    if (difficulty >= 10 && sixSuit && shape[sixSuit] >= 6 && hcp >= 6 && hcp <= 10 && bid(2, sixSuit)) {
      return choose(bid(2, sixSuit), `${hcp} HCP、${SUITS[sixSuit].symbol} 六張以上，採弱二開叫。`);
    }
    const sevenSuit = ["S", "H", "D", "C"].find((suit) => shape[suit] >= 7);
    if (difficulty >= 12 && sevenSuit && hcp >= 5 && hcp <= 10 && bid(3, sevenSuit)) {
      return choose(bid(3, sevenSuit), `${hcp} HCP、${SUITS[sevenSuit].symbol} 七張長門，三階阻擊。`);
    }
    return pass(`${hcp} HCP 未達一般開叫牌力，Pass。`);
  }

  const highLevel = Number(high.level || 0);
  const highSuit = high.suit;
  const partnerHigh = teamOf(high.seat) === team;
  const selfHigh = high.seat === seat;

  // 防止 AI 在自己已經是最高叫品時，因對手 Double 而無限把自己的合約抬高。
  if (selfHigh) {
    if (doubledState === 1 && legalRedouble() && hcp >= 15 && strongTrumpHolding(hand, highSuit)) {
      return choose(legalRedouble(), `自己方合約被 Double；${hcp} HCP 且 ${SUITS[highSuit]?.symbol || ""} 控制佳，選擇 Redouble。`);
    }
    return pass(`目前最高叫品已是自己叫的 ${callText(high)}；不自動加叫自己的合約，避免把合約抬太高。`);
  }

  if (partnerHigh) {
    const underPressure = doubledState === 1;
    if (highSuit !== "NT") {
      const support = shape[highSuit] || 0;
      const isMajor = highSuit === "S" || highSuit === "H";
      const supportFit = support >= (isMajor ? 3 : 4);
      if (underPressure && legalRedouble() && hcp >= 10 && hcp <= 15 && highLevel <= 2) {
        return choose(legalRedouble(), `同伴合約被 Double；你有 ${hcp} HCP，先 Redouble 表示有牌力，不盲目跳高。`);
      }
      if (supportFit) {
        const gameLevel = isMajor ? 4 : 5;
        if (!underPressure && hcp >= 13 && highLevel <= 2 && bid(gameLevel, highSuit)) {
          return choose(bid(gameLevel, highSuit), `${hcp} HCP 且有 ${support} 張支持，未受干擾時可直接叫成局。`);
        }
        if (!underPressure && hcp >= 10 && highLevel <= 2 && bid(Math.min(gameLevel - 1, highLevel + 2), highSuit)) {
          return choose(bid(Math.min(gameLevel - 1, highLevel + 2), highSuit), `${hcp} HCP 且有 ${support} 張支持，作邀請性加叫。`);
        }
        if (hcp >= 6 && highLevel <= 2 && bid(highLevel + 1, highSuit)) {
          return choose(bid(highLevel + 1, highSuit), `${hcp} HCP 且有 ${support} 張支持，只做一階簡單加叫。`);
        }
        if (hcp >= 15 && highLevel === 3 && bid(gameLevel, highSuit)) {
          return choose(bid(gameLevel, highSuit), `${hcp} HCP、支持充足，三階以上只在明顯強牌時加到成局。`);
        }
      }
      const newSuit = responseSuit(hand, highSuit);
      const responseLevel = newSuit ? cheapestLevelForSuitOver(high, newSuit) : 8;
      if (!underPressure && hcp >= 10 && newSuit && responseLevel <= 2 && bid(responseLevel, newSuit)) {
        return choose(bid(responseLevel, newSuit), `${hcp} HCP，先叫自己的可叫長門 ${SUITS[newSuit].symbol}。`);
      }
      if (!underPressure && isBalanced(hand) && hcp >= 12 && highLevel <= 2 && bid(3, "NT")) return choose(bid(3, "NT"), `${hcp} HCP 均型，考慮 3NT 成局。`);
      if (!underPressure && isBalanced(hand) && hcp >= 8 && highLevel <= 1 && bid(2, "NT")) return choose(bid(2, "NT"), `${hcp} HCP 均型，2NT 邀請。`);
    } else {
      if (hcp >= 10 && highLevel <= 2 && bid(3, "NT")) return choose(bid(3, "NT"), `同伴已叫 NT，你有 ${hcp} HCP，叫 3NT。`);
      if (hcp >= 8 && highLevel === 1 && bid(2, "NT")) return choose(bid(2, "NT"), `同伴 NT 後你有 ${hcp} HCP，2NT 邀請。`);
      const major = majors[0];
      if (major && hcp >= 8 && highLevel === 1 && bid(2, major)) return choose(bid(2, major), `同伴 NT 後有五張高花 ${SUITS[major].symbol}，尋找高花合約。`);
    }
    return pass(`${hcp} HCP；同伴已掌握合約，現在不再無謂加高。`);
  }

  // 對手最高叫品：競叫要保守，Double 必須像樣，且避免同一 AI 反覆 Double。
  const overcallSuit = preferredOvercallSuit(hand, highSuit);
  if (overcallSuit && hcp >= 10) {
    const level = cheapestLevelForSuitOver(high, overcallSuit);
    const longEnough = shape[overcallSuit] >= (level >= 3 ? 6 : 5);
    if (longEnough && level <= 2 && bid(level, overcallSuit)) {
      return choose(bid(level, overcallSuit), `${hcp} HCP 且 ${SUITS[overcallSuit].symbol} 長門，二階以下安全競叫。`);
    }
    if (longEnough && level === 3 && hcp >= 12 && suitQuality(hand, overcallSuit) >= 2 && bid(level, overcallSuit)) {
      return choose(bid(level, overcallSuit), `${hcp} HCP、${SUITS[overcallSuit].symbol} 六張且牌質足夠，三階競叫。`);
    }
  }
  if (isBalanced(hand) && hcp >= 15 && hcp <= 18 && highLevel === 1 && bid(1, "NT")) return choose(bid(1, "NT"), `${hcp} HCP 均型，在一階競叫 1NT。`);
  if (!alreadyDoubled && canMakeTakeoutDouble(hand, highSuit, hcp, highLevel) && legalDouble()) {
    return choose(legalDouble(), `${hcp} HCP，對手低階叫 ${SUITS[highSuit]?.symbol || "NT"}；短門且其他花色有支持，作 Takeout Double。`);
  }
  if (!alreadyDoubled && highLevel >= 4 && hcp >= 19 && legalDouble()) {
    return choose(legalDouble(), `${hcp} HCP，對手高階合約，防守牌力很強才選擇懲罰性 Double。`);
  }
  if (alreadyDoubled || lastMine?.type === "double") return pass(`已經 Double 過，本輪避免反覆 Double，Pass。`);
  return pass(`${hcp} HCP，對手已有 ${callText(high)}；沒有安全競叫或合格 Double，Pass。`);
}

function preferredOpeningSuit(hand) {
  const shape = suitLengths(hand);
  const major = ["S", "H"].filter((s) => shape[s] >= 5).sort((a, b) => shape[b] - shape[a] || suitHcp(hand, b) - suitHcp(hand, a))[0];
  if (major) return major;
  return ["S", "H", "D", "C"].sort((a, b) => shape[b] - shape[a] || suitHcp(hand, b) - suitHcp(hand, a) || SUITS[b].order - SUITS[a].order)[0] || "C";
}
function responseSuit(hand, partnerSuit) {
  const shape = suitLengths(hand);
  return ["S", "H", "D", "C"].filter((s) => s !== partnerSuit && shape[s] >= 4).sort((a, b) => shape[b] - shape[a] || suitHcp(hand, b) - suitHcp(hand, a))[0] || null;
}
function preferredOvercallSuit(hand, opponentSuit) {
  const shape = suitLengths(hand);
  return ["S", "H", "D", "C"].filter((s) => s !== opponentSuit && shape[s] >= 5).sort((a, b) => shape[b] - shape[a] || suitHcp(hand, b) - suitHcp(hand, a))[0] || null;
}
function suitQuality(hand, suit) {
  const ranks = new Set((hand || []).filter((c) => c.suit === suit).map((c) => c.rank));
  return ["A", "K", "Q", "J", "10"].reduce((sum, rank) => sum + (ranks.has(rank) ? 1 : 0), 0);
}
function strongTrumpHolding(hand, suit) {
  if (!suit || suit === "NT") return isBalanced(hand) && handHcp(hand) >= 16;
  const shape = suitLengths(hand);
  return (shape[suit] || 0) >= 5 && suitQuality(hand, suit) >= 2;
}
function canMakeTakeoutDouble(hand, opponentSuit, hcp, level) {
  if (!opponentSuit || opponentSuit === "NT" || level > 2 || hcp < 12) return false;
  const shape = suitLengths(hand);
  const shortOpponent = (shape[opponentSuit] || 0) <= 2;
  const unbid = ["S", "H", "D", "C"].filter((s) => s !== opponentSuit);
  const supportCount = unbid.filter((s) => shape[s] >= 3).length;
  const majorSupport = ["S", "H"].filter((s) => s !== opponentSuit).some((s) => shape[s] >= 4);
  return shortOpponent && supportCount >= 2 && (hcp >= 14 || majorSupport);
}
function cheapestLevelForSuitOver(high, suit) {
  for (let level = 1; level <= 7; level++) if (bidRank({ type: "bid", level, suit }) > bidRank(high)) return level;
  return 8;
}
function handHcp(hand) { return hand.reduce((sum, c) => sum + (HCP[c.rank] || 0), 0); }
function suitHcp(hand, suit) { return hand.filter((c) => c.suit === suit).reduce((sum, c) => sum + (HCP[c.rank] || 0), 0); }
function suitLengths(hand) { return { C: hand.filter((c) => c.suit === "C").length, D: hand.filter((c) => c.suit === "D").length, H: hand.filter((c) => c.suit === "H").length, S: hand.filter((c) => c.suit === "S").length }; }
function shapeText(hand) { const s = suitLengths(hand || []); return `♠${s.S}-♥${s.H}-♦${s.D}-♣${s.C}`; }
function isBalanced(hand) { const lens = Object.values(suitLengths(hand)).sort((a, b) => b - a); return lens[0] <= 5 && lens[2] >= 2; }
function chooseBotCard(game, seat, lobby) {
  const legal = legalCardsForSeat(game, seat);
  if (!legal.length) return null;
  const difficulty = Number(lobby?.settings?.difficulty || 10);
  const trump = game.contract?.suit || "NT";
  const isDeclarerSide = game.contract && teamOf(seat) === teamOf(game.declarer);
  const isDeclarerController = game.mode === "standard" ? (seat === game.declarer || seat === game.dummy) : isDeclarerSide;
  const plan = buildAiPlayPlan(game, seat, legal, lobby);

  if (!game.currentTrick.length) {
    if (difficulty >= 12 && isDeclarerController) {
      const declarerLead = chooseDeclarerLeadV3(game, seat, legal, plan);
      if (declarerLead) return declarerLead;
    }
    if (difficulty >= 10 && !isDeclarerSide) {
      const defenseLead = chooseDefensiveLeadV3(game, seat, legal, plan);
      if (defenseLead) return defenseLead;
    }
    const nonTrump = legal.filter((c) => trump === "NT" || c.suit !== trump);
    const pool = nonTrump.length ? nonTrump : legal;
    return difficulty >= 14 ? leadFromSuit(pool.filter((c) => c.suit === bestLeadSuit(pool, trump)), difficulty) : lowestCard(pool);
  }

  const currentWinner = trickWinner(game.currentTrick, trump);
  const partnerWinning = teamOf(currentWinner) === teamOf(seat);
  if (partnerWinning) {
    const unblock = difficulty >= 14 ? unblockHonorIfUseful(game, seat, legal, plan) : null;
    return unblock || safeDiscardCard(legal, trump) || lowestCard(legal);
  }

  const winners = legal.filter((card) => wouldCardWin(game.currentTrick, card, trump));
  if (winners.length) {
    const cashing = difficulty >= 14 ? chooseUrgentWinner(game, seat, winners, plan) : null;
    return cashing || lowestEffectiveWinner(winners, game.currentTrick, trump);
  }
  const ledSuit = game.currentTrick[0]?.card?.suit;
  if (difficulty >= 12 && ledSuit && legal.every((c) => c.suit === ledSuit)) return lowestCard(legal);
  return safeDiscardCard(legal, trump) || lowestCard(legal);
}
function buildAiPlayPlan(game, seat, legal, lobby = {}) {
  const trump = game.contract?.suit || "NT";
  const hand = game.hands?.[seat] || [];
  const visibleWinners = legal.filter((c) => isLikelyTopCard(game, seat, c));
  const shape = suitLengths(hand);
  const longSuit = Object.entries(shape).sort((a,b) => b[1] - a[1] || suitHcp(hand,b[0]) - suitHcp(hand,a[0]))[0]?.[0] || legal[0]?.suit;
  const declarerSide = game.contract && teamOf(seat) === teamOf(game.declarer);
  return { trump, hand, longSuit, visibleWinners, declarerSide, difficulty: Number(lobby?.settings?.difficulty || 10) };
}
function isLikelyTopCard(game, seat, card) {
  const seenOrders = new Set();
  for (const h of game.hands || []) for (const c of h || []) if (c?.suit === card.suit) seenOrders.add(c.order);
  for (const p of game.currentTrick || []) if (p.card?.suit === card.suit) seenOrders.add(p.card.order);
  for (const t of game.trickHistory || []) for (const p of t.plays || []) if (p.card?.suit === card.suit) seenOrders.add(p.card.order);
  for (let order = card.order + 1; order < RANKS.length; order++) if (!seenOrders.has(order)) return false;
  return true;
}
function chooseDeclarerLeadV3(game, seat, legal, plan) {
  const trump = plan.trump;
  if (game.contract && trump !== "NT") {
    const trumpCards = legal.filter((c) => c.suit === trump);
    const opponentsTrumpLikely = unseenSuitCount(game, seat, trump) > 0;
    const topTrump = trumpCards.filter((c) => ["A", "K", "Q"].includes(c.rank)).sort((a,b)=>b.order-a.order)[0];
    if (trumpCards.length >= 2 && opponentsTrumpLikely && topTrump) return topTrump;
    const ruffSetup = chooseShortSuitRuffSetup(game, seat, legal, trump);
    if (ruffSetup) return ruffSetup;
  }
  if (trump === "NT") {
    const longSuit = bestLeadSuitForNoTrump(legal);
    const longCards = legal.filter((c) => c.suit === longSuit);
    const top = longCards.filter((c) => isLikelyTopCard(game, seat, c)).sort((a,b)=>b.order-a.order)[0];
    if (top) return top;
    if (longCards.length >= 4) return lowestCard(longCards);
  }
  const cash = plan.visibleWinners.sort((a,b)=>b.order-a.order)[0];
  return cash || null;
}
function chooseDefensiveLeadV3(game, seat, legal, plan) {
  const trump = plan.trump;
  const seq = honorSequenceLead(legal, trump);
  if (seq) return seq;
  if (trump === "NT") {
    const longSuit = bestLeadSuitForNoTrump(legal);
    const cards = legal.filter((c) => c.suit === longSuit);
    if (cards.length >= 4) return leadFromSuit(cards, plan.difficulty);
  }
  if (game.mode === "standard" && game.dummyVisible && game.dummy != null) {
    const dummy = game.hands?.[game.dummy] || [];
    const dummyLengths = suitLengths(dummy);
    const attackingSuit = ["S","H","D","C"].filter((suit) => trump === "NT" || suit !== trump).sort((a,b) => (dummyLengths[a] || 0) - (dummyLengths[b] || 0) || suitHcp(legal.filter(c=>c.suit===b), b) - suitHcp(legal.filter(c=>c.suit===a), a))[0];
    const pool = legal.filter((c) => c.suit === attackingSuit);
    if (pool.length) return lowestCard(pool);
  }
  const cash = plan.visibleWinners.filter((c) => trump === "NT" || c.suit !== trump).sort((a,b)=>b.order-a.order)[0];
  if (cash) return cash;
  const suit = bestLeadSuit(legal, trump);
  return leadFromSuit(legal.filter((c)=>c.suit === suit), plan.difficulty);
}
function chooseShortSuitRuffSetup(game, seat, legal, trump) {
  const partner = partnerOf(seat);
  const partnerHand = game.hands?.[partner] || [];
  const partnerShape = suitLengths(partnerHand);
  const shortSuit = ["S","H","D","C"].filter((s) => s !== trump && (partnerShape[s] || 0) <= 1).sort((a,b)=>(partnerShape[a]||0)-(partnerShape[b]||0))[0];
  const cards = legal.filter((c) => c.suit === shortSuit);
  return cards.length ? highestCard(cards) : null;
}
function unblockHonorIfUseful(game, seat, legal, plan) {
  const ledSuit = game.currentTrick?.[0]?.card?.suit;
  if (!ledSuit) return null;
  const honors = legal.filter((c) => c.suit === ledSuit && ["K","Q","J","10"].includes(c.rank)).sort((a,b)=>b.order-a.order);
  return honors[0] || null;
}
function chooseUrgentWinner(game, seat, winners, plan) {
  const target = game.contract ? 6 + game.contract.level : 7;
  const declarerTeam = game.declarer != null ? teamOf(game.declarer) : null;
  if (declarerTeam && teamOf(seat) !== declarerTeam) {
    const declarerTricks = game.tricksWon?.[declarerTeam] || 0;
    const remaining = 13 - listFromFirebase(game.trickHistory).length;
    if (declarerTricks + remaining <= target + 1) return highestCard(winners);
  }
  return null;
}
function unseenSuitCount(game, seat, suit) {
  const seen = [];
  for (const h of game.hands || []) for (const c of h || []) if (c?.suit === suit) seen.push(c.id);
  for (const p of game.currentTrick || []) if (p.card?.suit === suit) seen.push(p.card.id);
  for (const t of game.trickHistory || []) for (const p of t.plays || []) if (p.card?.suit === suit) seen.push(p.card.id);
  return Math.max(0, 13 - new Set(seen).size);
}
function hasTopTrumpControl(trumps) { return trumps.some((c) => ["A", "K", "Q"].includes(c.rank)); }
function bestLeadSuit(cards, trump) {
  const groups = groupBySuit(cards.filter((c) => trump === "NT" || c.suit !== trump));
  const entries = Object.entries(groups).filter(([, list]) => list.length);
  if (!entries.length) return cards[0]?.suit;
  return entries.sort((a, b) => b[1].length - a[1].length || suitHcp(b[1], b[0]) - suitHcp(a[1], a[0]) || SUITS[b[0]].order - SUITS[a[0]].order)[0][0];
}
function bestLeadSuitForNoTrump(cards) {
  const groups = groupBySuit(cards);
  const entries = Object.entries(groups).filter(([, list]) => list.length >= 3);
  if (!entries.length) return bestLeadSuit(cards, "NT");
  return entries.sort((a, b) => b[1].length - a[1].length || suitHcp(b[1], b[0]) - suitHcp(a[1], a[0]))[0][0];
}
function groupBySuit(cards) {
  return cards.reduce((acc, c) => { (acc[c.suit] ||= []).push(c); return acc; }, { C: [], D: [], H: [], S: [] });
}
function leadFromSuit(cards, difficulty = 10) {
  const sorted = [...cards].sort((a, b) => b.order - a.order);
  const seq = honorSequenceLead(sorted, "NT");
  if (seq) return seq;
  if (difficulty >= 14 && sorted.length >= 4) return sorted[sorted.length - 2] || lowestCard(sorted);
  return lowestCard(sorted);
}
function honorSequenceLead(cards, trump) {
  const pool = cards.filter((c) => trump === "NT" || c.suit !== trump);
  const groups = groupBySuit(pool);
  for (const list of Object.values(groups)) {
    const ranks = new Set(list.map((c) => c.rank));
    for (const seq of [["A","K","Q"], ["K","Q","J"], ["Q","J","10"], ["J","10","9"]]) {
      if (seq.every((r) => ranks.has(r))) return list.find((c) => c.rank === seq[0]);
    }
  }
  return null;
}
function lowestEffectiveWinner(winners, currentTrick, trump) {
  return [...winners].sort((a, b) => a.order - b.order || SUITS[a.suit].order - SUITS[b.suit].order)[0];
}
function safeDiscardCard(cards, trump) {
  const nonTrump = cards.filter((c) => trump === "NT" || c.suit !== trump);
  const lowNonHonors = nonTrump.filter((c) => !["A", "K", "Q", "J"].includes(c.rank));
  if (lowNonHonors.length) return lowestCard(lowNonHonors);
  if (nonTrump.length) return lowestCard(nonTrump);
  return lowestCard(cards);
}
function wouldCardWin(currentTrick, card, trump) {
  const plays = [...currentTrick, { seat: 99, card }];
  return trickWinner(plays, trump) === 99;
}
function lowestCard(cards) { return [...cards].sort((a, b) => a.order - b.order || SUITS[a.suit].order - SUITS[b.suit].order)[0]; }
function highestCard(cards) { return [...cards].sort((a, b) => b.order - a.order || SUITS[b.suit].order - SUITS[a.suit].order)[0]; }
function lowestFromLongest(cards) {
  const lens = suitLengths(cards);
  const suit = Object.entries(lens).sort((a, b) => b[1] - a[1])[0]?.[0];
  return lowestCard(cards.filter((c) => c.suit === suit));
}

function renderAll() {
  const room = appState.room;
  const status = room?.meta?.status;
  $("connectView").classList.toggle("hidden", Boolean(room) && status !== "closed");
  $("lobbyView").classList.toggle("hidden", !(room && status === "lobby"));
  $("gameView").classList.toggle("hidden", !(room && status === "game"));
  $("btnLeave").classList.toggle("hidden", !room);
  if (!room) return;
  if (status === "lobby") renderLobby(room);
  if (status === "game") renderGame(room);
  document.querySelectorAll(".host-only").forEach((el) => el.classList.toggle("hidden", !isHost()));
}
function renderLobby(room) {
  $("lobbyRoomCode").textContent = room.meta.code;
  const url = buildInviteLink(room.meta.code);
  $("lobbyShare").textContent = `邀請連結：${url}`;
  $("inviteQr").src = buildQrCodeUrl(url);
  $("inviteLinkText").textContent = url;
  $("lobbyRoomStatus").innerHTML = `${escapeHtml(modeLabel(room.lobby.settings.mode))}｜${escapeHtml(vulnerabilitySettingLabel(room.lobby.settings.vulnerability))}｜房主 ${isHost() ? "是你" : "不是你"}${appState.offline ? "" : renderPresenceStatusHtml(room)}`;
  const seats = $("lobbySeats");
  seats.innerHTML = "";
  for (let seat = 0; seat < 4; seat++) {
    const player = room.lobby.seats[seat];
    const item = document.createElement("div");
    item.className = "lobby-seat";
    const state = playerPresenceState(player);
    const mine = player && (player.uid === appState.uid || player.clientId === appState.clientId) ? "・你" : "";
    const locked = Boolean(room.lobby.lockedSeats?.[seat] || room.lobby.lockedSeats?.[String(seat)]);
    const ready = player?.type === "human" ? Boolean(player.ready) : player?.type === "bot";
    item.classList.add(state.className);
    item.classList.toggle("locked", locked);
    item.innerHTML = `
      <div class="seat-badge">${SEATS[seat].key}</div>
      <div class="lobby-seat-main"><b>${seatName(seat)}｜${teamOf(seat)}</b><div class="hint compact">${player ? `${escapeHtml(player.name)}（${player.type === "bot" ? "電腦" : "真人"}${mine}）` : (locked ? "鎖定空位" : "空位")}<br>${state.label}${state.detail ? `｜${state.detail}` : ""}</div>
        <div class="seat-mini-actions">
          ${player?.type === "human" ? `<span class="pill ready-pill ${ready ? "ready" : "not-ready"}">${ready ? "已準備" : "未準備"}</span>` : ""}
          ${locked ? `<span class="pill lock-pill">已鎖座</span>` : ""}
          ${isHost() ? `<button class="ghost tiny" type="button" data-lock-seat="${seat}">${locked ? "解鎖" : "鎖座"}</button>${player && player.uid !== appState.uid ? `<button class="ghost tiny" type="button" data-clear-seat="${seat}">清空</button>` : ""}` : ""}
        </div>
      </div>
      <span class="pill presence-pill ${state.className}">${player ? state.label : (locked ? "鎖定" : "等待")}</span>
    `;
    seats.appendChild(item);
  }
  seats.querySelectorAll("[data-lock-seat]").forEach((btn) => btn.addEventListener("click", () => hostToggleSeatLock(btn.dataset.lockSeat)));
  seats.querySelectorAll("[data-clear-seat]").forEach((btn) => btn.addEventListener("click", () => hostClearSeat(btn.dataset.clearSeat)));
  $("lobbyMode").value = room.lobby.settings.mode || "closed";
  $("lobbyVulnerability").value = room.lobby.settings.vulnerability || "cycle";
  $("difficulty").value = room.lobby.settings.difficulty || 10;
  $("difficultyLabel").textContent = $("difficulty").value;
  if ($("lobbyPacing")) $("lobbyPacing").value = sanitizePacingMs(room.lobby.settings.pacingMs || AI_ACTION_DELAY_MS);
  if ($("lobbyScoringMode")) $("lobbyScoringMode").value = room.lobby.settings.scoringMode || "single";
  $("showAiThoughts").checked = Boolean(room.lobby.settings.showAiThoughts ?? true);
  if ($("allowSpectators")) $("allowSpectators").checked = room.lobby.settings.allowSpectators !== false;
  if ($("allowBotFill")) $("allowBotFill").checked = room.lobby.settings.allowBotFill !== false;
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const myReady = mySeat != null && Boolean(room.lobby.seats?.[mySeat]?.ready);
  if ($("btnToggleReady")) $("btnToggleReady").textContent = myReady ? "取消準備" : "我準備好了";
  const transferSelect = $("transferHostSeat");
  if (transferSelect) {
    transferSelect.innerHTML = [0,1,2,3].map((seat) => { const p = room.lobby.seats?.[seat]; return `<option value="${seat}" ${!p || p.type !== "human" ? "disabled" : ""}>${SEATS[seat].key} ${seatName(seat)}${p ? `｜${escapeHtml(p.name)}` : "｜空位"}</option>`; }).join("");
  }
  const filled = [0, 1, 2, 3].filter((s) => room.lobby.seats[s]).length;
  const humans = [0,1,2,3].map((s) => room.lobby.seats[s]).filter((p) => p?.type === "human");
  const readyCount = humans.filter((p) => p.ready).length;
  $("lobbyNotice").textContent = isHost() ? `目前 ${filled}/4 位；真人準備 ${readyCount}/${humans.length}。${room.lobby.settings.allowBotFill === false ? "AI 補位已關閉。" : "可補電腦後開始。"}` : `等待房主開始。你可以先按準備。真人準備 ${readyCount}/${humans.length}。`;
}
function renderGame(room) {
  const game = normalizeGame(room.game);
  applyGameContextFocus(game);
  renderPhase(game);
  renderContract(game);
  renderScore(game);
  renderTable(room);
  renderHand(room);
  renderActions(room);
  renderRecords(game);
  renderPostHandReview(game, room);
  renderGameRoomStatus(room);
  renderSyncTestPanel(room);
  renderDealProgress(game, room);
  renderTurnWaitCard(room);
  renderTurnAlert(room);
  renderMobileQuickNav(room);
  renderRecordDrawerState();
  renderLog(game);
  updateBrowserTitle(game, room);
  renderTips(game, room);
  maybeShowResult(game);
}
function gameContextClassForPhase(phase) {
  if (phase === "auction") return "context-auction";
  if (["openingLead", "play", "trickPause"].includes(phase)) return "context-play";
  if (phase === "scoring") return "context-scoring";
  return "context-neutral";
}
function defaultRecordTabForPhase(phase) {
  if (phase === "auction") return "auction";
  if (["openingLead", "play", "trickPause"].includes(phase)) return "tricks";
  if (phase === "scoring") return "review";
  return "tools";
}
function applyGameContextFocus(game) {
  const view = $("gameView");
  if (!view) return;
  const contextClass = gameContextClassForPhase(game?.phase);
  view.classList.remove("context-auction", "context-play", "context-scoring", "context-neutral");
  view.classList.add(contextClass);
  view.dataset.phaseContext = contextClass.replace("context-", "");
  const phaseKey = game?.phase || "none";
  if (appState.lastContextPhase !== phaseKey) {
    appState.lastContextPhase = phaseKey;
    appState.mobileRecordTab = defaultRecordTabForPhase(phaseKey);
    appState.recordsDrawerOpen = true;
  }
}

function renderPhase(game) {
  const phaseMap = {
    auction: ["叫牌階段", `${seatName(game.currentPlayer)} 叫牌。`],
    openingLead: ["首攻", `${seatName(game.openingLeader)} 首攻；夢家要等首攻翻開後才亮牌。`],
    play: ["打牌階段", `${seatName(game.currentPlayer)} 出牌。`],
    trickPause: ["本墩完成", `最後一張牌已出，保留桌面 ${pacingLabel(appState.room?.lobby?.settings)} 後由 ${seatName(game.currentPlayer)} 收牌。`],
    scoring: ["本副結束", game.result?.summary || "已結算。"]
  };
  const [title, help] = phaseMap[game.phase] || ["準備中", "等待同步。"];
  $("phaseTitle").textContent = title;
  const wait = currentWaitInfo(game, appState.room);
  const extra = wait?.detail && game.phase !== "scoring" ? `<br><span class="phase-wait-note">${escapeHtml(wait.detail)}</span>` : "";
  $("phaseHelp").innerHTML = colorizeSuitsHtml(help) + extra;
}
function renderContract(game) {
  const phase = game?.phase || "";
  const lines = [];
  if (phase === "auction") {
    lines.push(["模式", modeLabel(game.mode)]);
    lines.push(["牌號 / 身價", `第 ${game.boardNo} 副｜${vulnerabilityLabel(game.vulnerability)}`]);
    const high = highestBid(game.auction || []);
    lines.push(["目前最高叫品", high ? `${callText(high)} by ${SEATS[high.seat]?.key || "?"}` : "尚未叫牌"]);
    lines.push(["輪到", `${seatName(game.currentPlayer)} 叫牌`]);
    lines.push(["提醒", "最後一個叫品後連續三家 Pass，合約才成立"]);
  } else if (["openingLead", "play", "trickPause"].includes(phase)) {
    lines.push(["合約", game.contract ? contractText(game.contract, game.declarer) : "尚未成立"]);
    if (game.contract) {
      lines.push(["王牌 / 無王", game.contract.suit === "NT" ? "NT 無王" : `${SUITS[game.contract.suit]?.symbol || ""}${SUITS[game.contract.suit]?.name || ""}`]);
      lines.push(["莊家", seatName(game.declarer)]);
      lines.push([game.mode === "standard" ? "夢家" : "同伴", game.mode === "standard" ? `${seatName(game.dummy)}${game.dummyVisible ? "（已亮牌）" : "（未亮牌）"}` : `${seatName(game.dummy)}（不亮牌）`]);
      lines.push(["目標", `${6 + game.contract.level} 墩`]);
    }
    lines.push(["目前墩數", `南北 ${game.tricksWon.NS || 0}｜東西 ${game.tricksWon.EW || 0}`]);
    const current = listFromFirebase(game.currentTrick);
    if (current.length) lines.push(["本墩", `${current.length}/4 張｜首引 ${current[0].card.rank}${SUITS[current[0].card.suit]?.symbol || current[0].card.suit}`]);
  } else {
    lines.push(["模式", `${modeLabel(game.mode)}｜${scoreModeLabel(game.matchInfo?.mode || appState.room?.match?.mode || appState.room?.lobby?.settings?.scoringMode)}`]);
    lines.push(["牌號 / 身價", `第 ${game.boardNo} 副｜${vulnerabilityLabel(game.vulnerability)}`]);
    if (game.contract) {
      lines.push(["合約", contractText(game.contract, game.declarer)]);
      lines.push(["莊家", seatName(game.declarer)]);
      lines.push([game.mode === "standard" ? "夢家" : "同伴", game.mode === "standard" ? `${seatName(game.dummy)}${game.dummyVisible ? "（已亮牌）" : "（未亮牌）"}` : `${seatName(game.dummy)}（不亮牌）`]);
      lines.push(["結果", game.result?.summary || "已結算"]);
    } else {
      lines.push(["合約", "尚未成立"]);
    }
    lines.push(["目前墩數", `南北 ${game.tricksWon.NS || 0}｜東西 ${game.tricksWon.EW || 0}`]);
  }
  $("contractInfo").innerHTML = lines.map(([k, v]) => `<div class="contract-row"><span>${escapeHtml(k)}</span><b>${colorizeSuitsHtml(v)}</b></div>`).join("");
  $("tableTrump").classList.toggle("hidden", !game.contract);
  $("tableTrump").innerHTML = game.contract ? colorizeSuitsHtml(contractText(game.contract, game.declarer)) : "";
  $("tableTeamHeads").classList.toggle("hidden", phase === "auction");
  $("tableTeamHeads").textContent = `墩數：南北 ${game.tricksWon.NS || 0}｜東西 ${game.tricksWon.EW || 0}`;
}

function renderScore(game) {
  const match = appState.room?.match || defaultMatchState(appState.room?.lobby?.settings || {});
  let boards = listFromFirebase(match.boards);
  if (game.phase === "scoring" && game.result && !boards.some((b) => b.gameId === game.id)) {
    boards = [...boards, { gameId: game.id, contract: game.contract ? contractText(game.contract, game.declarer) : "Passed out", delta: game.result.scoreDelta || { NS: 0, EW: 0 } }];
  }
  const mode = game.matchInfo?.mode || match.mode;
  const chicago = isChicagoMode(mode);
  const targetBoards = chicagoBoardCount(mode);
  const handNo = game.matchInfo?.handNo || matchHandNumber(match);
  const boardLine = chicago ? `<div class="score-row"><span>Chicago</span><b>第 ${handNo} / ${targetBoards} 副｜第 ${match.setNo || game.matchInfo?.setNo || 1} 輪</b></div>` : `<div class="score-row"><span>計分模式</span><b>${scoreModeLabel(match.mode)}</b></div>`;
  const history = boards.length ? `<div class="match-history">${boards.slice(-targetBoards).map((b, idx) => `<span>${idx + 1}. ${escapeHtml(b.contract)}｜NS +${b.delta?.NS || 0} EW +${b.delta?.EW || 0}</span>`).join("")}</div>` : "";
  const chicagoSummary = chicago ? chicagoSummaryHtml(game, match, boards) : "";
  $("scoreList").innerHTML = `
    <div class="score-row"><span>南北 NS 總分</span><b>${game.score?.NS || 0}</b></div>
    <div class="score-row"><span>東西 EW 總分</span><b>${game.score?.EW || 0}</b></div>
    ${boardLine}
    ${history}
    ${chicagoSummary}
  `;
}
function chicagoSummaryHtml(game, match, boards) {
  const targetBoards = chicagoBoardCount(match?.mode || game?.matchInfo?.mode);
  const currentFourDone = boards.length >= targetBoards && game.phase === "scoring";
  const completed = match?.lastCompletedSet && !boards.length ? match.lastCompletedSet : null;
  const finalScore = currentFourDone ? { NS: Number(game.score?.NS || 0), EW: Number(game.score?.EW || 0) } : completed?.totalScore;
  if (!finalScore) return "";
  const winner = finalScore.NS === finalScore.EW ? "平手" : finalScore.NS > finalScore.EW ? "南北" : "東西";
  const margin = Math.abs(finalScore.NS - finalScore.EW);
  const title = currentFourDone ? `本輪 Chicago ${targetBoards} 副已完成` : `上一輪 Chicago 總結`;
  const rows = (currentFourDone ? boards.slice(-targetBoards) : listFromFirebase(completed?.boards)).map((b, idx) => `<li>第 ${idx + 1} 副：${escapeHtml(b.contract || "-")}｜${escapeHtml(b.result || "")}｜NS +${b.delta?.NS || 0} EW +${b.delta?.EW || 0}｜累計 NS ${b.totalAfter?.NS ?? "?"}：EW ${b.totalAfter?.EW ?? "?"}</li>`).join("");
  return `<div class="chicago-summary"><b>${title}</b><p>${winner}${winner === "平手" ? "" : ` 勝 ${margin} 分`}｜NS ${finalScore.NS}：EW ${finalScore.EW}</p><ol>${rows}</ol><p class="hint compact">賽後報告已保留在 match.lastCompletedSet，可在錯誤快照與牌譜中檢查。</p></div>`;
}
function renderDealProgress(game, room) {
  const el = $("dealProgress");
  if (!el) return;
  const tricksDone = listFromFirebase(game.trickHistory).length;
  const liveCards = listFromFirebase(game.currentTrick).length;
  const progressCards = Math.min(52, tricksDone * 4 + liveCards);
  const progressPct = Math.round((progressCards / 52) * 100);
  const remainingTricks = Math.max(0, 13 - tricksDone - (game.phase === "trickPause" ? 1 : 0));
  const contract = game.contract;
  let goalText = "尚未成立合約，叫牌中。";
  if (contract) {
    const declaringTeam = teamOf(game.declarer);
    const target = 6 + contract.level;
    const current = game.tricksWon?.[declaringTeam] || 0;
    const pendingGain = game.phase === "trickPause" && game.pendingTrick?.team === declaringTeam ? 1 : 0;
    const effective = current + pendingGain;
    const need = Math.max(0, target - effective);
    goalText = `${declaringTeam} 目標 ${target} 墩，目前 ${effective}，還差 ${need}。`;
  }
  const turnText = phaseTurnText(game, room);
  const waitInfo = currentWaitInfo(game, room);
  const waitLine = waitInfo.detail ? `<br>${escapeHtml(waitInfo.detail)}` : "";
  el.innerHTML = `
    <h3>局勢摘要</h3>
    <div class="progress-line"><span>${escapeHtml(turnText)}</span><b>${progressCards}/52</b></div>
    <div class="deal-progress-bar" aria-hidden="true"><i style="width:${progressPct}%"></i></div>
    <p class="hint compact">${escapeHtml(goalText)}剩餘約 ${remainingTricks} 墩。節奏：${pacingLabel(room?.lobby?.settings)}。${waitLine}</p>
  `;
}
function phaseTurnText(game, room) {
  const wait = currentWaitInfo(game, room);
  if (game.phase === "auction") return `輪到 ${seatName(game.currentPlayer)} 叫牌${wait.countdownText ? `｜${wait.countdownText}` : ""}`;
  if (game.phase === "openingLead") return `輪到 ${seatName(game.currentPlayer)} 首攻${wait.countdownText ? `｜${wait.countdownText}` : ""}`;
  if (game.phase === "play") return `輪到 ${seatName(game.currentPlayer)} 出牌${wait.countdownText ? `｜${wait.countdownText}` : ""}`;
  if (game.phase === "trickPause") return `本墩完成，${seatName(game.pendingTrick?.winner ?? game.currentPlayer)} 將收牌${wait.countdownText ? `｜${wait.countdownText}` : ""}`;
  if (game.phase === "scoring") return "本副已結算";
  return room?.meta?.status === "game" ? "牌局進行中" : "等待開始";
}

function secondsLeft(targetAt) {
  const ms = Number(targetAt || 0) - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function currentWaitInfo(game, room = appState.room) {
  const settings = room?.lobby?.settings || {};
  const actionSeat = game?.currentPlayer ?? null;
  const controllerSeat = game ? controllingSeatForCurrentAction(game) : null;
  const player = controllerSeat != null ? room?.lobby?.seats?.[controllerSeat] : null;
  const state = playerPresenceState(player);
  let title = "等待同步";
  let detail = "";
  let countdownText = "";
  let kind = "idle";
  if (!game) return { actionSeat, controllerSeat, player, state, title, detail, countdownText, kind, canTakeOver: false };
  if (game.phase === "trickPause" && game.pendingTrick) {
    const left = secondsLeft(game.pendingTrick.clearAt);
    title = `本墩完成，${seatName(game.pendingTrick.winner)} 贏得本墩`;
    detail = `桌面保留中，約 ${left} 秒後收牌。`;
    countdownText = `${left} 秒後收牌`;
    kind = "pause";
  } else if (["auction", "openingLead", "play"].includes(game.phase)) {
    const actionLabel = game.phase === "auction" ? "叫牌" : game.phase === "openingLead" ? "首攻" : "出牌";
    const controlledText = controllerSeat !== actionSeat ? `由 ${seatName(controllerSeat)} 指揮 ${seatName(actionSeat)} 的夢家牌` : `${seatName(actionSeat)} ${actionLabel}`;
    title = `輪到 ${controlledText}`;
    if (player?.type === "bot") {
      const dueAt = Number(game.updatedAt || Date.now()) + getAiActionDelayMs(settings);
      const left = secondsLeft(dueAt);
      detail = `AI 模擬思考中，約 ${left} 秒後自動${actionLabel}。`;
      countdownText = `AI 約 ${left} 秒`;
      kind = "bot";
    } else if (player?.type === "human" && isPlayerOffline(player)) {
      detail = `${player.name || seatName(controllerSeat)} 目前離線；房主可接管目前輪到的座位，讓電腦代打。`;
      countdownText = "真人離線";
      kind = "offline";
    } else if (player?.type === "human") {
      detail = `等待 ${player.name || seatName(controllerSeat)} 操作。${state.detail ? `最後同步：${state.detail}。` : ""}`;
      countdownText = "等待真人";
      kind = "human";
    } else {
      detail = "等待座位資料同步。";
      countdownText = "等待同步";
      kind = "sync";
    }
  } else if (game.phase === "scoring") {
    title = "本副已結束";
    detail = game.result?.summary || "已結算。";
    kind = "scoring";
  }
  const canTakeOver = Boolean(kind === "offline" && isHost() && player?.type === "human" && player.uid !== appState.uid);
  return { actionSeat, controllerSeat, player, state, title, detail, countdownText, kind, canTakeOver };
}

function renderTurnWaitCard(room) {
  const el = $("turnWaitCard");
  if (!el) return;
  const game = room?.game;
  if (!game || game.phase === "scoring") {
    el.classList.add("hidden");
    el.innerHTML = "";
    updateCurrentTakeoverButton(null);
    return;
  }
  const info = currentWaitInfo(game, room);
  updateCurrentTakeoverButton(info);
  const playerName = info.player?.name || (info.controllerSeat != null ? seatName(info.controllerSeat) : "未知");
  const stateLabel = info.player ? info.state.label : "等待";
  const stateClass = info.state.className || "empty";
  const countdown = info.countdownText ? `<strong class="wait-countdown ${escapeHtml(info.kind)}">${escapeHtml(info.countdownText)}</strong>` : "";
  const takeover = info.canTakeOver ? `<button class="ghost tiny" type="button" data-takeover-current="1">接管此座位</button>` : "";
  el.className = `wait-card ${info.kind}`;
  el.innerHTML = `
    <div class="wait-card-head"><h3>等待狀態</h3>${countdown}</div>
    <p><b>${escapeHtml(info.title)}</b></p>
    <p class="hint compact">${escapeHtml(info.detail || "等待同步。")}</p>
    <div class="wait-meta"><span>${info.controllerSeat != null ? SEATS[info.controllerSeat].key : "?"} ${escapeHtml(playerName)}</span><span class="presence-pill ${stateClass}">${escapeHtml(stateLabel)}</span>${takeover}</div>
  `;
  el.querySelector("[data-takeover-current]")?.addEventListener("click", hostTakeOverCurrentOfflinePlayer);
}

function updateCurrentTakeoverButton(info) {
  const btn = $("btnTakeOverCurrentGame");
  if (!btn) return;
  const currentInfo = info || (appState.room?.game ? currentWaitInfo(appState.room.game, appState.room) : null);
  btn.disabled = !currentInfo?.canTakeOver;
  btn.title = currentInfo?.canTakeOver ? `接管 ${seatName(currentInfo.controllerSeat)}` : "目前輪到的座位不是離線真人";
}
function updateBrowserTitle(game, room) {
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const control = controllableSeatForViewer(game, mySeat);
  let prefix = "合約橋牌";
  if (game.phase === "auction" && game.currentPlayer === mySeat) prefix = "輪到你叫牌";
  else if (["openingLead", "play"].includes(game.phase) && control?.canAct) prefix = "輪到你出牌";
  else if (game.phase === "scoring") prefix = "本局結束";
  else if (["auction", "openingLead", "play"].includes(game.phase)) prefix = `等待 ${SEATS[game.currentPlayer]?.key || "?"}`;
  document.title = `${prefix}｜合約橋牌`;
}

function renderTurnAlert(room) {
  const alert = $("turnAlert");
  if (!alert) return;
  const game = room?.game;
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const control = game ? controllableSeatForViewer(game, mySeat) : { canAct: false };
  const canAct = Boolean(game && control?.canAct && !appState.spectator && ["auction", "openingLead", "play"].includes(game.phase));
  alert.classList.toggle("hidden", !canAct);
  if (!canAct) {
    appState.lastTurnNoticeKey = null;
    return;
  }
  const title = game.phase === "auction" ? "輪到你叫牌" : control.seat === game.dummy ? "輪到你指揮夢家" : "輪到你出牌";
  const text = game.phase === "auction" ? auctionTurnAlertText(game, mySeat) : playTurnAlertText(game, control.seat);
  $("turnAlertTitle").textContent = title;
  $("turnAlertText").innerHTML = colorizeSuitsHtml(text);
  const key = `${game.id}:${game.phase}:${game.currentPlayer}:${control.seat}:${game.auction?.length || 0}:${game.currentTrick?.length || 0}:${game.trickHistory?.length || 0}`;
  if (appState.lastTurnNoticeKey !== key) {
    appState.lastTurnNoticeKey = key;
    playSfx("turn");
    vibrate([18, 30, 18]);
    if (document.visibilityState === "visible") toast(title);
  }
}
function auctionTurnAlertText(game, mySeat) {
  const high = highestBid(game.auction || []);
  const legal = legalCalls(game, mySeat);
  const suggestion = suggestCall(game, mySeat)?.call;
  const base = high ? `目前最高叫品：${callText(high)} by ${SEATS[high.seat].key}` : "目前尚未有人叫牌";
  return `${base}。可選 ${legal.length} 個合法叫品；建議：${suggestion ? callText(suggestion) : "Pass"}。`;
}
function playTurnAlertText(game, seat) {
  const legal = legalCardsForSeat(game, seat);
  const suggestion = suggestPlay(game, seat)?.card;
  if (!game.currentTrick?.length) return `你是本墩首攻，可出 ${legal.length} 張；建議：${suggestion ? suggestion.label : "無"}。`;
  const led = game.currentTrick[0].card.suit;
  const hasLed = (game.hands[seat] || []).some((c) => c.suit === led);
  return `首引花色：${SUITS[led].symbol}${SUITS[led].name}，${hasLed ? "必須跟牌" : "沒有此花色，可墊牌或將吃"}；建議：${suggestion ? suggestion.label : "無"}。`;
}
function scrollToCurrentAction() {
  const room = appState.room;
  const game = room?.game;
  if (!game) return;
  const target = game.phase === "auction" ? ($("handActionPanel") || $("actionPanel")) : ($("hand") || $("actionPanel"));
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}


function renderMobileQuickNav(room) {
  const nav = $("mobileQuickNav");
  if (!nav) return;
  const game = room?.game;
  const active = Boolean(game && room?.meta?.status === "game");
  nav.classList.toggle("hidden", !active);
  if (!active) return;
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const control = controllableSeatForViewer(game, mySeat);
  const status = control?.canAct
    ? (game.phase === "auction" ? "輪到你叫牌" : "輪到你出牌")
    : phaseTurnText(game, room);
  nav.innerHTML = `
    <span class="mobile-quick-status">${colorizeSuitsHtml(status)}</span>
    <button type="button" data-scroll-target="table">牌桌</button>
    <button type="button" data-scroll-target="actionPanel">操作</button>
    <button type="button" data-scroll-target="handPanel">手牌</button>
    <button type="button" data-scroll-target="auctionRecord">紀錄</button>
  `;
  nav.querySelectorAll("[data-scroll-target]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.scrollTarget;
    if (id === "auctionRecord") {
      setRecordTab("auction");
      $("recordsDrawer")?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    const target = id === "handPanel" ? document.querySelector(".hand-panel") : $(id);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
}


function toggleRecordDrawer() {
  appState.recordsDrawerOpen = !appState.recordsDrawerOpen;
  renderRecordDrawerState();
}
function setRecordTab(tab) {
  appState.mobileRecordTab = tab || "tools";
  appState.recordsDrawerOpen = true;
  renderRecordDrawerState();
}
function renderRecordDrawerState() {
  const drawer = $("recordsDrawer");
  if (!drawer) return;
  const tab = appState.mobileRecordTab || "tools";
  drawer.dataset.mobileTab = tab;
  drawer.classList.toggle("drawer-collapsed", !appState.recordsDrawerOpen);
  const toggle = $("btnRecordDrawerToggle");
  if (toggle) toggle.textContent = appState.recordsDrawerOpen ? "收合" : "展開";
  document.querySelectorAll("[data-record-tab-btn]").forEach((btn) => btn.classList.toggle("active", btn.dataset.recordTabBtn === tab));
}

function renderRecords(game) {
  const auctionEl = $("auctionRecord");
  const trickEl = $("trickRecord");
  if (auctionEl) auctionEl.innerHTML = auctionTableHtml(game);
  if (trickEl) trickEl.innerHTML = trickRecordHtml(game);
}

function renderPostHandReview(game, room) {
  const reviewEl = $("postHandReview");
  if (reviewEl) {
    reviewEl.innerHTML = postHandReviewHtml(game, room) + tutorialMissionChapter1Html(game, room) + tutorialMissionChapter2Html(game, room) + tutorialMissionChapter3Html(game, room);
    reviewEl.querySelector("#btnResetTutorialChapter1")?.addEventListener("click", resetTutorialChapter1);
    reviewEl.querySelector("#btnResetTutorialChapter2")?.addEventListener("click", resetTutorialChapter2);
    reviewEl.querySelector("#btnResetTutorialChapter3")?.addEventListener("click", resetTutorialChapter3);
  }
  const healthEl = $("gameHealthPanel");
  if (healthEl) healthEl.innerHTML = gameHealthHtml(game, room);
}
function postHandReviewHtml(game, room) {
  const review = contractReviewSummary(game);
  const badgeClass = review.state === "good" ? "ok" : review.state === "danger" ? "danger" : review.state === "done" ? "ok" : "warn";
  const detail = review.detail.length ? `<ul>${review.detail.map((x) => `<li>${colorizeSuitsHtml(escapeHtml(x))}</li>`).join("")}</ul>` : `<p class="hint compact">目前資料不足，等合約成立或牌局結束後會顯示更完整檢討。</p>`;
  return `
    <h3>牌局檢討</h3>
    <div class="review-summary ${badgeClass}">
      <div><b>${escapeHtml(review.title)}</b><span>${colorizeSuitsHtml(review.subtitle)}</span></div>
      <em>${escapeHtml(review.badge)}</em>
    </div>
    ${detail}
  `;
}
function contractReviewSummary(game) {
  if (!game?.contract) {
    const high = highestBid(game?.auction || []);
    return {
      state: "warn",
      title: "尚未成立合約",
      subtitle: high ? `目前最高叫品 ${callText(high)} by ${SEATS[high.seat]?.key || "?"}` : "仍在叫牌或四家尚未叫出合約。",
      badge: game?.phase === "scoring" ? "Passed out" : "叫牌中",
      detail: ["觀察叫牌紀錄表：最後一個非 Pass 叫品會成為合約，之後連續三家 Pass 才進入打牌。"]
    };
  }
  const declaringTeam = teamOf(game.declarer);
  const defenders = declaringTeam === "NS" ? "EW" : "NS";
  const target = 6 + Number(game.contract.level || 0);
  const madeNow = Number(game.tricksWon?.[declaringTeam] || 0) + (game.phase === "trickPause" && game.pendingTrick?.team === declaringTeam ? 1 : 0);
  const defNow = Number(game.tricksWon?.[defenders] || 0) + (game.phase === "trickPause" && game.pendingTrick?.team === defenders ? 1 : 0);
  const completed = listFromFirebase(game.trickHistory).length + (game.phase === "trickPause" && game.pendingTrick ? 1 : 0);
  const remaining = Math.max(0, 13 - completed);
  const final = game.phase === "scoring";
  const diff = madeNow - target;
  const contract = contractText(game.contract, game.declarer);
  const suitName = game.contract.suit === "NT" ? "無王" : `${SUITS[game.contract.suit]?.symbol || ""}${SUITS[game.contract.suit]?.name || ""}王牌`;
  if (final) {
    const made = diff >= 0;
    const badge = made ? (diff ? `+${diff}` : "剛好") : `${Math.abs(diff)} down`;
    const detail = [
      `合約方 ${declaringTeam} 目標 ${target} 墩，實得 ${madeNow} 墩；防家 ${defenders} 得 ${defNow} 墩。`,
      made ? `成約${diff > 0 ? `並超 ${diff} 墩` : "，剛好完成合約"}。` : `倒約 ${Math.abs(diff)} 墩，可用回放檢查失去控制的關鍵墩。`,
      `合約名目：${suitName}；莊家 ${seatName(game.declarer)}，${game.mode === "standard" ? "夢家" : "同伴"} ${seatName(game.dummy)}。`
    ];
    if (game.result?.detail?.length) detail.push(`計分拆解：${game.result.detail.join("｜")}`);
    return { state: made ? "done" : "danger", title: `${contract}｜${made ? "成約" : "失敗"}`, subtitle: game.result?.summary || `合約方 ${madeNow}/${target} 墩`, badge, detail };
  }
  const canStillMake = madeNow + remaining >= target;
  const alreadyMade = madeNow >= target;
  const state = alreadyMade ? "good" : canStillMake ? "warn" : "danger";
  const need = Math.max(0, target - madeNow);
  const detail = [
    `合約方 ${declaringTeam} 目前 ${madeNow} 墩，目標 ${target} 墩，還差 ${need} 墩；剩餘 ${remaining} 墩。`,
    alreadyMade ? "合約方已達標，接下來是爭取超墩。" : canStillMake ? "合約仍有機會完成，重點是避免不必要失墩。" : "即使剩餘全拿也無法完成合約，接下來只能控制倒約數。",
    `防家 ${defenders} 目前 ${defNow} 墩；合約名目：${suitName}。`
  ];
  return { state, title: `${contract}｜進行中`, subtitle: `${declaringTeam} ${madeNow}/${target} 墩，剩餘 ${remaining} 墩`, badge: alreadyMade ? "已達標" : canStillMake ? `差 ${need}` : "已無法成約", detail };
}

function renderSyncTestPanel(room) {
  const el = $("syncTestPanel");
  if (!el) return;
  el.innerHTML = syncDiagnosticsHtml(room);
  el.querySelector("[data-repair-stuck]")?.addEventListener("click", hostRepairStuckGame);
  el.querySelector("[data-copy-sync]")?.addEventListener("click", copySyncDiagnosticsReport);
  el.querySelector("[data-download-sync]")?.addEventListener("click", downloadSyncDiagnosticsSnapshot);
}
function collectSyncDiagnostics(room = appState.room) {
  const game = room?.game || null;
  const actions = room?.actions || {};
  const actionEntries = Object.entries(actions).sort((a,b)=>(a[1]?.createdAt||0)-(b[1]?.createdAt||0));
  const audit = room?.actionAudit || {};
  const now = Date.now();
  const stale = detectStuckState(room);
  const seats = [0,1,2,3].map((seat) => {
    const player = room?.lobby?.seats?.[seat] || null;
    const state = playerPresenceState(player);
    return { seat, key: SEATS[seat].key, name: player?.name || null, type: player?.type || null, online: player?.online ?? null, lastSeen: player?.lastSeen || null, state: state.label, detail: state.detail };
  });
  return {
    build: BUILD,
    schemaVersion: ROOM_SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    roomCode: room?.meta?.code || null,
    localUid: appState.uid ? String(appState.uid).slice(0, 12) : null,
    isHost: isHost(),
    spectator: appState.spectator,
    connection: { connected: appState.connected, offlineMode: appState.offline },
    firebase: { hostUid: room?.meta?.hostUid ? String(room.meta.hostUid).slice(0, 12) : null, arbiterUid: room?.meta?.arbiterUid ? String(room.meta.arbiterUid).slice(0, 12) : null, hostSeat: hostSeat(room), hostOnline: hostSeat(room) == null ? false : isSeatOnline(room?.lobby?.seats?.[hostSeat(room)]), updatedAt: room?.meta?.updatedAt || null, hostTransferLog: listFromFirebase(room?.meta?.hostTransferLog) },
    game: game ? { id: game.id, phase: game.phase, currentPlayer: game.currentPlayer, updatedAt: game.updatedAt, boardNo: game.boardNo, contract: game.contract, auctionCount: listFromFirebase(game.auction).length, currentTrickCount: listFromFirebase(game.currentTrick).length, trickCount: listFromFirebase(game.trickHistory).length, handCounts: game.handCounts || null } : null,
    actionQueue: actionEntries.map(([id, action]) => ({ id, type: action?.type, seat: action?.seat, actorSeat: action?.actorSeat, status: action?.status || "pending", ageMs: now - Number(action?.createdAt || now), processingAgeMs: action?.processingAt ? now - Number(action.processingAt) : null, clientActionId: action?.clientActionId || null })),
    actionAuditSummary: Object.entries(audit).slice(-20).map(([id, item]) => ({ id, ok: item?.ok, duplicate: Boolean(item?.duplicate), reason: item?.reason || null, at: item?.at || null })),
    processedActions: Object.keys(game?.processedActions || {}).length,
    seats,
    stuck: stale
  };
}
function syncDiagnosticsHtml(room) {
  const diag = collectSyncDiagnostics(room);
  const stuck = diag.stuck;
  const queue = diag.actionQueue;
  const queueRows = queue.length ? queue.slice(0, 8).map((a) => `<tr><td>${escapeHtml(a.type || "-")}</td><td>${escapeHtml(a.status || "pending")}</td><td>${escapeHtml(String(a.seat ?? "-"))}</td><td>${Math.round(Number(a.ageMs || 0) / 1000)} 秒</td></tr>`).join("") : `<tr><td colspan="4">目前沒有待處理動作。</td></tr>`;
  const stateClass = stuck.level === "danger" ? "danger" : stuck.level === "warn" ? "warn" : "ok";
  const host = diag.firebase.hostSeat == null ? "未知" : `${SEATS[diag.firebase.hostSeat].key} ${seatName(diag.firebase.hostSeat)}`;
  return `
    <h3>多人同步 / Action Queue 測試</h3>
    <div class="sync-summary ${stateClass}"><b>${escapeHtml(stuck.title)}</b><span>${escapeHtml(stuck.message)}</span></div>
    <div class="sync-grid">
      <span>房主</span><b>${escapeHtml(host)}${diag.firebase.hostOnline ? " 在線" : " 離線/未知"}</b>
      <span>待處理 actions</span><b>${queue.length}</b>
      <span>已處理指紋</span><b>${diag.processedActions}</b>
      <span>仲裁者</span><b>${escapeHtml(diag.firebase.arbiterUid || "-")}</b>
      <span>Firebase</span><b>${diag.connection.connected ? "已連線" : diag.connection.offlineMode ? "離線局" : "未連線"}</b>
    </div>
    <table class="record-table compact-sync-table"><thead><tr><th>類型</th><th>狀態</th><th>座位</th><th>等待</th></tr></thead><tbody>${queueRows}</tbody></table>
    <div class="button-row compact-actions"><button class="ghost tiny" type="button" data-copy-sync="1">複製診斷</button><button class="ghost tiny" type="button" data-download-sync="1">下載 JSON</button>${(isHost() || appState.offline) ? `<button class="ghost tiny" type="button" data-repair-stuck="1">一鍵修復卡住</button>` : ""}</div>
  `;
}
function detectStuckState(room = appState.room) {
  const game = room?.game;
  const now = Date.now();
  if (!room) return { stuck: false, level: "warn", reason: "no-room", title: "尚未進入房間", message: "目前沒有可診斷的房間。" };
  if (!game) return { stuck: false, level: "warn", reason: "no-game", title: "尚未開局", message: "房間仍在大廳，尚無牌局狀態。" };
  const actions = Object.values(room.actions || {});
  const staleProcessing = actions.find((a) => a?.status === "processing" && now - Number(a.processingAt || 0) > STALE_PROCESSING_MS);
  if (staleProcessing) return { stuck: true, level: "danger", reason: "stale-processing", title: "Action 可能卡住", message: `有動作 processing 超過 ${Math.round(STALE_PROCESSING_MS/1000)} 秒，可由房主一鍵修復。` };
  const oldestPending = actions.filter((a) => !a.status || a.status === "pending").sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))[0];
  if (oldestPending && now - Number(oldestPending.createdAt || now) > ACTION_STUCK_MS) return { stuck: true, level: "danger", reason: "pending-action", title: "Action Queue 等待過久", message: "有玩家動作長時間未被房主處理，可能房主端卡住或已離線。" };
  if (game.phase === "trickPause" && game.pendingTrick?.clearAt && now - Number(game.pendingTrick.clearAt) > 5000) return { stuck: true, level: "danger", reason: "overdue-clear", title: "清桌逾時", message: "本墩已超過預定清桌時間，房主可以立即修復。" };
  if (["auction", "openingLead", "play"].includes(game.phase)) {
    const controller = controllingSeatForCurrentAction(game);
    const player = room.lobby?.seats?.[controller];
    if (player?.type === "bot") {
      const dueAt = Number(game.updatedAt || room.meta?.updatedAt || now) + getAiActionDelayMs(room.lobby?.settings);
      if (now - dueAt > 7000) return { stuck: true, level: "danger", reason: "bot-overdue", title: "AI 動作逾時", message: "AI 應該已經行動但尚未推進，房主可以一鍵修復。" };
    }
    if (!Number.isInteger(game.currentPlayer) || game.currentPlayer < 0 || game.currentPlayer > 3) return { stuck: true, level: "danger", reason: "bad-current-player", title: "輪到者資料異常", message: "currentPlayer 不是有效座位。" };
    if (player?.type === "human" && isPlayerOffline(player)) return { stuck: false, level: "warn", reason: "offline-human", title: "等待離線真人", message: `${player.name || seatName(controller)} 目前離線，房主可接管目前輪到者。` };
  }
  const lag = Math.round((now - Number(game.updatedAt || room.meta?.updatedAt || now)) / 1000);
  return { stuck: false, level: "ok", reason: "ok", title: "同步看起來正常", message: `牌局狀態約 ${Math.max(0, lag)} 秒前更新。` };
}
async function copySyncDiagnosticsReport() {
  await copyText(JSON.stringify(collectSyncDiagnostics(appState.room), null, 2));
  toast("已複製多人同步診斷");
}
function downloadSyncDiagnosticsSnapshot() {
  const code = appState.room?.meta?.code || "offline";
  downloadTextFile(`bridge-sync-${code}-${Date.now()}.json`, JSON.stringify(collectSyncDiagnostics(appState.room), null, 2));
  toast("已下載多人同步 JSON");
}
async function hostRepairStuckGame() {
  if (!(appState.offline || isHost())) return toast("只有房主可以修復卡住狀態");
  const room = appState.room;
  const game = currentGame();
  if (!room || !game) return toast("沒有可修復的牌局");
  const state = detectStuckState(room);
  const now = Date.now();
  const patch = {};
  let changed = false;
  for (const [id, action] of Object.entries(room.actions || {})) {
    if (action?.status === "processing" && now - Number(action.processingAt || 0) > STALE_PROCESSING_MS) {
      patch[`actions/${id}/status`] = null;
      patch[`actions/${id}/processingBy`] = null;
      patch[`actions/${id}/processingAt`] = null;
      patch[`actions/${id}/processorBuild`] = null;
      changed = true;
    }
  }
  const next = structuredCloneCompat(game);
  normalizeGame(next);
  if (next.phase === "trickPause" && next.pendingTrick && Number(next.pendingTrick.clearAt || 0) <= now) {
    finishPendingTrick(next, true);
    patch.game = next;
    changed = true;
  } else if (["auction", "openingLead", "play"].includes(next.phase)) {
    if (!Number.isInteger(next.currentPlayer) || next.currentPlayer < 0 || next.currentPlayer > 3) {
      next.currentPlayer = next.phase === "auction" ? next.dealer : (next.openingLeader ?? next.dealer ?? 2);
      next.log.push("房主修復：currentPlayer 異常，已重設到可推進座位。");
      next.updatedAt = now;
      patch.game = next;
      changed = true;
    } else {
      const controller = controllingSeatForCurrentAction(next);
      const player = room.lobby?.seats?.[controller];
      if (player?.type === "bot") {
        const action = chooseBotAction(next, controller, room.lobby);
        if (action) {
          appendAiThought(next, controller, action, room.lobby);
          const result = applyAction(next, { ...action, uid: player.uid, actorSeat: controller, createdAt: now }, room.lobby);
          if (result.ok) {
            patch.game = next;
            changed = true;
          }
        }
      }
    }
  }
  if (Object.keys(patch).length) {
    patch["meta/updatedAt"] = now;
    await updateRoom(patch);
  }
  if ((room.actions && Object.keys(room.actions).length) && isHostOrArbiter()) setTimeout(maybeProcessActions, 80);
  toast(changed ? `已嘗試修復：${state.title}` : `目前沒有可自動修復項目：${state.title}`);
}

function gameHealthHtml(game, room) {
  const health = inspectGameHealth(game, room);
  return `
    <h3>牌局健康檢查</h3>
    <div class="health-summary ${health.ok ? "ok" : "danger"}"><b>${health.ok ? "同步正常" : "需要注意"}</b><span>${escapeHtml(health.summary)}</span></div>
    <ul class="health-list">${health.items.map((item) => `<li class="${item.ok ? "ok" : "danger"}"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></li>`).join("")}</ul>
    ${securityDesignHtml(game, room)}
  `;
}
function securityDesignHtml(game, room) {
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const dummyPublic = Boolean(game?.mode === "standard" && game?.dummyVisible);
  const secureRuleNote = appState.offline ? "離線局不需 Firebase 規則" : "請部署 v1.0.23 的 database.rules.json / secure example，強制私人手牌只能本人讀、動作只能本人提交、房主/仲裁者才能處理";
  return `
    <h3>防作弊資料拆分設計</h3>
    <ul class="security-list">
      <li><b>玩家可見手牌</b><span>${mySeat == null ? "觀戰：只看公開資訊" : `你是 ${SEATS[mySeat].key}，UI 只操作自己的手牌${dummyPublic ? "；夢家已公開" : ""}`}</span></li>
      <li><b>公開狀態</b><span>合約、叫牌、桌面牌、已完成墩、墩數、玩家在線狀態。</span></li>
      <li><b>私人狀態</b><span>多人牌局已把目前手牌與原始手牌寫到 roomPrivateHands/{code}/{seat}；公開 game 不再保存四家手牌。</span></li>
      <li><b>動作驗證</b><span>真人只送出叫牌/出牌意圖，房主端依 UID、座位、輪到者、合法叫牌與跟牌規則驗證後才更新牌局。</span></li>
      <li><b>觀戰模式</b><span>${room?.lobby?.settings?.allowSpectators === false ? "房主目前關閉觀戰加入" : "觀戰者只能讀公開資訊；未公開手牌在 UI 與資料結構中都不提供給觀戰者"}。</span></li>
      <li><b>部署提醒</b><span>${escapeHtml(secureRuleNote)}。純前端仍信任房主裝置；真正競賽級防作弊需 Cloud Functions 或可信伺服器。</span></li>
    </ul>
  `;
}
function inspectGameHealth(game, room) {
  const allCards = [];
  for (const hand of listFromFirebase(game?.hands || [])) for (const c of listFromFirebase(hand)) allCards.push(c?.id);
  for (const p of listFromFirebase(game?.currentTrick)) allCards.push(p?.card?.id);
  for (const p of listFromFirebase(game?.pendingTrick?.plays)) allCards.push(p?.card?.id);
  for (const trick of listFromFirebase(game?.trickHistory)) for (const p of listFromFirebase(trick?.plays)) allCards.push(p?.card?.id);
  const ids = allCards.filter(Boolean);
  const unique = new Set(ids);
  const dupes = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  const seatsFilled = [0, 1, 2, 3].filter((seat) => room?.lobby?.seats?.[seat]).length;
  const phaseOk = ["auction", "openingLead", "play", "trickPause", "scoring"].includes(game?.phase);
  const turnOk = game?.phase === "scoring" || (Number.isInteger(game?.currentPlayer) && game.currentPlayer >= 0 && game.currentPlayer <= 3);
  const expectedPrivate = !appState.offline && game?.security?.design === "firebase-split-public-private-hands";
  const visibleCount = ids.length;
  const publicCounts = (game?.handCounts || []).reduce((a,b)=>a+Number(b||0),0);
  const cardOk = expectedPrivate ? (publicCounts + listFromFirebase(game?.currentTrick).length + listFromFirebase(game?.pendingTrick?.plays).length + listFromFirebase(game?.trickHistory).reduce((sum,t)=>sum+listFromFirebase(t?.plays).length,0) === 52 || game.phase === "scoring") : (ids.length === 52 && unique.size === 52);
  const items = [
    { label: "座位", ok: seatsFilled === 4, value: `${seatsFilled}/4 已就位` },
    { label: "牌張", ok: cardOk, value: expectedPrivate ? `公開狀態不含暗手牌；你目前可見 ${visibleCount} 張，手牌計數合計 ${publicCounts}/52` : `${ids.length}/52 張，唯一 ${unique.size}/52${dupes.length ? `，重複 ${[...new Set(dupes)].join(",")}` : ""}` },
    { label: "階段", ok: phaseOk, value: game?.phase || "未知" },
    { label: "輪到", ok: turnOk, value: game?.phase === "scoring" ? "已結束" : `${SEATS[game?.currentPlayer]?.key || "?"} ${seatName(game?.currentPlayer)}` },
    { label: "房間", ok: Boolean(room?.meta?.code || appState.offline), value: room?.meta?.code || (appState.offline ? "離線局" : "未知") }
  ];
  const ok = items.every((i) => i.ok);
  return { ok, summary: ok ? "牌張、階段、輪到者與座位狀態看起來正常。" : "偵測到可能的同步或資料問題，可重新整理或請房主重新開局。", items };
}

function tutorialMissionChapter1Html(game, room) {
  const mySeat = findSeatByUid(room, appState.uid, appState.clientId);
  const playedAny = listFromFirebase(game?.trickHistory).length > 0 || listFromFirebase(game?.currentTrick).length > 0 || listFromFirebase(game?.pendingTrick?.plays).length > 0;
  const hasFollowSituation = Boolean(game?.currentTrick?.length && mySeat != null && legalCardsForSeat(game, mySeat).length < (game.hands?.[mySeat] || []).length);
  const tasks = [
    { ok: Boolean(game?.auction?.length), label: "完成一次叫牌或觀察 AI 叫牌", help: "叫牌決定合約，Pass 也是合法叫品。" },
    { ok: Boolean(game?.contract), label: "看懂合約與目標墩數", help: game?.contract ? `${contractText(game.contract, game.declarer)} 要拿 ${6 + game.contract.level} 墩。` : "叫牌結束後會出現合約。" },
    { ok: Boolean(game?.mode === "standard" ? game?.dummyVisible : playedAny), label: "理解夢家 / 閉手模式", help: game?.mode === "standard" ? "標準模式首攻後夢家才亮牌。" : "閉手模式四手都不亮牌。" },
    { ok: playedAny, label: "完成至少一次出牌", help: "輪到你時，合法牌會高亮，不能出的牌會變灰。" },
    { ok: hasFollowSituation || listFromFirebase(game?.trickHistory).length >= 1, label: "學會跟牌規則", help: "有首引花色時必須跟同花色；沒有才可墊牌或將吃。" }
  ];
  const done = tasks.filter((t) => t.ok).length;
  if (done >= tasks.length) localStorage.setItem(STORAGE.tutorialChapter1, "done");
  const savedDone = localStorage.getItem(STORAGE.tutorialChapter1) === "done";
  return `
    <div class="tutorial-mission-card ${savedDone ? "done" : ""}">
      <div class="tutorial-mission-head"><h3>新手教學任務｜第一章：跟牌與一墩</h3><span>${done}/${tasks.length}</span></div>
      <p class="hint compact">這章只練基本流程：叫牌、看合約、首攻、跟牌、完成一墩。完成後可再進入後續進階章節。</p>
      <ol>${tasks.map((task) => `<li class="${task.ok ? "ok" : "todo"}"><b>${task.ok ? "✓" : "○"} ${escapeHtml(task.label)}</b><span>${colorizeSuitsHtml(escapeHtml(task.help))}</span></li>`).join("")}</ol>
      <button id="btnResetTutorialChapter1" class="ghost tiny" type="button">重置第一章進度</button>
    </div>
  `;
}
function resetTutorialChapter1() {
  localStorage.removeItem(STORAGE.tutorialChapter1);
  renderAll();
  toast("已重置新手教學第一章");
}
function tutorialMissionChapter2Html(game, room) {
  const high = highestBid(game?.auction || []);
  const hasContract = Boolean(game?.contract);
  const contractGoal = hasContract ? 6 + Number(game.contract.level || 0) : null;
  const isGameContract = hasContract && contractBasePoints(game.contract.level, game.contract.suit) >= 100;
  const sawScore = Boolean(game?.phase === "scoring" && game?.result);
  const tasks = [
    { ok: Boolean(high || hasContract), label: "看懂目前最高叫品", help: high ? `目前最高叫品是 ${callText(high)}，同一階數需用更高名目或升階才能蓋過。` : "有人叫出合約名目後，叫牌紀錄表會顯示最高叫品。" },
    { ok: hasContract, label: "知道合約目標 = 6 + 階數", help: hasContract ? `${contractText(game.contract, game.declarer)} 的目標是 ${contractGoal} 墩。` : "例如 1 階要 7 墩，3NT 要 9 墩，4♥ / 4♠ 要 10 墩。" },
    { ok: Boolean(hasContract && ["NT", "H", "S", "D", "C"].includes(game.contract.suit)), label: "分辨王牌 / 無王", help: hasContract ? (game.contract.suit === "NT" ? "本副是無王合約，沒有任何花色可以將吃。" : `本副以 ${SUITS[game.contract.suit]?.symbol || ""}${SUITS[game.contract.suit]?.name || ""} 為王牌。`) : "合約名目會決定王牌，NT 代表無王。" },
    { ok: Boolean(hasContract && (isGameContract || game.contract.level >= 3)), label: "認識成局線", help: hasContract ? (isGameContract ? "這是成局合約，基本分達 100 以上，獎分較高。" : "這是部分合約，基本分未達 100；3NT、4♥、4♠、5♣、5♦ 是常見成局。") : "基本分達 100 以上就是成局。" },
    { ok: sawScore, label: "看懂結算與得分", help: sawScore ? (game.result?.summary || "本副已結算，可看結果視窗的計分拆解。") : "本副結束後會顯示合約分、獎分、超墩或倒約罰分。" }
  ];
  const done = tasks.filter((t) => t.ok).length;
  if (done >= tasks.length) localStorage.setItem(STORAGE.tutorialChapter2, "done");
  const savedDone = localStorage.getItem(STORAGE.tutorialChapter2) === "done";
  return `
    <div class="tutorial-mission-card ${savedDone ? "done" : ""}">
      <div class="tutorial-mission-head"><h3>新手教學任務｜第二章：合約與成局</h3><span>${done}/${tasks.length}</span></div>
      <p class="hint compact">這章練習看懂叫牌結果、合約目標、王牌 / 無王、成局與最後計分。</p>
      <ol>${tasks.map((task) => `<li class="${task.ok ? "ok" : "todo"}"><b>${task.ok ? "✓" : "○"} ${escapeHtml(task.label)}</b><span>${colorizeSuitsHtml(escapeHtml(task.help))}</span></li>`).join("")}</ol>
      <button id="btnResetTutorialChapter2" class="ghost tiny" type="button">重置第二章進度</button>
    </div>
  `;
}
function resetTutorialChapter2() {
  localStorage.removeItem(STORAGE.tutorialChapter2);
  renderAll();
  toast("已重置新手教學第二章");
}


function tutorialMissionChapter3Html(game, room) {
  const hasContract = Boolean(game?.contract);
  const trumpSuit = game?.contract?.suit;
  const trumpLabel = hasContract ? (trumpSuit === "NT" ? "無王" : `${SUITS[trumpSuit]?.symbol || ""}${SUITS[trumpSuit]?.name || ""}`) : "尚未成立";
  const playedAny = listFromFirebase(game?.trickHistory).length > 0 || listFromFirebase(game?.currentTrick).length > 0 || listFromFirebase(game?.pendingTrick?.plays).length > 0;
  const dummyLearned = game?.mode === "standard" ? Boolean(game?.dummyVisible || game?.phase === "scoring") : Boolean(playedAny);
  const ruffed = listFromFirebase(game?.trickHistory).some((trick) => {
    const plays = listFromFirebase(trick?.plays);
    const led = plays[0]?.card?.suit;
    return trumpSuit && trumpSuit !== "NT" && plays.some((p) => p.card?.suit === trumpSuit && led && led !== trumpSuit);
  });
  const hadFollowRuleMoment = listFromFirebase(game?.trickHistory).length >= 1 || Boolean(game?.currentTrick?.length);
  const tasks = [
    { ok: hasContract, label: "分辨本副是王牌或無王", help: hasContract ? `本副名目是 ${trumpLabel}；${trumpSuit === "NT" ? "沒有王牌，不能將吃。" : "王牌可以吃掉非首引花色。"}` : "合約成立後會看到王牌或 NT 無王。" },
    { ok: Boolean(hasContract && trumpSuit !== "NT"), label: "知道哪一門是王牌", help: hasContract && trumpSuit !== "NT" ? `${trumpLabel} 是王牌；有首引花色時仍必須先跟牌。` : "如果合約是 ♥ / ♠ / ♦ / ♣，該花色就是王牌。" },
    { ok: hadFollowRuleMoment, label: "理解有牌可跟時不能王吃", help: "每墩第一張決定首引花色；手上有同花色就必須跟，沒有才可以墊牌或出王牌將吃。" },
    { ok: Boolean(ruffed || (hasContract && trumpSuit === "NT") || listFromFirebase(game?.trickHistory).length >= 3), label: "觀察將吃或無王差異", help: trumpSuit === "NT" ? "無王合約中沒有王牌，最大牌只看首引花色。" : (ruffed ? "你已看過有人用王牌將吃。" : "沒有首引花色時才可能用王牌吃墩。") },
    { ok: dummyLearned, label: "理解夢家 / 閉手變體", help: game?.mode === "standard" ? "標準模式首攻後夢家亮牌，由莊家指揮夢家出牌。" : "閉手變體取消夢家亮牌，四位玩家都暗牌自行出牌。" }
  ];
  const done = tasks.filter((t) => t.ok).length;
  if (done >= tasks.length) localStorage.setItem(STORAGE.tutorialChapter3, "done");
  const savedDone = localStorage.getItem(STORAGE.tutorialChapter3) === "done";
  return `
    <div class="tutorial-mission-card ${savedDone ? "done" : ""}">
      <div class="tutorial-mission-head"><h3>新手教學任務｜第三章：王牌與夢家</h3><span>${done}/${tasks.length}</span></div>
      <p class="hint compact">這章練習王牌、無王、將吃限制，以及標準夢家亮牌和閉手變體的差異。</p>
      <ol>${tasks.map((task) => `<li class="${task.ok ? "ok" : "todo"}"><b>${task.ok ? "✓" : "○"} ${escapeHtml(task.label)}</b><span>${colorizeSuitsHtml(escapeHtml(task.help))}</span></li>`).join("")}</ol>
      <button id="btnResetTutorialChapter3" class="ghost tiny" type="button">重置第三章進度</button>
    </div>
  `;
}
function resetTutorialChapter3() {
  localStorage.removeItem(STORAGE.tutorialChapter3);
  renderAll();
  toast("已重置新手教學第三章");
}

function currentReviewText(game = currentGame()) {
  if (!game) return "尚未有牌局。";
  const review = contractReviewSummary(game);
  return [`牌局檢討｜${BUILD}`, review.title, review.subtitle, review.badge, ...review.detail.map((x) => `- ${x}`)].join("\n");
}
async function copyCurrentReview() {
  await copyText(currentReviewText(currentGame()));
  toast("已複製牌局檢討");
}
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}
function downloadCurrentHandRecord() {
  const game = currentGame();
  const roomCode = appState.room?.meta?.code || "offline";
  const board = game?.boardNo ? `board-${game.boardNo}` : "current";
  downloadTextFile(`bridge-${roomCode}-${board}.txt`, handRecordText(game, appState.room));
  toast("已下載完整牌譜 TXT");
}
function auctionTableHtml(game) {
  const auction = listFromFirebase(game.auction);
  const cols = [3, 0, 1, 2];
  if (!auction.length) return `<p class="hint compact">尚未叫牌。</p>`;
  const rows = [];
  let row = ["", "", "", ""];
  for (const call of auction) {
    const pos = Math.max(0, cols.indexOf(Number(call.seat)));
    if (row[pos]) {
      rows.push(row);
      row = ["", "", "", ""];
    }
    row[pos] = callTextHtml(call);
    if (pos === 3) {
      rows.push(row);
      row = ["", "", "", ""];
    }
  }
  if (row.some(Boolean)) rows.push(row);
  return `
    <table class="record-table auction-table">
      <thead><tr>${cols.map((seat) => `<th>${SEATS[seat].key}<small>${SEATS[seat].name}</small></th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${cell || ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}
function trickRecordHtml(game) {
  const cols = [0, 1, 2, 3];
  const rows = [];
  for (const trick of listFromFirebase(game.trickHistory)) rows.push({ status: "done", ...trick });
  if (game.phase === "trickPause" && game.pendingTrick) rows.push({ status: "pending", ...game.pendingTrick });
  else if (game.currentTrick?.length) rows.push({ status: "live", no: game.trickHistory.length + 1, plays: game.currentTrick, winner: null, team: null });
  if (!rows.length) return `<p class="hint compact">尚未有出牌紀錄。</p>`;
  return `
    <table class="record-table trick-table">
      <thead><tr><th>墩</th><th>首攻</th>${cols.map((seat) => `<th>${SEATS[seat].key}</th>`).join("")}<th>贏家</th></tr></thead>
      <tbody>${rows.map((trick) => {
        const plays = listFromFirebase(trick.plays);
        const bySeat = Object.fromEntries(plays.map((p) => [p.seat, p.card]));
        const lead = plays[0]?.seat != null ? SEATS[plays[0].seat].key : "";
        const status = trick.status === "pending" ? "待收牌" : trick.status === "live" ? "進行中" : (trick.winner != null ? `${SEATS[trick.winner].key}・${trick.team}` : "");
        return `<tr class="${trick.status === "pending" ? "pending-row" : trick.status === "live" ? "live-row" : ""}"><td>${trick.no}</td><td>${lead}</td>${cols.map((seat) => `<td>${bySeat[seat] ? cardTextHtml(bySeat[seat]) : ""}</td>`).join("")}<td>${escapeHtml(status)}</td></tr>`;
      }).join("")}</tbody>
    </table>
  `;
}
function cardTextHtml(card) { return `<span class="card-text ${cardColor(card)}">${escapeHtml(card.rank)}${suitSymbolHtml(card.suit)}</span>`; }
function callTextHtml(call) {
  if (call?.type === "bid") return `<span class="call-text ${suitColorClass(call.suit)}">${escapeHtml(call.level)}${suitSymbolHtml(call.suit)}</span>`;
  return `<span class="call-text">${escapeHtml(callText(call))}</span>`;
}
function sameBidCall(a, b) {
  return Boolean(a && b && a.type === "bid" && b.type === "bid" && Number(a.seat) === Number(b.seat) && Number(a.level) === Number(b.level) && a.suit === b.suit);
}
function auctionSeatCallsHtml(game, seat) {
  const auction = listFromFirebase(game?.auction || []);
  const callsForSeat = auction.filter((call) => Number(call?.seat) === Number(seat));
  if (!callsForSeat.length) return "";
  const high = highestBid(auction);
  let shown = callsForSeat.slice(-4);
  if (high && Number(high.seat) === Number(seat) && !shown.some((call) => sameBidCall(call, high))) shown = [high, ...shown.slice(-3)];
  const lastIndex = shown.length - 1;
  const tokens = shown.map((call, idx) => {
    const isHigh = sameBidCall(call, high);
    const cls = ["auction-seat-token", `call-${call?.type || "unknown"}`, idx === lastIndex ? "latest" : "", isHigh ? "highest" : ""].filter(Boolean).join(" ");
    return `<span class="${cls}">${callTextHtml(call)}${isHigh ? `<em>目前最高</em>` : ""}</span>`;
  }).join("");
  const hasHigh = high && Number(high.seat) === Number(seat);
  return `<div class="auction-seat-badge ${hasHigh ? "has-highest" : ""}" aria-label="${seatName(seat)}叫牌">${tokens}</div>`;
}
function auctionCenterStatusHtml(game, high = highestBid(game?.auction || [])) {
  if (!game?.auction?.length) return `<span class="pill auction-status-pill">尚未叫牌</span>`;
  const status = high ? `目前最高：${seatName(high.seat)} ${callTextHtml(high)}` : "目前尚未有人叫牌";
  return `<span class="pill auction-status-pill">${status}</span>`;
}
function renderGameRoomStatus(room) {
  const el = $("gameRoomStatus");
  if (!el) return;
  el.classList.toggle("hidden", Boolean(appState.offline));
  if (!appState.offline) el.innerHTML = renderPresenceStatusHtml(room, true);
  const gamePacing = $("gamePacing");
  if (gamePacing) gamePacing.value = sanitizePacingMs(room?.lobby?.settings?.pacingMs || AI_ACTION_DELAY_MS);
  updateCurrentTakeoverButton(room?.game ? currentWaitInfo(room.game, room) : null);
}
function renderPresenceStatusHtml(room, compact = false) {
  const hSeat = hostSeat(room);
  const arbiterUid = room?.meta?.arbiterUid || room?.meta?.hostUid;
  const aSeat = [0, 1, 2, 3].find((seat) => room?.lobby?.seats?.[seat]?.uid === arbiterUid);
  const failover = hostFailoverReady(room);
  const rows = [0, 1, 2, 3].map((seat) => {
    const player = room?.lobby?.seats?.[seat];
    const state = playerPresenceState(player);
    const mine = player && (player.uid === appState.uid || player.clientId === appState.clientId) ? "・你" : "";
    const hostMark = seat === hSeat ? "・房主" : "";
    const arbiterMark = seat === aSeat ? "・仲裁者" : "";
    return `<div class="presence-row ${state.className}"><b>${SEATS[seat].key} ${seatName(seat)}</b><span>${escapeHtml(player?.name || "空位")}${mine}${hostMark}${arbiterMark}</span><em>${state.label}${state.detail ? `｜${state.detail}` : ""}</em></div>`;
  }).join("");
  const hostText = hSeat == null ? "房主未入座" : `房主 ${SEATS[hSeat].key}${failover.reason === "grace" ? `｜轉移倒數 ${Math.ceil((failover.remainingMs || 0) / 1000)} 秒` : ""}`;
  const arbiterText = aSeat == null ? "仲裁者未入座" : `仲裁者 ${SEATS[aSeat].key}`;
  const transferLog = listFromFirebase(room?.meta?.hostTransferLog).slice(-1)[0];
  const diag = `<span>${escapeHtml(hostText)}｜${escapeHtml(arbiterText)}</span>${transferLog ? `<span>最近轉移：${escapeHtml(lastSeenText(transferLog.at))}</span>` : (compact ? "" : `<span>斷線後重新開啟同一房間連結，會自動恢復原座位。</span>`)}`;
  return `<div class="presence-card-title"><b>房間玩家狀態</b>${diag}</div><div class="presence-list">${rows}</div>`;
}
function playerPresenceState(player) {
  if (!player) return { label: "空位", className: "empty", detail: "" };
  if (player.type === "bot") return { label: "AI", className: "bot", detail: "電腦代打" };
  const offline = isPlayerOffline(player);
  return { label: offline ? "離線" : "在線", className: offline ? "offline" : "online", detail: lastSeenText(player.lastSeen) };
}
function isPlayerOffline(player) {
  if (!player || player.type !== "human") return false;
  if (player.online === false) return true;
  const seen = Number(player.lastSeen || 0);
  return Boolean(seen && Date.now() - seen > PRESENCE_OFFLINE_MS);
}
function lastSeenText(value) {
  const seen = Number(value || 0);
  if (!seen) return "尚未同步";
  const sec = Math.max(0, Math.floor((Date.now() - seen) / 1000));
  if (sec < 8) return "剛剛";
  if (sec < 60) return `${sec} 秒前`;
  return `${Math.floor(sec / 60)} 分前`;
}
function presenceTagHtml(player) {
  const state = playerPresenceState(player);
  if (!player || player.type === "bot") return player?.type === "bot" ? `<span class="tag warn">AI</span>` : "";
  return `<span class="tag presence-tag ${state.className}">${state.label}</span>`;
}
function renderTable(room) {
  const game = room.game;
  const mySeat = findSeatByUid(room, appState.uid);
  for (let seat = 0; seat < 4; seat++) {
    const el = $(`seat${seat}`);
    const player = room.lobby.seats[seat];
    const classes = ["seat", `seat-${seat}`];
    if (game.currentPlayer === seat && game.phase !== "scoring") classes.push("current");
    if (game.declarer === seat) classes.push("declarer");
    if (game.mode === "standard" && game.dummy === seat) classes.push("dummy");
    el.className = classes.join(" ");
    const tags = [];
    if (seat === mySeat) tags.push(`<span class="tag ok">你</span>`);
    const presenceTag = presenceTagHtml(player);
    if (presenceTag) tags.push(presenceTag);
    if (seat === game.dealer) tags.push(`<span class="tag warn">發牌</span>`);
    if (isVulnerable(game.vulnerability, teamOf(seat))) tags.push(`<span class="tag danger">有身價</span>`);
    if (game.declarer === seat) tags.push(`<span class="tag">莊家</span>`);
    if (game.openingLeader === seat && ["openingLead", "play", "trickPause"].includes(game.phase)) tags.push(`<span class="tag">首攻</span>`);
    if (game.mode === "standard" && game.dummy === seat) tags.push(`<span class="tag">夢家</span>`);
    const visible = isSeatHandVisible(game, seat, mySeat);
    const displayCount = game.handCounts?.[seat] ?? game.hands[seat]?.length ?? 0;
    const mini = visible ? `<div class="seat-mini-hand">${(game.hands[seat] || []).slice(0, 13).map((c) => miniCardHtml(c)).join("")}</div>` : `<div class="seat-mini-hand">${Array.from({ length: Math.min(13, displayCount) }, () => `<span class="mini-card">🂠</span>`).join("")}</div>`;
    el.innerHTML = `
      <div class="seat-head"><span class="seat-name">${seatName(seat)}</span><span>${SEATS[seat].key}</span></div>
      <div class="seat-meta">${escapeHtml(player?.name || "空位")}｜${teamOf(seat)}｜${isVulnerable(game.vulnerability, teamOf(seat)) ? "有身價" : "無身價"}｜手牌 ${displayCount}｜本方 ${game.tricksWon?.[teamOf(seat)] || 0} 墩</div>
      <div class="seat-tags">${tags.join("")}</div>${mini}
    `;
    const playEl = $(`play${seat}`);
    if (game.phase === "auction") {
      playEl.innerHTML = auctionSeatCallsHtml(game, seat);
    } else {
      const liveWinningPlay = currentWinningPlay(game.currentTrick || [], game.contract?.suit);
      const play = (game.currentTrick || []).find((p) => p.seat === seat);
      const isWinningCard = Boolean(play && liveWinningPlay && play.seat === liveWinningPlay.seat && play.card?.id === liveWinningPlay.card?.id);
      playEl.innerHTML = play ? cardHtml(play.card, { small: false, winning: isWinningCard }) : "";
    }
  }
  const liveWinner = currentWinningPlay(game.currentTrick || [], game.contract?.suit);
  if (game.phase === "auction") {
    const high = highestBid(game.auction || []);
    $("trickArea").innerHTML = `<span class="pill auction-turn-pill">輪到 ${seatName(game.currentPlayer)} 叫牌</span>`;
    $("kittyArea").innerHTML = auctionCenterStatusHtml(game, high);
  } else {
    $("trickArea").innerHTML = game.phase === "trickPause" && game.pendingTrick ?  `<span class="pill winning-pill">本墩完成｜${seatName(game.pendingTrick.winner)} 贏，${currentWaitInfo(game, room).countdownText || "即將清桌"}</span>` : (game.currentTrick?.length ? `<span class="pill winning-pill">本墩 ${game.currentTrick.length}/4｜目前最大：${seatName(liveWinner?.seat)} ${liveWinner?.card ? cardTextHtml(liveWinner.card) : ""}</span>` : `<span class="pill">等待出牌</span>`);
    $("kittyArea").innerHTML = "";
  }
}
function isSeatHandVisible(game, seat, mySeat) {
  if (appState.spectator) return game.phase === "scoring" || (game.mode === "standard" && game.dummyVisible && seat === game.dummy);
  if (seat === mySeat) return true;
  if (game.phase === "scoring") return true;
  if (game.mode === "standard" && game.dummyVisible && seat === game.dummy) return true;
  return false;
}
function renderHand(room) {
  const game = room.game;
  const mySeat = findSeatByUid(room, appState.uid);
  const control = controllableSeatForViewer(game, mySeat);
  const seat = control?.seat ?? mySeat;
  const canAct = control?.canAct ?? false;
  const hand = seat == null ? [] : (game.hands[seat] || []);
  const displayHand = sortHandForDisplay(hand);
  $("handTitle").textContent = seat == null ? "觀戰中" : (seat === mySeat ? "你的手牌" : `你正在指揮 ${seatName(seat)} 的夢家牌`);
  $("handHint").innerHTML = colorizeSuitsHtml(handHintText(game, seat, canAct));
  $("handCount").textContent = seat == null ? "觀戰" : `${hand.length} 張`;
  renderHandAnalysis(game, seat, canAct);
  const suggestionEl = $("handSuggestion");
  if (suggestionEl) {
    suggestionEl.innerHTML = renderPlayerSuggestion(game, { seat, canAct });
    suggestionEl.classList.toggle("hidden", !canAct);
    attachSuggestionActions(suggestionEl, mySeat);
  }

  const legalIds = canAct && ["openingLead", "play"].includes(game.phase) ? new Set(legalCardsForSeat(game, seat).map((c) => c.id)) : new Set();
  const confirmPlay = getBool(STORAGE.confirmPlay, false);
  if (!canAct || !["openingLead", "play"].includes(game.phase) || !appState.pendingPlay || appState.pendingPlay.seat !== seat || !legalIds.has(appState.pendingPlay.cardId)) {
    if (appState.pendingPlay && (!canAct || appState.pendingPlay.seat !== seat || !legalIds.has(appState.pendingPlay.cardId))) appState.pendingPlay = null;
  }
  const inlinePanel = $("handActionPanel");
  if (inlinePanel) {
    inlinePanel.innerHTML = "";
    const showConfirm = confirmPlay && canAct && ["openingLead", "play"].includes(game.phase);
    inlinePanel.classList.toggle("hidden", !(game.phase === "auction" || showConfirm));
    if (game.phase === "auction") renderAuctionControls(inlinePanel, game, mySeat, { compact: true, showTitle: true });
    else if (showConfirm) renderPlayConfirmControls(inlinePanel, game, seat);
  }

  $("hand").innerHTML = displayHand.map((card) => {
    const playable = legalIds.has(card.id);
    const disabled = canAct && ["openingLead", "play"].includes(game.phase) && !playable;
    const selected = Boolean(appState.pendingPlay && appState.pendingPlay.seat === seat && appState.pendingPlay.cardId === card.id);
    return cardHtml(card, { playable, disabled, selected, cardId: card.id, seat });
  }).join("");
  document.querySelectorAll(".card-face.playable[data-card-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const cardId = el.dataset.cardId;
      const playSeat = Number(el.dataset.seat);
      if (getBool(STORAGE.confirmPlay, false)) {
        appState.pendingPlay = { seat: playSeat, cardId };
        renderHand(appState.room);
      } else {
        submitAction({ type: "play", seat: playSeat, cardId });
      }
    });
  });
}

function sortHandForDisplay(hand) {
  const mode = loadSetting(STORAGE.handSortMode, "suit");
  const cards = [...(hand || [])];
  if (mode === "rank") {
    const suitWeight = { S: 0, H: 1, D: 2, C: 3 };
    return cards.sort((a, b) => b.order - a.order || suitWeight[a.suit] - suitWeight[b.suit]);
  }
  if (mode === "redblack") {
    const suitWeight = { S: 0, H: 1, C: 2, D: 3 };
    return cards.sort((a, b) => suitWeight[a.suit] - suitWeight[b.suit] || b.order - a.order);
  }
  return sortHand(cards);
}

function renderPlayConfirmControls(container, game, seat) {
  const selected = appState.pendingPlay;
  const card = selected ? (game.hands?.[seat] || []).find((c) => c.id === selected.cardId) : null;
  const bar = document.createElement("div");
  bar.className = "play-confirm-bar";
  if (!card) {
    bar.innerHTML = `<b>出牌確認已開啟</b><span>先點選一張高亮的合法牌，再按確認出牌。</span>`;
  } else {
    bar.innerHTML = `<b>已選 ${cardTextHtml(card)}</b><span>確認後才會送出，避免手機誤觸。</span>`;
    const row = document.createElement("div");
    row.className = "button-row";
    row.append(
      button("確認出牌", "primary", () => submitAction({ type: "play", seat, cardId: card.id })),
      button("取消選牌", "ghost", () => { appState.pendingPlay = null; renderHand(appState.room); })
    );
    bar.appendChild(row);
  }
  container.appendChild(bar);
}

function controllableSeatForViewer(game, mySeat) {
  if (mySeat == null || appState.spectator) return { seat: null, canAct: false };
  if (game.phase === "auction") return { seat: mySeat, canAct: game.currentPlayer === mySeat };
  if (["openingLead", "play"].includes(game.phase)) {
    if (game.currentPlayer === mySeat) return { seat: mySeat, canAct: true };
    if (game.mode === "standard" && game.currentPlayer === game.dummy && mySeat === game.declarer) return { seat: game.dummy, canAct: true };
    return { seat: mySeat, canAct: false };
  }
  return { seat: mySeat, canAct: false };
}
function handHintText(game, seat, canAct) {
  if (seat == null) return "你正在觀戰，可查看公開資訊與回放。";
  if (game.phase === "auction") return canAct ? "輪到你叫牌。可 Pass、叫價，符合條件時可 Double / Redouble。" : `等待 ${seatName(game.currentPlayer)} 叫牌。`;
  if (game.phase === "openingLead") return canAct ? "請選一張牌首攻。可出的牌會上移並高亮。" : `等待 ${seatName(game.currentPlayer)} 首攻。`;
  if (game.phase === "play") return canAct ? legalPlayHint(game, seat) : `等待 ${seatName(game.currentPlayer)} 出牌。`;
  if (game.phase === "trickPause") return `本墩四張牌已出完，桌面會保留 ${pacingLabel(appState.room?.lobby?.settings)} 再收牌。`;
  return "本副已結算。";
}
function legalPlayHint(game, seat) {
  const trick = game.currentTrick || [];
  if (!trick.length) return "你是本墩首攻，可自由選牌；可出的牌會上移並高亮。";
  const ledSuit = trick[0].card.suit;
  const hand = game.hands[seat] || [];
  const hasLed = hand.some((c) => c.suit === ledSuit);
  return hasLed
    ? `首引花色是 ${SUITS[ledSuit].symbol}${SUITS[ledSuit].name}，你必須跟牌；不能出的牌已變灰。`
    : `首引花色是 ${SUITS[ledSuit].symbol}${SUITS[ledSuit].name}，你沒有該花色，可墊牌或將吃；可出的牌已高亮。`;
}
function renderHandAnalysis(game, seat, canAct) {
  const el = $("handAnalysis");
  if (!el) return;
  if (seat == null) {
    el.innerHTML = `<span class="hand-chip"><b>觀戰中</b><small>公開資訊</small></span><span class="hand-chip"><b>回放</b><small>可賽後檢討</small></span>`;
    return;
  }
  const hand = game.hands?.[seat] || [];
  const hcp = handHcp(hand);
  const shape = suitLengths(hand);
  const legalCount = canAct && ["openingLead", "play"].includes(game.phase) ? legalCardsForSeat(game, seat).length : null;
  const role = game.declarer === seat ? "莊家" : game.dummy === seat && game.mode === "standard" ? "夢家" : game.contract ? (teamOf(seat) === teamOf(game.declarer) ? "莊家方" : "防家") : teamOf(seat);
  const chips = [
    [`${hcp} HCP`, "牌力"],
    [`♠${shape.S} ♥${shape.H} ♦${shape.D} ♣${shape.C}`, "牌型"],
    [role, "角色"],
  ];
  if (legalCount != null) chips.push([`${legalCount} 張`, "合法出牌"]);
  el.innerHTML = chips.map(([value, label]) => `<span class="hand-chip"><b>${colorizeSuitsHtml(value)}</b><small>${escapeHtml(label)}</small></span>`).join("");
}

function renderPlayerSuggestion(game, control) {
  if (!control?.canAct) return "";
  if (game.phase === "auction") {
    const suggestion = suggestCall(game, control.seat);
    if (!suggestion?.call) return "";
    return `<div class="player-suggestion"><b>教練建議：${callTextHtml(suggestion.call)}</b><span>${colorizeSuitsHtml(suggestion.reason)}</span><button class="ghost tiny" type="button" data-suggest-call="${escapeHtml(JSON.stringify(suggestion.call))}">套用建議</button></div>`;
  }
  if (["openingLead", "play"].includes(game.phase)) {
    const suggestion = suggestPlay(game, control.seat);
    if (!suggestion?.card) return "";
    return `<div class="player-suggestion"><b>教練建議：${cardTextHtml(suggestion.card)}</b><span>${colorizeSuitsHtml(suggestion.reason)}</span><button class="ghost tiny" type="button" data-suggest-play="${escapeHtml(suggestion.card.id)}" data-seat="${control.seat}">出這張</button></div>`;
  }
  return "";
}
function attachSuggestionActions(container, mySeat) {
  container.querySelectorAll("[data-suggest-call]").forEach((btn) => {
    btn.addEventListener("click", () => {
      try { submitAction({ type: "call", seat: mySeat, call: JSON.parse(btn.dataset.suggestCall) }); }
      catch { toast("建議叫品資料錯誤"); }
    });
  });
  container.querySelectorAll("[data-suggest-play]").forEach((btn) => {
    btn.addEventListener("click", () => submitAction({ type: "play", seat: Number(btn.dataset.seat), cardId: btn.dataset.suggestPlay }));
  });
}
function suggestCall(game, seat) {
  try {
    const decision = naturalCallDecision(structuredCloneCompat(game), seat, appState.room?.lobby || { settings: { difficulty: 12 } });
    return { call: decision.call, reason: `自然制第一版：${decision.reason}` };
  } catch (error) {
    console.warn("suggestCall failed", error);
    return null;
  }
}
function suggestPlay(game, seat) {
  try {
    const card = chooseBotCard(structuredCloneCompat(game), seat, appState.room?.lobby || { settings: { difficulty: 12 } });
    if (!card) return null;
    const legal = legalCardsForSeat(game, seat);
    const led = game.currentTrick?.[0]?.card?.suit;
    let reason = !led ? `本墩首攻，從 ${legal.length} 張合法牌中選擇 ${card.label}。` : `首引 ${SUITS[led].symbol}${SUITS[led].name}，從 ${legal.length} 張合法牌中選擇 ${card.label}。`;
    if (game.currentTrick?.length && wouldCardWin(game.currentTrick, card, game.contract?.suit)) reason += "這張目前可以贏過桌面最大牌。";
    return { card, reason };
  } catch (error) {
    console.warn("suggestPlay failed", error);
    return null;
  }
}

function renderActions(room) {
  const game = room.game;
  const mySeat = findSeatByUid(room, appState.uid);
  const panel = $("actionPanel");
  panel.innerHTML = "";
  if (game.phase === "auction") {
    renderAuctionControls(panel, game, mySeat, { compact: false, showTitle: true });
    const control = controllableSeatForViewer(game, mySeat);
    const sug = document.createElement("div");
    sug.innerHTML = renderPlayerSuggestion(game, control);
    if (sug.innerHTML) { panel.appendChild(sug); attachSuggestionActions(sug, mySeat); }
    return;
  }
  if (["openingLead", "play"].includes(game.phase)) {
    const control = controllableSeatForViewer(game, mySeat);
    const wait = currentWaitInfo(game, room);
    const note = actionNote(control.canAct ? "請直接點手牌出牌。" : `${wait.title}。${wait.detail || ""}`);
    panel.append(note);
    const sug = document.createElement("div");
    sug.innerHTML = renderPlayerSuggestion(game, control);
    if (sug.innerHTML) { panel.appendChild(sug); attachSuggestionActions(sug, mySeat); }
    return;
  }
  if (game.phase === "trickPause") {
    const wait = currentWaitInfo(game, room);
    panel.append(actionNote(`本墩已出完，${wait.countdownText || `保留桌面 ${pacingLabel(appState.room?.lobby?.settings)}`}。`));
    return;
  }
  if (game.phase === "scoring") {
    const row = document.createElement("div");
    row.className = "button-row";
    const canNew = appState.offline || isHost();
    const next = button("再玩一副", "primary", hostStartGame);
    next.disabled = !canNew;
    row.append(next, button("打開回放", "ghost", () => openReplayDialog(game)));
    panel.appendChild(row);
  }
}

function renderAuctionControls(container, game, mySeat, options = {}) {
  if (!container) return;
  const wrap = document.createElement("div");
  wrap.className = `auction-controls${options.compact ? " compact-auction-controls" : ""}`;
  if (options.showTitle) {
    const title = document.createElement("div");
    title.className = "auction-control-title";
    title.innerHTML = `<b>叫牌操作</b><span>${colorizeSuitsHtml(auctionControlStatusText(game, mySeat))}</span>`;
    wrap.appendChild(title);
  }
  if (mySeat == null || appState.spectator) {
    wrap.append(actionNote("觀戰中，不能叫牌。"));
    container.appendChild(wrap);
    return;
  }
  if (game.currentPlayer !== mySeat) {
    wrap.append(actionNote(`等待 ${seatName(game.currentPlayer)} 叫牌。你目前是 ${seatName(mySeat)}。`));
    container.appendChild(wrap);
    return;
  }
  let legal = [];
  try {
    legal = legalCalls(game, mySeat);
  } catch (error) {
    console.error("legalCalls failed", error);
    wrap.append(actionNote("叫牌按鈕產生失敗，請重新整理頁面或請房主重新開局。"));
    container.appendChild(wrap);
    return;
  }
  const basic = document.createElement("div");
  basic.className = "button-row call-row";
  for (const call of legal.filter((c) => c.type !== "bid")) {
    const btn = button(callText(call), call.type === "pass" ? "primary" : "ghost", () => submitAction({ type: "call", seat: mySeat, call }));
    btn.innerHTML = callTextHtml(call);
    btn.title = `${seatName(mySeat)} 叫 ${callText(call)}｜${callTeachingText(call)}`;
    basic.appendChild(btn);
  }
  wrap.appendChild(basic);

  const bidGrid = document.createElement("div");
  bidGrid.className = "action-grid bid-grid";
  for (let level = 1; level <= 7; level++) {
    for (const suit of SUIT_ORDER) {
      const call = { type: "bid", level, suit };
      const btn = button(`${level}${SUITS[suit].symbol}`, "ghost bid-button", () => submitAction({ type: "call", seat: mySeat, call }));
      btn.innerHTML = `${level}${suitSymbolHtml(suit)}`;
      const ok = legal.some((c) => c.type === "bid" && c.level === level && c.suit === suit);
      btn.disabled = !ok;
      btn.title = ok ? `${seatName(mySeat)} 叫 ${callText(call)}｜${callTeachingText(call)}` : "此叫品目前不合法：必須高於目前最高叫品";
      bidGrid.appendChild(btn);
    }
  }
  wrap.appendChild(bidGrid);
  container.appendChild(wrap);
}


function callTeachingText(call) {
  if (!call || call.type === "pass") return "Pass 表示目前不提高合約；連續三家 Pass 後叫牌結束。";
  if (call.type === "double") return "Double 是賭倍，通常表示想懲罰對手或有特定搭檔約定。";
  if (call.type === "redouble") return "Redouble 是再賭倍，通常表示不怕對手的 Double。";
  if (call.type === "bid") {
    const target = 6 + Number(call.level || 0);
    const suit = call.suit === "NT" ? "無王" : `${SUITS[call.suit]?.symbol || call.suit}${SUITS[call.suit]?.name || ""}`;
    const gameHint = contractBasePoints(call.level, call.suit) >= 100 ? "這是成局級或更高合約。" : "這仍是部分合約或邀請路線。";
    return `${callText(call)} 表示以 ${suit} 為名目，至少要贏 ${target} 墩。${gameHint}`;
  }
  return "叫品說明";
}

function auctionControlStatusText(game, mySeat) {
  const high = highestBid(game.auction || []);
  const turn = game.currentPlayer != null ? `${seatName(game.currentPlayer)}叫牌` : "等待同步";
  const mine = mySeat == null ? "觀戰" : `你是${seatName(mySeat)}`;
  return high ? `${turn}｜目前最高 ${callText(high)} by ${SEATS[high.seat].key}｜${mine}` : `${turn}｜尚未叫牌｜${mine}`;
}

function button(text, cls, fn) { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.addEventListener("click", fn); return b; }
function actionNote(text) { const p = document.createElement("p"); p.className = "action-note"; p.innerHTML = colorizeSuitsHtml(text); return p; }
function renderLog(game) {
  const entries = (game.log || []).slice(-80).reverse();
  $("log").innerHTML = entries.map((line, idx) => `<div class="log-entry"><small>#${entries.length - idx}</small>${colorizeSuitsHtml(line)}</div>`).join("");
}
function renderTips(game, room) {
  const tips = [];
  if (game.mode === "standard") tips.push("標準模式：夢家在首攻翻開後公開，且只有莊家可以指揮夢家出牌。夢家真人玩家不會在夢家輪次看到出牌按鈕。");
  else tips.push("閉手變體：沒有夢家亮牌，四個座位都只能看自己的牌，輪到誰就由該座位自行出牌。");
  if (game.phase === "auction") tips.push("叫牌目標是判斷我方能贏幾墩。1 階要 7 墩，4 階要 10 墩，7 階要 13 墩。NT 最高，其次 ♠、♥、♦、♣。");
  if (["openingLead", "play"].includes(game.phase)) tips.push("出牌時若手上有首引花色，就必須跟該花色。沒有時才可墊牌或用王牌將吃。");
  if (game.phase === "trickPause") tips.push(`本墩四張牌會停留 ${pacingLabel(room?.lobby?.settings)}，方便確認最後一位玩家出了哪張牌。`)
  $("playerTips").innerHTML = tips.map((t) => `<p>${colorizeSuitsHtml(t)}</p>`).join("");
  applyPlayerHintsVisible(getBool(STORAGE.hints, true));
}
function maybeShowResult(game) {
  if (game.phase !== "scoring" || !game.result) return;
  const key = `${game.id}-${JSON.stringify(game.result.scoreDelta)}`;
  if (appState.lastResultKey === key) return;
  appState.lastResultKey = key;
  saveGameResult(game);
  const personal = resultOutcomeForViewer(game, appState.room);
  const contractState = game.result.passedOut ? "四家 Pass" : (game.result.made ? "合約成約" : "合約失敗");
  const title = personal.viewerSeat == null ? contractState : personal.headline;
  $("resultTitle").textContent = title;
  $("resultSubtitle").innerHTML = colorizeSuitsHtml(`${personal.message} ${game.result.summary ? "｜" + game.result.summary : ""}`);
  $("resultStats").innerHTML = [
    [personal.viewerSeat == null ? "本局勝方" : "你的結果", personal.badge],
    ["你的座位", personal.viewerSeat == null ? "觀戰者" : `${seatName(personal.viewerSeat)}｜${personal.viewerTeam}`],
    ["合約", game.contract ? contractText(game.contract, game.declarer) : "Passed out"],
    ["墩數", `NS ${game.tricksWon.NS || 0}｜EW ${game.tricksWon.EW || 0}`],
    ["分數變動", `NS +${game.result.scoreDelta.NS || 0}｜EW +${game.result.scoreDelta.EW || 0}`],
    ["模式", modeLabel(game.mode)],
    ["計分明細", (game.result.detail || []).join("｜") || "無"]
  ].map(([k, v]) => `<div class="result-stat ${k === "計分明細" ? "wide" : ""}"><span>${escapeHtml(k)}</span><b>${colorizeSuitsHtml(v)}</b></div>`).join("");
  $("resultNewDeal").disabled = !(appState.offline || isHost());
  const overlay = $("resultOverlay");
  overlay.classList.remove("hidden", "win", "lose", "draw", "spectator");
  overlay.classList.add(personal.animationClass);
  playSfx(personal.animationClass === "win" ? "success" : personal.animationClass === "lose" ? "fail" : "start");
  if (personal.animationClass === "win") vibrate([60, 40, 90]);
  else if (personal.animationClass === "lose") vibrate([120]);
}

function resultOutcomeForViewer(game, room) {
  const delta = game.result?.scoreDelta || { NS: 0, EW: 0 };
  const ns = Number(delta.NS || 0);
  const ew = Number(delta.EW || 0);
  const winnerTeam = ns === ew ? null : (ns > ew ? "NS" : "EW");
  let viewerSeat = findSeatByUid(room, appState.uid, appState.clientId);
  if (viewerSeat == null && appState.offline && !appState.spectator) viewerSeat = 2;
  const viewerTeam = viewerSeat == null ? null : teamOf(viewerSeat);
  if (!winnerTeam) {
    return { viewerSeat, viewerTeam, winnerTeam, headline: "平手", badge: "平手", message: game.result?.passedOut ? "本副四家 Pass，沒有勝敗。" : "本副雙方分數相同。", animationClass: "draw" };
  }
  if (viewerSeat == null || appState.spectator) {
    return { viewerSeat: null, viewerTeam: null, winnerTeam, headline: `${winnerTeam} 勝利`, badge: `${winnerTeam} 勝利`, message: `觀戰結果：${winnerTeam} 本副得分。`, animationClass: "spectator" };
  }
  const won = viewerTeam === winnerTeam;
  return {
    viewerSeat,
    viewerTeam,
    winnerTeam,
    headline: won ? "勝利！" : "失敗",
    badge: won ? `勝利｜${viewerTeam} 得分` : `失敗｜${winnerTeam} 得分`,
    message: won ? `你是 ${seatName(viewerSeat)}（${viewerTeam}），本副獲勝。` : `你是 ${seatName(viewerSeat)}（${viewerTeam}），本副由 ${winnerTeam} 得分。`,
    animationClass: won ? "win" : "lose"
  };
}
function cardHtml(card, opts = {}) {
  const cls = ["card-face", cardColor(card), opts.small ? "small" : "", opts.playable ? "playable" : "", opts.disabled ? "disabled" : "", opts.selected ? "selected" : "", opts.winning ? "winning-card" : ""].filter(Boolean).join(" ");
  const data = opts.cardId ? ` data-card-id="${escapeHtml(opts.cardId)}" data-seat="${Number(opts.seat)}"` : "";
  const title = opts.winning ? `${card.label}｜目前最大` : card.label;
  return `<div class="${cls}"${data} title="${escapeHtml(title)}"><span class="rank">${escapeHtml(card.rank)}</span><span class="suit ${cardColor(card)}">${SUITS[card.suit].symbol}</span></div>`;
}
function miniCardHtml(card) { return `<span class="mini-card ${cardColor(card)}">${escapeHtml(card.rank)}${suitSymbolHtml(card.suit)}</span>`; }
function cardColor(card) { return SUITS[card.suit]?.color === "red" ? "red" : "black"; }

function currentGame() { return appState.room?.game ? hydrateGameForViewer(appState.room.game, appState.room) : null; }
function seatName(seat) { return `${SEATS[seat]?.name || "?"}家`; }
function nextSeat(seat) { return (Number(seat) + 1) % 4; }
function partnerOf(seat) { return (Number(seat) + 2) % 4; }
function teamOf(seat) { return Number(seat) % 2 === 0 ? "NS" : "EW"; }
function modeLabel(mode) { return mode === "closed" ? "變體模式：四手暗牌" : "標準模式：夢家亮牌"; }
function vulnerabilityLabel(v) { return ({ none: "雙方無身價", ns: "南北有身價", ew: "東西有身價", both: "雙方有身價" })[String(v).toLowerCase()] || "雙方無身價"; }
function vulnerabilitySettingLabel(v) { return v === "cycle" ? "依牌號循環身價" : vulnerabilityLabel(v); }
function callText(call) {
  if (!call || call.type === "pass") return "Pass";
  if (call.type === "double") return "Double";
  if (call.type === "redouble") return "Redouble";
  return `${call.level}${SUITS[call.suit]?.symbol || call.suit}`;
}
function contractText(contract, declarer) {
  if (!contract) return "尚未叫牌";
  const dbl = contract.doubled === 2 ? "XX" : contract.doubled === 1 ? "X" : "";
  return `${contract.level}${SUITS[contract.suit].symbol}${dbl}${declarer != null ? ` by ${SEATS[declarer].key}` : ""}`;
}
function auctionSummary(auction = []) { return auction.length ? auction.slice(-8).map((c) => `${SEATS[c.seat].key}:${callText(c)}`).join("　") : "尚未叫牌"; }
function auctionSummaryHtml(auction = []) { return auction.length ? auction.slice(-8).map((c) => `${escapeHtml(SEATS[c.seat].key)}:${callTextHtml(c)}`).join("　") : "尚未叫牌"; }
function structuredCloneCompat(obj) { return typeof structuredClone === "function" ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function suitColorClass(suit) { return SUITS[suit]?.color === "red" ? "red" : "black"; }
function suitSymbolHtml(suit) {
  const meta = SUITS[suit];
  if (!meta) return escapeHtml(suit || "");
  return `<span class="suit-symbol ${suitColorClass(suit)}">${escapeHtml(meta.symbol)}</span>`;
}
function colorizeSuitsHtml(value) {
  return escapeHtml(value).replace(/[♥♦♠♣]/g, (symbol) => `<span class="suit-symbol ${symbol === "♥" || symbol === "♦" ? "red" : "black"}">${symbol}</span>`);
}

async function leaveRoom(silent = false) {
  clearTimeout(appState.botTimer);
  clearTimeout(appState.trickPauseTimer);
  if (!silent) await markOwnSeatOffline();
  stopPresenceHeartbeat();
  if (appState.roomUnsub) appState.roomUnsub();
  stopPrivateHandsSubscription();
  appState.privateHands = {};
  appState.roomUnsub = null;
  appState.room = null;
  appState.roomCode = null;
  appState.offline = false;
  appState.spectator = false;
  appState.testMode = false;
  appState.testViewSeat = null;
  localStorage.removeItem(STORAGE.testViewSeat);
  appState.uid = appState.firebaseUid || appState.localUid;
  clearRoomUrlParam();
  $("connectView").classList.remove("hidden");
  $("lobbyView").classList.add("hidden");
  $("gameView").classList.add("hidden");
  $("btnLeave").classList.add("hidden");
  $("resultOverlay").classList.add("hidden");
  if (!silent) toast("已離開房間");
}
function updateRoomUrl(code = appState.roomCode) {
  if (!code || code === "OFFLINE") return;
  try {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", normalizeRoomCode(code));
    history.replaceState(null, "", url.toString());
  } catch (error) {
    console.warn("無法更新房間網址", error);
  }
}
function clearRoomUrlParam() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("room") || url.searchParams.has("r") || url.searchParams.has("code")) {
      url.searchParams.delete("room");
      url.searchParams.delete("r");
      url.searchParams.delete("code");
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch (error) {
    console.warn("無法清除房間網址", error);
  }
}
function buildInviteLink(code = appState.roomCode) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", normalizeRoomCode(code));
  return url.toString();
}
function buildQrCodeUrl(url) { return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=${encodeURIComponent(url)}`; }
async function copyInviteLink() { await copyText(buildInviteLink()); toast("已複製邀請連結"); }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { window.prompt("請手動複製", text); }
}

function saveGameResult(game) {
  const stats = loadStats();
  stats.games += 1;
  stats.modes[game.mode] = (stats.modes[game.mode] || 0) + 1;
  stats.nsScore += game.result?.scoreDelta?.NS || 0;
  stats.ewScore += game.result?.scoreDelta?.EW || 0;
  if (game.result?.made) stats.made += 1;
  else if (!game.result?.passedOut) stats.down += 1;
  stats.last = { at: Date.now(), summary: game.result?.summary, mode: game.mode };
  localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
  renderLocalStatsSummary();
}
function loadStats() {
  try { return { games: 0, made: 0, down: 0, nsScore: 0, ewScore: 0, modes: {}, ...JSON.parse(localStorage.getItem(STORAGE.stats) || "{}") }; }
  catch { return { games: 0, made: 0, down: 0, nsScore: 0, ewScore: 0, modes: {} }; }
}
function renderLocalStatsSummary() {
  const s = loadStats();
  $("localStatsSummary").innerHTML = `已完成 <b>${s.games}</b> 副｜成約 ${s.made}｜倒約 ${s.down}｜NS 累計 ${s.nsScore}｜EW 累計 ${s.ewScore}`;
  $("achievementSummary").textContent = s.games >= 10 ? "成就：橋牌熟手，已完成 10 副以上。" : "成就：完成 10 副可解鎖橋牌熟手。";
}
async function shareLocalStats() { const s = loadStats(); await copyText(`我的合約橋牌戰績：完成 ${s.games} 副，成約 ${s.made}，倒約 ${s.down}，NS ${s.nsScore} / EW ${s.ewScore}`); toast("已複製戰績"); }
async function shareAchievements() { await copyText($("achievementSummary").textContent || "我正在玩合約橋牌網頁版！"); toast("已複製成就"); }
function collectLocalData() {
  return { build: BUILD, exportedAt: new Date().toISOString(), settings: Object.fromEntries(Object.values(STORAGE).map((key) => [key, localStorage.getItem(key)])) };
}
async function exportLocalData() { await copyText(JSON.stringify(collectLocalData(), null, 2)); toast("已複製本機資料 JSON"); }
function restoreLocalDataFromDialog() {
  try {
    const data = JSON.parse($("importDataText").value || "{}");
    for (const [key, value] of Object.entries(data.settings || {})) if (value != null) localStorage.setItem(key, value);
    toast("資料已還原，將重新整理");
    setTimeout(() => location.reload(), 500);
  } catch { toast("JSON 格式不正確"); }
}
function buildDetailedErrorReport() {
  const game = currentGame();
  const health = game ? inspectGameHealth(game, appState.room) : null;
  const safeRoom = structuredCloneCompat(appState.room || {});
  if (safeRoom.game) safeRoom.game = publicGameFromFull(currentGame() || safeRoom.game);
  return {
    build: BUILD,
    time: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    roomCode: appState.roomCode,
    connected: appState.connected,
    offline: appState.offline,
    spectator: appState.spectator,
    mySeat: appState.room ? findSeatByUid(appState.room, appState.uid, appState.clientId) : null,
    status: appState.room?.meta?.status,
    phase: game?.phase,
    currentPlayer: game?.currentPlayer,
    contract: game?.contract ? contractText(game.contract, game.declarer) : null,
    auction: listFromFirebase(game?.auction).map((c) => `${SEATS[c.seat]?.key || "?"}:${callText(c)}`),
    currentTrick: listFromFirebase(game?.currentTrick).map((p) => `${SEATS[p.seat]?.key || "?"}:${p.card?.label}`),
    handCounts: game?.handCounts,
    lastLog: listFromFirebase(game?.log).slice(-30),
    actionAudit: appState.room?.actionAudit || null,
    pendingActions: Object.fromEntries(Object.entries(appState.room?.actions || {}).slice(-20)),
    processedActions: game?.processedActions || null,
    firebaseDiagnostic: firebaseDiagnosticSnapshot(),
    syncDiagnostics: collectSyncDiagnostics(appState.room),
    stuckDetection: detectStuckState(appState.room),
    match: appState.room?.match || null,
    health,
    publicRoom: safeRoom
  };
}
function firebaseDiagnosticSnapshot() {
  const room = appState.room;
  const host = hostSeat(room);
  const now = Date.now();
  return {
    connected: appState.connected,
    isHost: isHost(),
    hostUid: room?.meta?.hostUid || null,
    hostSeat: host,
    hostOnline: host == null ? false : isSeatOnline(room?.lobby?.seats?.[host], now),
    myUidShort: appState.uid ? String(appState.uid).slice(0, 12) : null,
    mySeat: room ? findSeatByUid(room, appState.uid, appState.clientId) : null,
    pendingActionCount: Object.keys(room?.actions || {}).length,
    rejectedActionCount: Object.values(room?.actionAudit || {}).filter((x) => x && x.ok === false).length,
    lastHostTransferAt: room?.meta?.hostTransferredAt || null,
    arbiterUid: room?.meta?.arbiterUid || null,
    hostTransferLog: listFromFirebase(room?.meta?.hostTransferLog),
    chicagoTargetBoards: chicagoBoardCount(room?.match?.mode || room?.lobby?.settings?.scoringMode),
    schemaVersion: room?.meta?.schemaVersion || null,
    roomBuild: room?.meta?.appBuild || null
  };
}
async function copyDetailedErrorReport() {
  await copyText(JSON.stringify(buildDetailedErrorReport(), null, 2));
  toast("已複製詳細錯誤回報");
}
function downloadErrorSnapshot() {
  const report = buildDetailedErrorReport();
  downloadTextFile(`bridge-error-${report.roomCode || "local"}-${Date.now()}.json`, JSON.stringify(report, null, 2));
  toast("已下載 JSON 狀態快照");
}
async function copyErrorReport() { return copyDetailedErrorReport(); }
async function copySupportBundle() { await copyText(JSON.stringify({ report: collectLocalData(), errorReport: buildDetailedErrorReport(), build: BUILD }, null, 2)); toast("已複製維護包"); }
function resetLocalData() { if (confirm("確定要重置本機資料？")) { Object.values(STORAGE).forEach((k) => localStorage.removeItem(k)); location.reload(); } }

function runDiagnostics() {
  const items = [
    ["版本", true, BUILD],
    ["Service Worker", "serviceWorker" in navigator, "serviceWorker" in navigator ? "支援" : "不支援"],
    ["Clipboard", Boolean(navigator.clipboard), Boolean(navigator.clipboard) ? "支援" : "不支援"],
    ["Firebase", appState.connected, appState.connected ? "已連線" : "尚未連線"],
    ["Firebase 房主", true, appState.room ? (isHost() ? "你是房主 / 仲裁者" : `房主座位 ${hostSeat(appState.room) == null ? "未知" : seatName(hostSeat(appState.room))}`) : "尚未加入房間"],
    ["待處理動作", true, `${Object.keys(appState.room?.actions || {}).length} 筆`],
    ["目前模式", true, appState.room?.game ? modeLabel(appState.room.game.mode) : "尚未開局"]
  ];
  $("diagnosticStatus").innerHTML = items.map(([k, ok, v]) => `${ok ? "✅" : "⚠️"} ${k}：${v}`).join("<br>");
  toast("系統測試完成");
}
async function runAiHealthCheck() {
  const rounds = Number($("aiTestRounds").value || 4);
  const status = $("aiTestStatus");
  let ok = 0;
  let failures = 0;
  for (let i = 0; i < rounds; i++) {
    try {
      const room = {
        lobby: {
          dealer: i % 4,
          boardNo: i + 1,
          settings: { mode: i % 2 ? "closed" : "standard", vulnerability: "cycle", difficulty: 12, showAiThoughts: false },
          seats: { 0: makeSeat(0, "b0", "AI-N", "bot"), 1: makeSeat(1, "b1", "AI-E", "bot"), 2: makeSeat(2, "b2", "AI-S", "bot"), 3: makeSeat(3, "b3", "AI-W", "bot") }
        }
      };
      const game = createNewGame(room);
      let guard = 0;
      while (game.phase !== "scoring" && guard++ < 300) {
        if (game.phase === "trickPause") {
          finishPendingTrick(game, true);
          continue;
        }
        const controller = controllingSeatForCurrentAction(game);
        const action = chooseBotAction(game, controller, room.lobby);
        if (!action) throw new Error("AI 沒有可執行動作");
        const res = applyAction(game, { ...action, uid: `b${controller}`, actorSeat: controller, createdAt: Date.now() }, room.lobby);
        if (!res.ok) throw new Error(res.message);
      }
      if (game.phase !== "scoring") throw new Error("未能結束");
      ok++;
    } catch (e) {
      console.error(e);
      failures++;
    }
  }
  status.textContent = `AI 測試完成：${ok}/${rounds} 局正常，失敗 ${failures}。`;
}

function renderReleaseChecklist() {
  const saved = JSON.parse(localStorage.getItem(STORAGE.checklist) || "{}");
  const items = ["單人標準模式可完成一副", "單人閉手變體可完成一副", "Firebase 可建立房間", "4 個真人或電腦可入座", "QR Code / 邀請連結可加入", "夢家在標準模式首攻後才亮牌", "閉手模式同伴牌不亮", "回放與統計正常", "PWA 快取更新正常"];
  $("releaseChecklistBody").innerHTML = items.map((text, idx) => `<label class="checklist-item"><input type="checkbox" data-checklist="${idx}" ${saved[idx] ? "checked" : ""}> ${escapeHtml(text)}</label>`).join("");
  document.querySelectorAll("[data-checklist]").forEach((el) => el.addEventListener("change", () => {
    const next = {};
    document.querySelectorAll("[data-checklist]").forEach((box) => { next[box.dataset.checklist] = box.checked; });
    localStorage.setItem(STORAGE.checklist, JSON.stringify(next));
  }));
}
async function copyReleaseChecklistResult() { await copyText($("releaseChecklistBody").innerText); toast("已複製測試清單"); }
function resetReleaseChecklist() { localStorage.removeItem(STORAGE.checklist); renderReleaseChecklist(); }
function openPublicStatusDialog() {
  const rows = [
    ["版本", BUILD],
    ["網址", location.href],
    ["Firebase", appState.connected ? "已連線" : "未連線"],
    ["PWA", "serviceWorker" in navigator ? "支援" : "不支援"],
    ["模式", "標準夢家＋閉手變體"]
  ];
  $("publicStatusBody").innerHTML = rows.map(([k, v]) => `<div class="status-item"><b>${escapeHtml(k)}</b><p>${escapeHtml(v)}</p></div>`).join("");
  $("publicStatusDialog").showModal();
}
async function copyPublicStatusReport() { await copyText($("publicStatusBody").innerText); toast("已複製狀態報告"); }
async function copyPublicGameLink() { await copyText(`${location.origin}${location.pathname}`); toast("已複製公開網址"); }
async function copyPublicIntroText() {
  await copyText(`合約橋牌網頁版：支援標準夢家亮牌、閉手四人暗牌變體、單人離線與 Firebase 4 人開房間。${location.origin}${location.pathname}`);
  toast("已複製介紹文");
}
function openShareKitDialog() {
  const url = `${location.origin}${location.pathname}`;
  $("shareKitShort").value = `一起玩合約橋牌：${url}`;
  $("shareKitLong").value = `合約橋牌網頁版\n・標準模式：首攻後夢家亮牌，莊家指揮夢家\n・變體模式：取消夢家，四手暗牌各自出牌\n・支援單人離線、Firebase 開房間、4 位真人、電腦補位與回放\n${url}`;
  $("shareKitFox").value = `<a href="${url}">合約橋牌｜標準夢家・閉手變體・多人房間</a>`;
  $("shareKitDialog").showModal();
}
async function copyShareKitText(kind) { await copyText($(`shareKit${kind === "short" ? "Short" : kind === "long" ? "Long" : "Fox"}`).value); toast("已複製分享素材"); }
async function copyRoomMaintenanceSummary() {
  const room = appState.room;
  await copyText(JSON.stringify({ code: room?.meta?.code, status: room?.meta?.status, seats: room?.lobby?.seats, settings: room?.lobby?.settings }, null, 2));
  toast("已複製房間維護摘要");
}

function handRecordText(game = currentGame(), room = appState.room) {
  if (!game) return "尚未有牌局。";
  normalizeGame(game);
  const lines = [];
  lines.push(`合約橋牌牌譜｜${BUILD}`);
  lines.push(`房間：${room?.meta?.code || (appState.offline ? "OFFLINE" : "未知")}`);
  lines.push(`第 ${game.boardNo} 副｜發牌：${SEATS[game.dealer]?.key || "?"} ${seatName(game.dealer)}｜身價：${vulnerabilityLabel(game.vulnerability)}｜模式：${modeLabel(game.mode)}`);
  lines.push(`合約：${game.contract ? contractText(game.contract, game.declarer) : "Passed out / 尚未成立"}`);
  if (game.contract) lines.push(`莊家：${SEATS[game.declarer].key} ${seatName(game.declarer)}｜${game.mode === "standard" ? "夢家" : "同伴"}：${SEATS[game.dummy].key} ${seatName(game.dummy)}｜目標：${6 + game.contract.level} 墩`);
  lines.push(`墩數：NS ${game.tricksWon?.NS || 0}｜EW ${game.tricksWon?.EW || 0}`);
  if (game.result?.summary) lines.push(`結果：${game.result.summary}`);
  lines.push("");
  lines.push("四家原始手牌：");
  for (const seat of [0, 1, 2, 3]) {
    const original = originalHand(game, seat);
    lines.push(`${SEATS[seat].key} ${seatName(seat)}：${original.length ? handBySuitText(original) : "未公開 / 無權限讀取"}${original.length ? `（${handHcp(original)} HCP）` : ""}`);
  }
  lines.push("");
  lines.push("叫牌：");
  const auction = listFromFirebase(game.auction);
  lines.push(auction.length ? auction.map((c) => `${SEATS[c.seat]?.key || "?"}:${callText(c)}`).join("  ") : "尚未叫牌");
  lines.push("");
  lines.push("出牌：");
  const tricks = listFromFirebase(game.trickHistory);
  if (!tricks.length && game.currentTrick?.length) lines.push(`進行中：${game.currentTrick.map((p) => `${SEATS[p.seat].key} ${p.card.label}`).join("  ")}`);
  for (const trick of tricks) {
    const plays = listFromFirebase(trick.plays).map((p) => `${SEATS[p.seat].key} ${p.card.label}`).join("  ");
    lines.push(`${String(trick.no).padStart(2, "0")}. ${plays}  ｜贏家 ${SEATS[trick.winner]?.key || "?"} ${trick.team || ""}`);
  }
  return lines.join("\n");
}

function originalHand(game, seat) {
  const initial = game?.initialHands?.[seat] || [];
  if (initial.length) return initial;
  const current = game?.hands?.[seat] || [];
  const played = [];
  for (const trick of listFromFirebase(game?.trickHistory || [])) {
    for (const play of listFromFirebase(trick.plays)) if (Number(play.seat) === Number(seat) && play.card) played.push(play.card);
  }
  for (const play of listFromFirebase(game?.currentTrick || [])) if (Number(play.seat) === Number(seat) && play.card) played.push(play.card);
  if (game?.pendingTrick) for (const play of listFromFirebase(game.pendingTrick.plays)) if (Number(play.seat) === Number(seat) && play.card) played.push(play.card);
  return sortHand([...current, ...played]);
}

function handBySuitText(hand) {
  const bySuit = { S: [], H: [], D: [], C: [] };
  for (const card of sortHand([...hand])) bySuit[card.suit]?.push(card.rank);
  return ["S", "H", "D", "C"].map((suit) => `${SUITS[suit].symbol}${bySuit[suit].join("") || "—"}`).join(" ");
}
async function copyCurrentHandRecord() {
  await copyText(handRecordText(currentGame(), appState.room));
  toast("已複製完整牌譜");
}
function openReplayDialog(game) {
  if (!game) return;
  normalizeGame(game);
  appState.replay = { game: structuredCloneCompat(game), steps: buildReplaySteps(game), index: 0 };
  $("replaySummary").innerHTML = colorizeSuitsHtml(game.result?.summary || `${game.contract ? contractText(game.contract, game.declarer) : "尚未成立合約"}｜${modeLabel(game.mode)}`);
  renderReplayControls();
  renderReplayStep();
  $("replayDialog").showModal();
}
function buildReplaySteps(game) {
  const steps = [{ index: 0, title: "起手 / 叫牌後", subtitle: "尚未出牌", plays: [], currentTrick: [], winner: null }];
  const ordered = [];
  for (const trick of listFromFirebase(game.trickHistory)) {
    const plays = listFromFirebase(trick.plays);
    plays.forEach((play, playIndex) => ordered.push({ trickNo: trick.no, play, playIndex, winner: trick.winner, team: trick.team, trickPlays: plays }));
  }
  if (game.pendingTrick?.plays) {
    const plays = listFromFirebase(game.pendingTrick.plays);
    plays.forEach((play, playIndex) => ordered.push({ trickNo: game.pendingTrick.no || (game.trickHistory?.length || 0) + 1, play, playIndex, winner: game.pendingTrick.winner, team: game.pendingTrick.team, trickPlays: plays, pending: true }));
  } else if (game.currentTrick?.length) {
    const plays = listFromFirebase(game.currentTrick);
    plays.forEach((play, playIndex) => ordered.push({ trickNo: (game.trickHistory?.length || 0) + 1, play, playIndex, winner: null, team: null, trickPlays: plays, live: true }));
  }
  const seen = [];
  ordered.forEach((item, idx) => {
    seen.push(item.play);
    const currentTrick = seen.filter((p) => {
      const start = Math.max(0, seen.length - ((item.playIndex || 0) + 1));
      return seen.indexOf(p) >= start;
    });
    const title = `第 ${item.trickNo} 墩｜第 ${item.playIndex + 1} 張：${seatName(item.play.seat)} 出 ${item.play.card.label}`;
    const subtitle = item.winner != null && item.playIndex === 3 ? `${seatName(item.winner)} 贏得本墩（${item.team}）` : `本墩進行中 ${item.playIndex + 1}/4`;
    steps.push({ index: idx + 1, title, subtitle, plays: [...seen], currentTrick, winner: item.winner, team: item.team, trickNo: item.trickNo });
  });
  return steps;
}
function renderReplayControls() {
  const select = $("replayStepSelect");
  const replay = appState.replay || { steps: [], index: 0 };
  if (select) {
    select.innerHTML = replay.steps.map((step, idx) => `<option value="${idx}">${idx + 1}. ${escapeHtml(step.title)}</option>`).join("");
    select.value = String(replay.index || 0);
  }
  const prev = $("btnReplayPrev");
  const next = $("btnReplayNext");
  if (prev) prev.disabled = replay.index <= 0;
  if (next) next.disabled = replay.index >= replay.steps.length - 1;
}
function setReplayStep(index) {
  const replay = appState.replay;
  if (!replay?.steps?.length) return;
  replay.index = Math.max(0, Math.min(replay.steps.length - 1, Number(index) || 0));
  renderReplayControls();
  renderReplayStep();
}
function moveReplayStep(delta) { setReplayStep((appState.replay?.index || 0) + Number(delta || 0)); }
function autoPlayReplay() {
  const replay = appState.replay;
  if (!replay?.steps?.length) return;
  if (replay._timer) {
    clearInterval(replay._timer);
    replay._timer = null;
    $("btnReplayPlay").textContent = "自動播放";
    return;
  }
  $("btnReplayPlay").textContent = "停止播放";
  replay._timer = setInterval(() => {
    if ((appState.replay.index || 0) >= appState.replay.steps.length - 1) {
      clearInterval(appState.replay._timer);
      appState.replay._timer = null;
      $("btnReplayPlay").textContent = "自動播放";
      return;
    }
    moveReplayStep(1);
  }, 900);
}
function renderReplayStep() {
  const replay = appState.replay;
  const game = replay?.game;
  const step = replay?.steps?.[replay.index || 0];
  if (!game || !step) return;
  const playedIds = new Set(step.plays.map((p) => p.card?.id).filter(Boolean));
  const remainingBySeat = [0, 1, 2, 3].map((seat) => originalHand(game, seat).filter((card) => !playedIds.has(card.id)));
  const currentWinner = currentWinningPlay(step.currentTrick || [], game.contract?.suit);
  const table = [0, 1, 2, 3].map((seat) => {
    const play = (step.currentTrick || []).find((p) => Number(p.seat) === seat);
    const win = play && currentWinner && currentWinner.seat === play.seat && currentWinner.card?.id === play.card?.id;
    return `<div class="replay-step-card"><b>${SEATS[seat].key} ${seatName(seat)}</b>${play ? cardHtml(play.card, { winning: win }) : `<span class="hint compact">尚未出牌</span>`}</div>`;
  }).join("");
  const hands = [0, 1, 2, 3].map((seat) => `<div class="replay-hand"><b>${SEATS[seat].key} ${seatName(seat)}｜${remainingBySeat[seat].length} 張</b><br>${colorizeSuitsHtml(handBySuitText(remainingBySeat[seat]))}</div>`).join("");
  $("replayStepView").innerHTML = `
    <h3>${escapeHtml(step.title)}</h3>
    <p class="hint compact">${colorizeSuitsHtml(step.subtitle)}${currentWinner ? `｜目前最大：${seatName(currentWinner.seat)} ${cardTextHtml(currentWinner.card)}` : ""}</p>
    <div class="replay-step-grid">${table}</div>
    <h3>當時剩餘手牌</h3>
    <div class="replay-hand-grid">${hands}</div>
  `;
  const tricks = listFromFirebase(game.trickHistory);
  $("replayList").innerHTML = [
    `<div class="replay-item"><b>完整出牌清單</b><div class="plays"><span>${modeLabel(game.mode)}</span><span>${vulnerabilityLabel(game.vulnerability)}</span><span>${colorizeSuitsHtml(game.contract ? contractText(game.contract, game.declarer) : "尚未成立")}</span></div></div>`,
    ...(tricks.length ? tricks.map((trick) => `
      <div class="replay-item">
        <b>第 ${trick.no} 墩：${seatName(trick.winner)} 贏得（${trick.team}）</b>
        <div class="plays">${listFromFirebase(trick.plays).map((p) => `<span>${seatName(p.seat)} ${cardTextHtml(p.card)}</span>`).join("｜")}</div>
      </div>
    `) : [`<div class="replay-item">沒有完成的墩紀錄。</div>`])
  ].join("");
}
async function shareReplay() { await copyText($("replaySummary").textContent + "\n" + $("replayList").innerText); toast("已複製回放摘要"); }

function playSfx(kind) {
  if (!getBool(STORAGE.sound, false)) return;
  try {
    appState.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = appState.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const profile = loadSetting(STORAGE.soundProfile, "soft");
    const base = kind === "success" ? 660 : kind === "fail" ? 180 : kind === "start" ? 440 : 300;
    osc.frequency.value = profile === "arcade" ? base * 1.35 : profile === "classic" ? base : base * .8;
    gain.gain.value = .04;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .12);
    osc.stop(ctx.currentTime + .13);
  } catch {}
}
function vibrate(pattern) { if (getBool(STORAGE.vibration, false) && navigator.vibrate) navigator.vibrate(pattern); }
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add("hidden"), 2200);
}
async function clearPwaCachesAndReload() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  toast("已清除快取，準備重新整理");
  setTimeout(() => location.reload(), 800);
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=1.0.24.10", { updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
      if (registration.waiting && navigator.serviceWorker.controller) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
        });
      });
    }).catch((error) => console.warn("Service worker registration failed", error));
  });
}
function showUpdateBanner(worker) { appState.updateWorker = worker; $("updateBanner").classList.remove("hidden"); }
function reloadForUpdate() { if (appState.updateWorker) appState.updateWorker.postMessage({ type: "SKIP_WAITING" }); else location.reload(); }

registerServiceWorker();
init();
