// Firebase 로그인·컨펌 저장. 개발자는 GitHub 로그인(3명 허용), 기획자는 토큰 없이 익명 로그인.
// 실제 권한은 firestore.rules가 강제한다. 여기 허용 목록은 화면용이다.
const DEVELOPERS = { 192939184: 'KateteDeveloper', 162878426: 'joobogyeong', 163312948: 'eun-seoo' };

const Auth = (() => {
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = Boolean(cfg.apiKey && cfg.projectId && window.firebase);
  let auth, db;
  const store = {
    get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
  };

  if (configured) {
    firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
  }

  // 로그인된 사용자를 { role, name } 으로 바꾼다. 허용되지 않은 계정이면 null.
  function toSession(user) {
    if (!user) return null;
    if (user.isAnonymous) return { role: 'planner', name: store.get('plannerName') || '기획자' };
    const gh = user.providerData.find((p) => p.providerId === 'github.com');
    const login = gh && DEVELOPERS[gh.uid];
    return login ? { role: 'developer', name: login } : null;
  }

  return {
    configured,
    // 세션이 바뀔 때마다 콜백(null이면 로그아웃)
    watch(cb) {
      auth.onAuthStateChanged(async (user) => {
        const session = toSession(user);
        if (user && !session) { await auth.signOut(); return cb(null, '허용된 개발자 계정이 아닙니다. 기획자로 입장하세요.'); }
        cb(session);
      });
    },
    async loginDeveloper() { await auth.signInWithPopup(new firebase.auth.GithubAuthProvider()); },
    async loginPlanner(name) { store.set('plannerName', name.trim().slice(0, 30)); await auth.signInAnonymously(); },
    logout: () => auth.signOut(),

    async loadSpecs() {
      const snap = await db.collection('specs').get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), at: d.data().at?.toMillis?.() ?? 0 })).sort((a, b) => a.at - b.at);
    },
    uploadSpec(id, session, title, body, prdRef) {
      return db.collection('specs').doc(id).set({
        title, body, prdRef, by: session.name, at: firebase.firestore.FieldValue.serverTimestamp(),
      });
    },
    async loadApprovals() {
      const snap = await db.collection('approvals').get();
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    },
    decide(number, session, status, comment, specHash) {
      return db.collection('approvals').doc(String(number)).set({
        status, by: session.name, role: session.role, comment: comment.slice(0, 500), specHash,
        at: firebase.firestore.FieldValue.serverTimestamp(),
      });
    },
    reset: (number) => db.collection('approvals').doc(String(number)).delete(),
  };
})();
