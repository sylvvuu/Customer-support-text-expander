// 내 문장 모음 · 팝업
// 저장한 문장을 모음별로 보여 주고, 복사·삭제와 모음 관리를 처리합니다.

const MAX_COLS = 8;
const NONE = 'none';
const DEFAULT_COLS = [
  { key: 'ship', label: '배송 안내' },
  { key: 'coupon', label: '쿠폰 안내' },
  { key: 'return', label: '교환·반품 안내' },
  { key: NONE, label: '미분류' }
];

// 배포 정보. 문의 이메일은 실제 주소로 바꿔 주세요.
const INFO = {
  developer: '이은정',
  contact: '[이메일 주소 입력 필요]',
  built: '2026-11-19'
};

let items = [];
let cols = DEFAULT_COLS.slice();
let copiedId = null;
let pending = null;
let toastTimer = null;
let editingKey = null;

const $ = (id) => document.getElementById(id);
const listEl = $('list');
const emptyEl = $('empty');
const countEl = $('count');
const footEl = $('foot');
const toastEl = $('toast');
const confirmEl = $('confirm');
const dTitle = $('dTitle');
const dSub = $('dSub');
const dOk = $('dOk');
const dCancel = $('dCancel');
const listView = $('listView');
const manageView = $('manageView');
const colListEl = $('colList');
const newNameEl = $('newName');
const mgrErrEl = $('mgrErr');

function labelOf(key) {
  const c = cols.find((x) => x.key === key);
  return c ? c.label : '미분류';
}

function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.className = 'toast' + (isError ? ' error' : '');
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2500);
}

function askConfirm(title, sub, run) {
  pending = run;
  dTitle.textContent = title;
  dSub.textContent = sub;
  confirmEl.hidden = false;
  dCancel.focus();
}

function closeConfirm() {
  pending = null;
  confirmEl.hidden = true;
}

async function persistItems() {
  await chrome.storage.local.set({ items });
}

async function persistCols() {
  await chrome.storage.local.set({ cols });
}

function sourceOf(url) {
  if (!url) return '기본 문장';
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (e) {
    return url;
  }
}

function copyItem(it) {
  copiedId = it.id;
  render();
  navigator.clipboard.writeText(it.text).then(
    () => showToast('복사됐습니다'),
    () => showToast('복사에 실패했어요. 문장을 직접 선택해 복사해 주세요', true)
  );
}

function deleteItem(id) {
  askConfirm('정말 삭제하시겠습니까?', '삭제한 문장은 되돌릴 수 없어요.', async () => {
    items = items.filter((x) => x.id !== id);
    if (copiedId === id) copiedId = null;
    await persistItems();
    render();
    showToast('문장을 삭제했어요');
  });
}

function deleteAll() {
  askConfirm('모든 문장을 삭제하시겠습니까?', `저장한 문장 ${items.length}개가 모두 삭제되며 되돌릴 수 없어요.`, async () => {
    items = [];
    copiedId = null;
    await persistItems();
    render();
    showToast('모든 문장을 삭제했어요');
  });
}

function makeCard(it) {
  const li = document.createElement('li');
  li.className = 'row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card' + (it.id === copiedId ? ' copied' : '');

  const top = document.createElement('span');
  top.className = 'top';
  const src = document.createElement('span');
  src.className = 'src';
  src.textContent = sourceOf(it.url);
  top.appendChild(src);
  if (it.id === copiedId) {
    const flag = document.createElement('span');
    flag.className = 'flag';
    flag.textContent = '복사됨';
    top.appendChild(flag);
  }

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = it.text;

  btn.appendChild(top);
  btn.appendChild(text);
  if (it.date) {
    const sub = document.createElement('span');
    sub.className = 'sub2';
    sub.textContent = it.date;
    btn.appendChild(sub);
  }
  btn.setAttribute('aria-label', '복사: ' + it.text);
  btn.addEventListener('click', () => copyItem(it));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.textContent = '삭제';
  del.setAttribute('aria-label', '삭제: ' + it.text);
  del.addEventListener('click', () => deleteItem(it.id));

  li.appendChild(btn);
  li.appendChild(del);
  return li;
}

function render() {
  listEl.innerHTML = '';
  cols.forEach((c) => {
    const group = items.filter((it) => it.cat === c.key);
    if (group.length === 0) return;
    const head = document.createElement('li');
    head.className = 'group';
    const name = document.createElement('span');
    name.textContent = c.label;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = group.length + '개';
    head.appendChild(name);
    head.appendChild(n);
    listEl.appendChild(head);
    group.forEach((it) => listEl.appendChild(makeCard(it)));
  });
  countEl.textContent = `${items.length}개 저장됨`;
  emptyEl.hidden = items.length > 0;
  listEl.hidden = items.length === 0;
  footEl.hidden = items.length === 0;
  if (!manageView.hidden) renderManage();
}

// ---------- 모음 관리 ----------

function validName(name, exceptKey) {
  const n = name.trim();
  if (!n) return '모음 이름을 입력해 주세요.';
  if (n.length > 10) return '모음 이름은 10자 이내로 입력해 주세요.';
  if (cols.some((c) => c.label === n && c.key !== exceptKey)) return '같은 이름의 모음이 이미 있어요.';
  return '';
}

