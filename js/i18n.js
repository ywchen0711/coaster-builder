// Chinese / English text. The lobby opens games with ?lang=zh|en: that choice wins and is remembered.
const KEY = 'coaster.lang';
let lang = 'zh';
try {
  const q = (location.search.match(/[?&]lang=(zh|en)(?![a-z])/) || [])[1];
  if (q) { lang = q; localStorage.setItem(KEY, q); }
  else { const s = localStorage.getItem(KEY); lang = s === 'en' || s === 'zh' ? s : /^zh/i.test(navigator.language || 'zh') ? 'zh' : 'en'; }
} catch (e) { /* private mode */ }

export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ } document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; }
export const L = (o) => (o ? o[lang] ?? o.en : '');
export const t = (k, ...a) => { const v = TXT[lang][k] ?? TXT.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };

const TXT = {
  zh: {
    title: '雲霄飛車設計師', sub: 'Coaster Builder',
    S: '直線', U: '往上', D: '往下', L: '左彎', R: '右彎', LL: '左大彎', RR: '右大彎', O: '迴圈', B: '加速器', K: '煞車',
    tipS: '直直往前（保持現在的坡度）', tipU: '把軌道往上抬一級', tipD: '把軌道往下壓一級', tipL: '小半徑左轉（慢速用）', tipR: '小半徑右轉（慢速用）',
    tipLL: '大半徑左轉（快速也舒服）', tipRR: '大半徑右轉（快速也舒服）', tipO: '垂直迴圈：倒過來繞一圈', tipB: '把車子推到快 100 公里', tipK: '把車速降到每秒 6 公尺',
    chain: '鏈條爬坡', chainTip: '開著的時候，新放的軌道會有鏈條，把車子慢慢拉上坡', pieces: '軌道', tools: '工具',
    undo: '↩ 拆掉上一段', clear: '🗑 全部拆掉', auto: '🪄 自動接回車站', ride: '▶ 試乘！', stop: '■ 停止', again: '↻ 再坐一次',
    examples: '範例', pickExample: '— 載入範例 —', save: '💾 存檔', load: '📂 讀取', color: '顏色', help: '說明',
    clearQ: '確定要拆掉整條軌道嗎？', saved: '已存檔！', loaded: '已讀取', nothingSaved: '還沒有存檔',
    err_collide: '❌ 會撞到其他軌道', err_ground: '❌ 太低了，會撞到地面', err_bounds: '❌ 超出公園範圍', err_high: '❌ 太高了（最高 70 公尺）',
    err_slope: '❌ 斜坡上不能放這種軌道：先把軌道拉平', err_closed: '✅ 軌道已經接回車站了',
    open: (n) => `還沒接回車站（${n} 段軌道）。蓋到車站的入口，或按「自動接回車站」。`, closedOk: (n) => `✅ 完成！${n} 段軌道，可以試乘了`,
    autoFail: '找不到能接回車站的路線，試著拆掉幾段再試。', autoDone: (n) => `🪄 自動加了 ${n} 段軌道`,
    needClosed: '要先把軌道接回車站才能試乘！',
    stall: (h) => `😱 車子卡在 ${h} 公尺高的地方，爬不上去了！在上坡加鏈條（⛓），或把山丘做低一點。`,
    speed: '速度', height: '高度', gforce: 'G 力', time: '時間',
    results: '試乘結果', excitement: '刺激度', intensity: '強度', nausea: '噁心度',
    st_len: '長度', st_top: '最高速', st_h: '最高點', st_drop: '最大落差', st_inv: '翻轉', st_air: '失重時間', st_g: '最大 G 力', st_neg: '最小 G 力', st_lat: '側向 G 力', st_time: '時間',
    unit_m: '公尺', unit_kmh: '公里/時', unit_s: '秒',
    superUsers: '超級玩家', challenges: '挑戰', badgeGot: '獲得徽章！',
    view_orbit: '🎥 自由視角', view_pov: '👀 車頭視角', view_chase: '🚃 跟車視角',
    rideHint: '試乘中：切換視角看看！',
    rev: {
      josh: { fast: '超快！我還要再坐一次！', ok: '還不錯，可以再快一點。', slow: '好慢喔……我走路都比較快。', none: '……' },
      jasper: { flips: '翻來翻去太讚了！', oneflip: '一個迴圈不夠，我要更多！', noflip: '沒有迴圈？我想倒過來啦！', none: '……' },
      jeff: { floaty: '我飄起來了！屁股都離開座位！', someair: '有一點點飄，再多幾座山丘吧！', noair: '完全沒有飄起來的感覺。', none: '……' },
      erin: { smooth: '好舒服，風景也好漂亮～', rough: '太刺激了，我頭好暈……', short: '還可以，再長一點、平順一點會更好。', none: '……' },
    },
    shout: { josh: { drop: '哇啊啊啊啊！' }, jasper: { flip: '倒過來了！耶！' }, jeff: { air: '我飄起來了～' }, erin: { intense: '太快了啦！' } },
    likes: { josh: '速度狂', jasper: '翻轉王', jeff: '失重派', erin: '舒服派' },
    chal: { josh: '時速 100 公里', jasper: '翻轉 3 次', jeff: '失重 4 秒', erin: '刺激 6 以上、噁心 3 以下' },
    badge: { first: '第一座雲霄飛車', josh: 'Josh 的挑戰：時速 100 公里', jasper: 'Jasper 的挑戰：翻轉 3 次', jeff: 'Jeff 的挑戰：失重 4 秒', erin: 'Erin 的挑戰：刺激又舒服', dream: '夢幻雲霄飛車：四個人都給 4 顆星以上', tall: '高塔：最高點 50 公尺', thrill: '刺激度 8 以上' },
    helpBody: [
      '從車站出發，一段一段蓋軌道，最後接回車站入口（車站左邊的箭頭）。',
      '要爬坡時把「⛓ 鏈條爬坡」打開，車子才會被拉上去。從高處衝下來就會變快！',
      '迴圈、加速器、煞車和轉彎只能放在平的軌道上。快速轉彎要用大彎，或在彎前加煞車，不然 G 力會太大。',
      '試乘時可以切換車頭視角。結束後會看到刺激度、強度、噁心度，還有四位超級玩家的評分：Josh 愛速度、Jasper 愛翻轉、Jeff 愛失重、Erin 喜歡又長又舒服。完成他們的挑戰可以拿徽章！',
      '拖曳畫面轉視角，滾輪或 ＋－ 縮放。鍵盤：Backspace 拆掉上一段、Enter 試乘。',
    ],
  },
  en: {
    title: 'Coaster Builder', sub: '雲霄飛車設計師',
    S: 'Straight', U: 'Up', D: 'Down', L: 'Left', R: 'Right', LL: 'Wide left', RR: 'Wide right', O: 'Loop', B: 'Booster', K: 'Brakes',
    tipS: 'Straight ahead (keeps the current slope)', tipU: 'Tilt the track up one step', tipD: 'Tilt the track down one step', tipL: 'Tight left turn (for slow parts)', tipR: 'Tight right turn (for slow parts)',
    tipLL: 'Wide left turn (comfy even when fast)', tipRR: 'Wide right turn (comfy even when fast)', tipO: 'Vertical loop: upside down and around', tipB: 'Launches the train to almost 100 km/h', tipK: 'Slows the train to 6 m/s',
    chain: 'Chain lift', chainTip: 'While on, new pieces get a chain that pulls the train up hills', pieces: 'Track', tools: 'Tools',
    undo: '↩ Remove last', clear: '🗑 Clear all', auto: '🪄 Auto-finish', ride: '▶ Test ride!', stop: '■ Stop', again: '↻ Ride again',
    examples: 'Examples', pickExample: '— Load an example —', save: '💾 Save', load: '📂 Load', color: 'Colour', help: 'Help',
    clearQ: 'Remove the whole track?', saved: 'Saved!', loaded: 'Loaded', nothingSaved: 'Nothing saved yet',
    err_collide: '❌ It would hit other track', err_ground: '❌ Too low: it would hit the ground', err_bounds: '❌ Outside the park', err_high: '❌ Too high (70 m max)',
    err_slope: '❌ Not on a slope: level the track first', err_closed: '✅ The circuit is complete',
    open: (n) => `Not back at the station yet (${n} pieces). Build to the station entrance or press Auto-finish.`, closedOk: (n) => `✅ Complete! ${n} pieces, ready for a test ride`,
    autoFail: 'No way back to the station found. Remove a few pieces and try again.', autoDone: (n) => `🪄 Added ${n} pieces`,
    needClosed: 'Connect the track back to the station before a test ride!',
    stall: (h) => `😱 The train got stuck ${h} m up and cannot climb! Add a chain lift (⛓) to that hill or make it lower.`,
    speed: 'Speed', height: 'Height', gforce: 'G-force', time: 'Time',
    results: 'Test ride results', excitement: 'Excitement', intensity: 'Intensity', nausea: 'Nausea',
    st_len: 'Length', st_top: 'Top speed', st_h: 'Highest point', st_drop: 'Biggest drop', st_inv: 'Inversions', st_air: 'Airtime', st_g: 'Max G', st_neg: 'Min G', st_lat: 'Side G', st_time: 'Ride time',
    unit_m: 'm', unit_kmh: 'km/h', unit_s: 's',
    superUsers: 'Super users', challenges: 'Challenges', badgeGot: 'Badge earned!',
    view_orbit: '🎥 Free view', view_pov: '👀 Front seat', view_chase: '🚃 Chase',
    rideHint: 'Riding: try another view!',
    rev: {
      josh: { fast: 'So fast! Again, again!', ok: 'Not bad, but it could be faster.', slow: 'So slow... I could walk faster.', none: '...' },
      jasper: { flips: 'Upside down again and again, awesome!', oneflip: 'One loop is not enough, I want more!', noflip: 'No loops? I want to go upside down!', none: '...' },
      jeff: { floaty: 'I floated right out of my seat!', someair: 'A little floaty. More hills please!', noair: 'I never felt weightless at all.', none: '...' },
      erin: { smooth: 'So smooth, and what a view!', rough: 'Too intense, I feel dizzy...', short: 'Okay. Longer and smoother would be nicer.', none: '...' },
    },
    shout: { josh: { drop: 'WOOOOOO!' }, jasper: { flip: 'Upside down! Yes!' }, jeff: { air: "I'm floating!" }, erin: { intense: 'Too fast!!' } },
    likes: { josh: 'Speed freak', jasper: 'Loop lover', jeff: 'Airtime hunter', erin: 'Smooth rider' },
    chal: { josh: '100 km/h', jasper: '3 inversions', jeff: '4 s of airtime', erin: 'Excitement 6+, nausea 3 or less' },
    badge: { first: 'First coaster', josh: "Josh's challenge: 100 km/h", jasper: "Jasper's challenge: 3 inversions", jeff: "Jeff's challenge: 4 s of airtime", erin: "Erin's challenge: thrilling but smooth", dream: 'Dream coaster: all four give 4+ stars', tall: 'Sky high: 50 m tall', thrill: 'Excitement 8+' },
    helpBody: [
      'Start at the station and add track piece by piece, then connect back to the station entrance (the arrow on its left).',
      'Turn on "⛓ Chain lift" to climb: the chain pulls the train up. Coming down from high up makes it fast!',
      'Loops, boosters, brakes and turns only go on level track. For fast turns use wide turns or put brakes before them, or the G-forces get too big.',
      'During the ride try the front-seat view. Afterwards you get excitement, intensity and nausea, plus ratings from the four super users: Josh loves speed, Jasper loves loops, Jeff loves airtime, Erin likes long smooth rides. Beat their challenges for badges!',
      'Drag to turn the view, wheel or ＋－ to zoom. Keys: Backspace removes the last piece, Enter starts a ride.',
    ],
  },
};
