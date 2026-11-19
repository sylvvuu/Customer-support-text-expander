// 내 문장 모음 · 백그라운드 (서비스 워커)
// 모음 목록에 맞춰 우클릭 메뉴를 만들고, 선택한 문장을 chrome.storage.local에 저장합니다.
// 외부 서버로는 아무것도 보내지 않습니다.

const MAX_LEN = 300;
const NONE = 'none';

const DEFAULT_COLS = [
  { key: 'ship', label: '배송 안내' },
  { key: 'coupon', label: '쿠폰 안내' },
  { key: 'return', label: '교환·반품 안내' },
  { key: NONE, label: '미분류' }
];

const SAMPLE = [
  { id: 's1', cat: 'ship', text: '주문하신 상품은 결제 확인 후 영업일 기준 2~3일 안에 출고돼요.', url: '', date: '' },
  { id: 's2', cat: 'coupon', text: '신규 가입 쿠폰은 가입 후 7일 동안 사용할 수 있어요.', url: '', date: '' },
  { id: 's3', cat: 'return', text: '수령 후 7일 이내에 미사용 상품을 교환하거나 반품할 수 있어요.', url: '', date: '' }
];

async function getCols() {
  const { cols } = await chrome.storage.local.get('cols');
  return cols && cols.length ? cols : DEFAULT_COLS;
}

function labelOf(cols, key) {
  const c = cols.find((x) => x.key === key);
  return c ? c.label : '미분류';
}

// 우클릭 메뉴 생성은 한 번에 하나씩만 실행합니다.
// 동시에 두 번 실행되면 removeAll이 끝나기 전에 같은 ID를 만들려고 해서 오류가 납니다.
let menuQueue = Promise.resolve();

function createMenus() {
  menuQueue = menuQueue.then(buildMenus).catch((e) => console.error('메뉴 생성 실패', e));
  return menuQueue;
}

function buildMenus() {
  return getCols().then((cols) => new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'root', title: '내 문장 모음에 저장', contexts: ['selection'] });
      cols.forEach((c) => {
        chrome.contextMenus.create({
          id: 'cat-' + c.key,
          parentId: 'root',
          title: c.key === NONE ? '미분류로 저장' : c.label + '에 저장',
          contexts: ['selection']
        });
      });
      resolve();
    });
  }));
}

chrome.runtime.onInstalled.addListener(async () => {
  const { items, cols } = await chrome.storage.local.get(['items', 'cols']);
  const patch = {};
  if (!items) patch.items = SAMPLE;
  if (!cols) patch.cols = DEFAULT_COLS;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  createMenus();
});

chrome.runtime.onStartup.addListener(createMenus);

// 팝업에서 모음을 추가, 이름 변경, 삭제하면 메뉴를 다시 만듭니다.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.cols) createMenus();
});

async function saveItem(text, cat, url) {
  if (!text) return { ok: false, message: '선택한 문장이 없어요.' };
  if (text.length > MAX_LEN) return { ok: false, message: `문장은 ${MAX_LEN}자 이내로 선택해 주세요.` };

  const { items = [] } = await chrome.storage.local.get('items');
  const cols = await getCols();
  const dup = items.find((i) => i.text === text);
  if (dup) return { ok: false, message: `이미 '${labelOf(cols, dup.cat)}'에 저장된 문장이에요.` };

  // 메뉴를 연 뒤 모음이 삭제됐을 수 있으니, 없는 모음이면 미분류로 저장합니다.
  const target = cols.some((c) => c.key === cat) ? cat : NONE;
  const item = {
    id: String(Date.now()),
    cat: target,
    text,
    url,
    date: new Date().toLocaleDateString('ko-KR')
  };
  await chrome.storage.local.set({ items: [item, ...items] });
  return { ok: true, message: `${labelOf(cols, target)}에 저장했어요.` };
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!info.menuItemId.startsWith('cat-')) return;
  const cat = info.menuItemId.slice(4);
  const text = (info.selectionText || '').trim();
  const result = await saveItem(text, cat, info.pageUrl || '');

  // 팝업이 열리기 전까지 배지로 결과를 알려 줍니다.
  chrome.action.setBadgeBackgroundColor({ color: result.ok ? '#DC2626' : '#7F1D1D' });
  chrome.action.setBadgeText({ text: result.ok ? '+1' : '!' });

  // 팝업을 열었을 때 토스트로 보여 줄 메시지를 저장합니다.
  await chrome.storage.local.set({ lastMessage: result.message, lastMessageError: !result.ok });
});