async function addCol() {
  let msg = validName(newNameEl.value, null);
  if (!msg && cols.length >= MAX_COLS) msg = `모음은 최대 ${MAX_COLS}개까지 만들 수 있어요.`;
  mgrErrEl.textContent = msg;
  if (msg) return;
  const label = newNameEl.value.trim();
  // 미분류 바로 앞에 새 모음을 넣습니다.
  cols.splice(cols.length - 1, 0, { key: 'c' + Date.now(), label });
  newNameEl.value = '';
  await persistCols();
  render();
  showToast('모음을 추가했어요');
}

async function renameCol(key, name) {
  const msg = validName(name, key);
  mgrErrEl.textContent = msg;
  if (msg) return;
  cols = cols.map((c) => (c.key === key ? { key: c.key, label: name.trim() } : c));
  editingKey = null;
  await persistCols();
  render();
  showToast('모음 이름을 바꿨어요');
}

function deleteCol(key) {
  if (key === NONE) {
    showToast('미분류는 삭제할 수 없어요', true);
    return;
  }
  const c = cols.find((x) => x.key === key);
  const n = items.filter((it) => it.cat === key).length;
  const sub = n > 0
    ? `'${c.label}' 안의 문장 ${n}개는 미분류로 옮겨집니다. 모음은 되돌릴 수 없어요.`
    : `'${c.label}' 모음은 되돌릴 수 없어요.`;
  askConfirm('모음을 삭제하시겠습니까?', sub, async () => {
    items = items.map((it) => (it.cat === key ? Object.assign({}, it, { cat: NONE }) : it));
    cols = cols.filter((x) => x.key !== key);
    editingKey = null;
    await persistItems();
    await persistCols();
    render();
    showToast('모음을 삭제했어요');
  });
}

function renderManage() {
  colListEl.innerHTML = '';
  cols.forEach((c) => {
    const wrap = document.createElement('div');
    wrap.className = 'colitem';
    const n = items.filter((it) => it.cat === c.key).length;

    if (editingKey === c.key) {
      const rn = document.createElement('div');
      rn.className = 'rename';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 10;
      input.value = c.label;
      input.setAttribute('aria-label', '새 모음 이름');
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'smallbtn';
      ok.textContent = '저장';
      ok.addEventListener('click', () => renameCol(c.key, input.value));
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'smallbtn ghost';
      cancel.textContent = '취소';
      cancel.addEventListener('click', () => { editingKey = null; mgrErrEl.textContent = ''; render(); });
      rn.appendChild(input);
      rn.appendChild(ok);
      rn.appendChild(cancel);
      wrap.appendChild(rn);
    } else {
      const line = document.createElement('div');
      line.className = 'colline';
      const left = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'colname';
      name.textContent = c.label;
      const cnt = document.createElement('span');
      cnt.className = 'colcount';
      cnt.textContent = n + '개';
      left.appendChild(name);
      left.appendChild(cnt);
      const acts = document.createElement('span');
      acts.className = 'colactions';
      if (c.key !== NONE) {
        const ren = document.createElement('button');
        ren.type = 'button';
        ren.className = 'linkbtn';
        ren.textContent = '이름 변경';
        ren.addEventListener('click', () => { editingKey = c.key; mgrErrEl.textContent = ''; render(); });
        acts.appendChild(ren);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'linkbtn danger';
      del.textContent = c.key === NONE ? '기본 모음' : '삭제';
      del.setAttribute('aria-label', c.label + ' 삭제');
      del.addEventListener('click', () => { if (c.key !== NONE) deleteCol(c.key); });
      acts.appendChild(del);
      line.appendChild(left);
      line.appendChild(acts);
      wrap.appendChild(line);
    }
    colListEl.appendChild(wrap);
  });
}

function showView(which) {
  const manage = which === 'manage';
  listView.hidden = manage;
  manageView.hidden = !manage;
  if (manage) {
    editingKey = null;
    mgrErrEl.textContent = '';
    renderManage();
  }
}

// ---------- 이벤트 ----------

$('openManage').addEventListener('click', () => showView('manage'));
$('backList').addEventListener('click', () => showView('list'));
$('addCol').addEventListener('click', addCol);
newNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCol(); });

$('deleteAllBtn').addEventListener('click', deleteAll);
dCancel.addEventListener('click', closeConfirm);
dOk.addEventListener('click', () => {
  const run = pending;
  closeConfirm();
  if (run) run();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmEl.hidden) closeConfirm();
});
toastEl.addEventListener('click', () => { toastEl.hidden = true; });

// 백그라운드에서 저장이 일어나도 팝업이 바로 갱신되도록 합니다.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.items) {
    items = changes.items.newValue || [];
  }
  if (changes.cols) {
    cols = changes.cols.newValue || DEFAULT_COLS.slice();
  }
  if (changes.items || changes.cols) render();
});

function renderInfo() {
  const v = chrome.runtime.getManifest().version;
  $('devInfo').textContent = `개발자: ${INFO.developer} · 문의: ${INFO.contact}`;
  $('verInfo').textContent = `버전 ${v} · 제작일 ${INFO.built}`;
}

async function init() {
  renderInfo();
  const data = await chrome.storage.local.get(['items', 'cols', 'lastMessage', 'lastMessageError']);
  items = data.items || [];
  cols = data.cols || DEFAULT_COLS.slice();
  render();
  if (data.lastMessage) {
    showToast(data.lastMessage, data.lastMessageError);
    await chrome.storage.local.remove(['lastMessage', 'lastMessageError']);
  }
  // 팝업을 열었으니 툴바 배지를 지웁니다.
  chrome.action.setBadgeText({ text: '' });
}

init();
