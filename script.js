const PLACEHOLDER = "public/images/placeholder.svg";
const ACTIVITY_CSV = typeof window !== "undefined" ? window.ACTIVITIES_CSV || "" : "";
const OVERVIEW_YEARS = ["112", "113", "114", "115"];
const SDG_ICON_BASE = "public/images/sdgs";
const themeData = typeof window !== "undefined" && window.THEMES_DATA
  ? window.THEMES_DATA
  : { themes: [], featured: [] };
let homeCarouselTimer = null;
const warnedMissingThemeActivityIds = new Set();
const SDG_INFO = {
  "SDG 1": "終結貧窮",
  "SDG 2": "消除飢餓",
  "SDG 3": "健康與福祉",
  "SDG 4": "優質教育",
  "SDG 5": "性別平權",
  "SDG 6": "淨水與衛生",
  "SDG 7": "可負擔潔淨能源",
  "SDG 8": "合適工作及經濟成長",
  "SDG 9": "工業化、創新及基礎建設",
  "SDG 10": "減少不平等",
  "SDG 11": "永續城市與社區",
  "SDG 12": "責任消費與生產",
  "SDG 13": "氣候行動",
  "SDG 14": "保育海洋生態",
  "SDG 15": "保育陸域生態",
  "SDG 16": "和平、正義與健全制度",
  "SDG 17": "多元夥伴關係",
};

const siteData = {
  home: {
    title: "成果故事館",
    subtitle: "從課程、地方行動到數位典藏，累積嘉義地方知識的軌跡",
    intro:
      "邑米社區大學在各鄉鎮推動課程、走讀、展演、工作坊與社區行動，透過成果總覽、主題館、數位走讀互動館、社團記錄及成果展示，帶您看見學習如何在地方發生、累積並產生改變。",
  },
  entrances: [
    {
      title: "成果故事館總覽",
      href: "#/overview",
      kicker: "112-115",
      description: "以地區與 SDGs 進行分類，逐步彙整 112-115 年活動、成果與照片資料。",
    },
    {
      title: "地方知識主題館",
      href: "#/themes",
      kicker: "Knowledge",
      description: "整理赤蘭溪、醫療地景、刺繡文化、海區創生與食農教育等地方知識主題。",
    },
    {
      title: "地方探索館",
      href: "#/explore",
      kicker: "Explore",
      description: "從赤蘭溪 AR 探索出發，逐步擴充嘉義地方文化與環境主題。",
    },
    {
      title: "社團記錄",
      href: "#/clubs",
      kicker: "Community",
      description: "記錄六個學習社團的活動歷程、成員作品、交流展演與地方參與。",
    },
    {
      title: "活動與學員成果展示",
      href: "#/showcase",
      kicker: "Archive",
      description: "預留活動照片、學員作品、走讀紀錄、工作坊成果、影片與出版教材的展示區。",
    },
  ],
  digitalTours: [
    {
      slug: "game",
      title: "赤蘭溪闖關遊戲",
      description: "結合守護靈赤靈、AR 相機互動與闖關任務，讓民眾以遊戲方式認識流域文化。",
      image: "public/images/activities/112-014/cover.jpg",
      externalUrl: "https://cycc-yimi.github.io/grandma-memory-box/",
    },
    {
      slug: "chilan-walk",
      title: "赤蘭溪走讀",
      description: "整理流域走讀路線、地方故事、自然環境與文化地景，建立可依站點瀏覽的數位導覽。",
      image: "public/images/activities/112-009/cover.jpg",
    },
    {
      slug: "early-life",
      title: "赤蘭溪早年生活型態",
      description: "以學員速寫圖搭配口述故事與 Podcast 音檔，重現流域居民早年的生活記憶。",
      image: PLACEHOLDER,
    },
    {
      slug: "puzi-medical",
      title: "朴子醫療走讀",
      description: "從醫療地景、公共衛生與地方記憶出發，規劃可依站點閱讀與聆聽的數位走讀。",
      image: "public/images/activities/112-002/cover.jpg",
    },
  ],
  earlyLifePodcast: [
    {
      title: "赤蘭溪早年生活故事一",
      description: "請在這裡補上速寫圖所描繪的生活場景與口述故事簡介。",
      image: PLACEHOLDER,
      audio: "",
    },
    {
      title: "赤蘭溪早年生活故事二",
      description: "可收錄學員、耆老或地方居民的聲音，形成一站一故事的語音導覽。",
      image: PLACEHOLDER,
      audio: "",
    },
    {
      title: "赤蘭溪早年生活故事三",
      description: "音檔可使用 MP3，放入指定資料夾後填入 audio 欄位即可播放。",
      image: PLACEHOLDER,
      audio: "",
    },
  ],
  clubs: [
    { slug: "wood-repair", title: "嘉邑木工修繕社", description: "記錄木工學習、家具修繕、社區服務與作品成果。" },
    { slug: "saxophone", title: "薩克斯風社", description: "記錄樂曲練習、團體交流、成果演出與社區展演。" },
    { slug: "dance", title: "多元舞蹈社", description: "記錄多元舞蹈學習、排練過程、展演與成員交流。" },
    { slug: "enka", title: "日本演歌說唱社", description: "記錄日本演歌學習、歌唱交流與成果發表。" },
    { slug: "qigong", title: "太極十八式氣功暨身心調理社", description: "記錄氣功練習、身心調理、健康交流與推廣活動。" },
    { slug: "sketch", title: "嘉憶速寫社", description: "記錄地方速寫、走讀觀察、學員作品與聯合展覽。" },
  ],
  themes: [
    {
      title: "赤蘭溪流域文化",
      description: "從走讀、地方調查、文化工作坊與數位互動，累積流域生活、信仰與產業記憶。",
      href: "#/themes/chilan-river",
    },
    {
      title: "朴子醫療地景",
      description: "梳理朴子醫療、公共衛生與地方生活場域，保存地方照護記憶與社區知識。",
      href: "#/themes/puzi-medical",
    },
    {
      title: "刺繡文化",
      description: "連結傳統技藝、學員創作與地方故事，讓刺繡成為文化保存與表達媒介。",
      href: "#/themes/embroidery",
    },
    {
      title: "海區地方創生",
      description: "聚焦沿海社區、產業、環境與地方行動，呈現海區生活的創生能量。",
      href: "#/themes/coastal",
    },
    {
      title: "食農教育與地方產業",
      description: "從飲食、農業、作物應用與地方產業出發，建立貼近生活的食農學習脈絡。",
      href: "#/themes/food-agri",
    },
  ],
  showcase: [
    { title: "活動照片", description: "placeholder：之後可放入各年度活動精選照片與圖說。" },
    { title: "學員作品", description: "placeholder：之後可放入學員創作、作品說明與展示照片。" },
    { title: "走讀紀錄", description: "placeholder：之後可放入走讀路線、觀察紀錄與地方故事。" },
    { title: "工作坊成果", description: "placeholder：之後可放入工作坊過程、共創成果與參與回饋。" },
    { title: "影片紀錄", description: "placeholder：之後可放入影片連結、截圖與簡短介紹。" },
    { title: "出版與教材成果", description: "placeholder：之後可放入手冊、教材、出版品與下載資訊。" },
  ],
  chilan: {
    description:
      "赤蘭溪流域文化館整合本校近年於赤蘭溪流域推動的地方調查、走讀課程、文化工作坊、學員創作與數位互動成果，透過課程與公共參與累積地方知識，並以赤靈 AR 闖關體驗作為民眾認識流域文化的互動入口。",
    arUrl: "https://cycc-yimi.github.io/grandma-memory-box/",
    note:
      "本互動體驗網站結合赤靈角色、AR 相機互動與闖關任務，作為赤蘭溪地方知識教育推廣工具。",
    questions: [
      {
        question: "赤蘭溪互動體驗主要希望民眾認識什麼？",
        options: ["流域文化與地方故事", "線上購物流程", "都市交通規劃"],
        answer: 0,
      },
      {
        question: "赤靈在互動體驗中扮演什麼角色？",
        options: ["引導角色", "抽獎系統", "報名表單"],
        answer: 0,
      },
      {
        question: "這個體驗結合哪一種數位互動？",
        options: ["AR 相機互動", "純文字測驗", "資料庫管理"],
        answer: 0,
      },
    ],
  },
};

const gameState = {
  points: 0,
  answered: new Set(),
};

let activityCache = null;

if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("hashchange", render);
document.addEventListener("DOMContentLoaded", () => {
  initNavDropdowns();
  render();
});

function getRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return {
    page: parts[0] || "home",
    detail: parts[1] || "",
    id: decodeURIComponent(parts[2] || ""),
    year: parts[3] || "112",
  };
}

function render() {
  const route = getRoute();
  const app = document.querySelector("#app");
  app.classList.toggle("year-page", route.page === "overview" && route.detail === "year");
  stopHomeCarousel();
  updateNav(route.page);
  if (route.page === "overview") renderOverview();
  else if (route.page === "themes") renderThemes(route.detail);
  else if (route.page === "explore" && window.LocalExploration) window.LocalExploration.render(route.detail);
  else if (route.page === "digital" || route.page === "chilan") renderDigitalTours(route.detail);
  else if (route.page === "clubs") renderClubs(route.detail);
  else if (route.page === "showcase") renderShowcase();
  else if (route.page === "about") renderAbout();
  else renderHome();
  initCategoryExpanders();
  bindImageFallbacks();
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

function updateNav(page) {
  const route = getRoute();
  const activePage =
    page === "home"
      ? "overview"
      : page === "chilan" || page === "digital"
        ? "explore"
        : page;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const nav = link.dataset.nav;
    link.classList.toggle("active", nav === activePage);
  });

  const overviewMenu = document.querySelector('[data-nav="overview"] + .nav-menu');
  if (overviewMenu) {
    const selectedYear =
      route.page === "overview"
        ? route.detail === "year"
          ? route.id
          : route.year
        : "";
    overviewMenu.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href") || "";
      const isAllResults = route.page === "overview" && !route.detail && href === "#/overview";
      const isSelectedYear =
        Boolean(selectedYear) && href === `#/overview/year/${selectedYear}`;
      const isActive = isAllResults || isSelectedYear;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
}

function initNavDropdowns() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    const trigger = item.querySelector(".nav-trigger");
    const menu = item.querySelector(".nav-menu");
    if (!trigger || !menu) return;
    trigger.addEventListener("click", () => {
      closeNavDropdowns();
    });
  });

  document.querySelectorAll(".nav-menu a").forEach((link) => {
    link.addEventListener("click", closeNavDropdowns);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-item")) closeNavDropdowns();
  });
}

function closeNavDropdowns() {
  document.querySelectorAll(".nav-item.open").forEach((item) => item.classList.remove("open"));
}

function renderHome() {
  const app = document.querySelector("#app");
  const activities = getActivities();
  const totalImpact = activities.reduce((sum, activity) => sum + activity.participants, 0);
  const districts = groupActivitiesByDistrict(activities).length;
  const sdgs = groupActivitiesBySdg(activities).length;
  const heroSlides = homeCarouselSlides(activities);
  app.innerHTML = `
    <section class="hero museum-hero">
      <div class="hero-copy">
        <div class="hero-kicker">112-115 成果故事館</div>
        <h1>${siteData.home.title}</h1>
        <p class="hero-subtitle">${siteData.home.subtitle}</p>
        <p class="hero-intro">${siteData.home.intro}</p>
      </div>
      ${heroPhotoCarousel(heroSlides)}
    </section>
    <section class="home-stats" aria-label="112-115 年成果統計">
      ${homeStat("總影響人次", `${formatNumber(totalImpact)} 人次`, "依已匯入活動資料的參與人次加總")}
      ${homeStat("112-115 年活動", `${activities.length} 件`, "目前已整理匯入的活動資料")}
      ${homeStat("服務地區", `${districts} 區`, "依鄉鎮市區拆分統計")}
      ${homeStat("SDGs 對應", `${sdgs} 項`, "依活動對應永續目標統計")}
    </section>
    <section class="section integrated-overview" aria-labelledby="integrated-overview-title">
      <div class="section-heading">
        <div>
          <span class="section-label">ALL RESULTS</span>
          <h2 id="integrated-overview-title">全部成果</h2>
        </div>
        <p>直接從成果故事館首頁選擇年度，查看活動統計、服務地區與 SDGs 成果。</p>
      </div>
      <div class="year-overview-grid" aria-label="112 至 115 年成果">
        ${OVERVIEW_YEARS.map((year) => yearOverviewCard(year, activities)).join("")}
      </div>
    </section>
    <section class="section">
      <div class="portal-grid">
        ${siteData.entrances.map((item) => portalCard(item)).join("")}
      </div>
    </section>
  `;
  initHomeCarousel();
}

function renderOverview() {
  const route = getRoute();
  if (route.detail === "activity" && route.id) {
    renderActivityDetail(route.id);
    return;
  }
  if (route.detail === "year" && route.id) {
    renderYearOverview(route.id);
    return;
  }
  if ((route.detail === "areas" || route.detail === "sdgs") && route.id) {
    renderOverviewDetail(route.detail, route.id, route.year);
    return;
  }

  renderHome();
}

function renderYearOverview(selectedYear) {
  const app = document.querySelector("#app");
  const year = OVERVIEW_YEARS.includes(selectedYear) ? selectedYear : "112";
  const activities = getActivities().filter((activity) => activity.year === year);
  const districtGroups = groupActivitiesByDistrict(activities);
  const sdgGroups = groupActivitiesBySdg(activities).sort(
    (a, b) => b[1].length - a[1].length || sdgNumber(a[0]) - sdgNumber(b[0])
  );
  const metrics = getYearMetrics(activities);

  app.innerHTML = `
    ${pageHeader(`${year} 年成果`, `查看 ${year} 年活動統計，並依地區與 SDGs 即時篩選活動成果。`)}
    <nav class="year-tabs overview-year-tabs" aria-label="年度切換">
      ${OVERVIEW_YEARS.map((item) => `
        <a class="year-tab ${item === year ? "active" : ""}" href="#/overview/year/${item}">${item}</a>
      `).join("")}
    </nav>
    ${
      activities.length
        ? `
          <section class="year-dashboard" aria-label="${year} 年成果統計">
            ${dashboardMetric("活動件數", metrics.activities, "件")}
            ${dashboardMetric("服務地區數", metrics.districts, "區")}
            ${dashboardMetric("對應 SDGs 數", metrics.sdgs, "項")}
            ${dashboardMetric("總參與人次", formatNumber(metrics.participants), "人次")}
          </section>
          <section class="year-filter-section" aria-label="活動篩選">
            <div class="filter-group">
              <div class="filter-heading">
                <div>
                  <span>Area</span>
                  <h2>依地區篩選</h2>
                </div>
                <p>可與 SDGs 條件交叉篩選</p>
              </div>
              <div class="district-filter-list" role="group" aria-label="地區篩選">
                ${filterPill("全部地區", activities.length, "district", "", true)}
                ${districtGroups.map(([district, items]) => filterPill(district, items.length, "district", district)).join("")}
              </div>
            </div>
            <div class="filter-group">
              <div class="filter-heading">
                <div>
                  <span>SDGs</span>
                  <h2>依 SDGs 篩選</h2>
                </div>
                <p>預設顯示活動數最多的前 6 項</p>
              </div>
              <div class="sdg-filter-list" role="group" aria-label="SDGs 篩選">
                ${sdgFilterButton("全部 SDGs", activities.length, "", true)}
                ${sdgGroups.map(([sdg, items], index) => sdgFilterButton(sdg, items.length, sdg, false, index >= 6)).join("")}
              </div>
              ${
                sdgGroups.length > 6
                  ? `<button class="sdg-expand-button" type="button" data-expand-sdgs aria-expanded="false">展開更多 SDGs</button>`
                  : ""
              }
            </div>
          </section>
          <section class="year-activity-section">
            <div class="activity-list-heading">
              <div>
                <span>Activities</span>
                <h2>${year} 年活動成果</h2>
              </div>
              <strong data-filter-result-count>${activities.length} 件</strong>
            </div>
            <div class="activity-mini-grid" data-year-activity-grid>
              ${activities.map(activityMiniCard).join("")}
            </div>
          </section>
        `
        : emptyYearBlock(year)
    }
  `;
  if (activities.length) initYearOverviewFilters(activities);
}

function renderOverviewDetail(type, id, selectedYear) {
  const app = document.querySelector("#app");
  const year = OVERVIEW_YEARS.includes(selectedYear) ? selectedYear : "112";
  const allActivities = getActivities();
  const yearActivities = allActivities.filter((activity) => activity.year === year);
  const activities =
    type === "areas"
      ? yearActivities.filter((activity) => activity.districts.includes(id))
      : yearActivities.filter((activity) => activity.sdgs.includes(id));
  const isSdg = type === "sdgs";
  const title = isSdg ? `${id} ${SDG_INFO[id] || ""}`.trim() : `${id}成果`;
  const subtitle = isSdg
    ? "依 SDGs 編號彙整相關活動。先用小卡片快速瀏覽，需要完整內容時再點進活動詳細頁。"
    : "依鄉鎮市區彙整相關活動。先用小卡片快速瀏覽，需要完整內容時再點進活動詳細頁。";

  app.innerHTML = `
    <section class="overview-detail-head">
      <a class="text-link" href="#/overview">返回成果故事館總覽</a>
      <div class="detail-title-line">
        ${isSdg ? `<img class="detail-sdg-icon" src="${sdgIconPath(id)}" alt="${id} icon">` : ""}
        <div>
          <div class="page-kicker">${isSdg ? "SDGs Archive" : "Area Archive"}</div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
      </div>
      <nav class="year-tabs" aria-label="年度切換">
        ${OVERVIEW_YEARS.map((item) => yearTab(type, id, item, year)).join("")}
      </nav>
    </section>
    ${
      activities.length
        ? `<section class="activity-mini-grid">${activities.map(activityMiniCard).join("")}</section>`
        : emptyYearBlock(year)
    }
  `;
}

function renderActivityDetail(activityId) {
  const app = document.querySelector("#app");
  const activity = getActivities().find((item) => item.id === activityId);
  if (!activity) {
    app.innerHTML = `${pageHeader("找不到活動", "這筆活動資料目前不存在，請回到成果故事館總覽重新選擇。")}`;
    return;
  }
  const gallery = unique(activity.photos).filter(Boolean);
  const sdgSection = activity.sdgs.length
    ? `
    <section class="detail-section">
      <h2>SDGs 對應</h2>
      <div class="activity-sdg-tags">
        ${activity.sdgs.map((sdg) => `<span>${sdg} ${SDG_INFO[sdg] || ""}</span>`).join("")}
      </div>
    </section>
  `
    : "";
  const summarySection = activity.summary
    ? `
    <section class="detail-section">
      <h2>活動效益摘要</h2>
      <p>${activity.summary}</p>
    </section>
  `
    : "";
  const gallerySection = gallery.length
    ? `
    <section class="detail-section">
      <h2>成果照片牆</h2>
      <div class="detail-gallery">
        ${gallery.map((src) => `<img src="${src}" alt="${activity.name}成果照片">`).join("")}
      </div>
    </section>
  `
    : "";
  app.innerHTML = `
    <section class="activity-detail-head">
      <div class="detail-back-links">
        <button class="text-link history-back-link" type="button">回到上一頁</button>
        <a class="text-link" href="#/overview">返回成果故事館總覽</a>
      </div>
      <div>
        <div class="page-kicker">${activity.year} 年活動成果</div>
        <h1>${activity.name}</h1>
      </div>
    </section>
    <section class="activity-detail-layout">
      <div class="activity-detail-photo">
        <img src="${activity.cover}" alt="${activity.name}">
      </div>
      <div class="activity-detail-info">
        ${detailInfo("活動日期", activity.date)}
        ${detailInfo("地區", activity.districts.join("、"))}
        ${detailInfo("活動地點", activity.place)}
        ${detailInfo("計畫名稱", activity.project)}
        ${detailInfo("活動類型", activity.type)}
        ${detailInfo("活動主題", activity.topic)}
        ${detailInfo("參與人次", activity.participants ? `${formatNumber(activity.participants)} 人次` : "")}
        ${detailInfo("合作單位", combineDetailValues(activity.cooperationUnits, activity.partners))}
        ${detailInfo("講師／帶領者", activity.leader)}
      </div>
    </section>
    ${sdgSection}
    ${summarySection}
    ${gallerySection}
  `;
  const backLink = app.querySelector(".history-back-link");
  backLink.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = `#/overview/year/${activity.year}`;
  });
}

function renderThemes(detail) {
  const app = document.querySelector("#app");
  const themes = Array.isArray(themeData.themes) ? themeData.themes.filter(Boolean) : [];
  const featured = Array.isArray(themeData.featured) ? themeData.featured.filter(Boolean) : [];
  const selected = themes.find((item) => item && item.id === detail);
  if (selected) {
    const relatedActivities = getThemeActivities(selected);
    const derivedTheme = enrichThemeWithActivities(selected, relatedActivities);
    const detailCoverCandidates = selectThemeCoverCandidates(selected, relatedActivities);
    const detailCover = detailCoverCandidates[0] || PLACEHOLDER;
    const detailCoverFallbacks = detailCoverCandidates.slice(1).join("|");
    app.innerHTML = `
      <div class="theme-detail-back">
        <a class="theme-back-link" href="#/themes">← 返回主題館</a>
      </div>
      <section class="page-title platform-hall-banner theme-detail-banner">
        <div class="platform-hall-copy">
          <div class="page-kicker">主題館</div>
          <h1>${selected.title}</h1>
          ${hasThemeValue(selected.subtitle || selected.description) ? `<p>${selected.subtitle || selected.description}</p>` : ""}
          ${renderThemeBannerMeta(relatedActivities, derivedTheme)}
        </div>
        <div class="platform-hall-media">
          <img src="${detailCover}" data-image-fallbacks="${detailCoverFallbacks}" alt="${selected.title}主題封面">
        </div>
      </section>
      ${
        hasThemeValue(selected.description)
          ? `<section class="theme-detail-lead"><p>${selected.description}</p>${renderThemeTags(selected.tags)}</section>`
          : renderThemeTags(selected.tags)
      }
      <section class="theme-detail-content-grid">
        ${renderThemeTextPanel("主題背景", selected.detailContent?.background)}
        ${renderThemeTextPanel("推動目的", selected.detailContent?.purpose)}
      </section>
      ${renderThemeRepresentativeResults(relatedActivities.slice(0, 3))}
      ${renderThemeActivitySection(relatedActivities)}
      ${renderThemePhotoSection(derivedTheme.relatedPhotos, selected.title)}
      ${renderThemeListSection("相關 SDGs", derivedTheme.sdgs, "theme-sdg-list")}
      ${renderThemeListSection("延伸閱讀", selected.extendedReading, "theme-reading-list")}
      <div class="theme-detail-footer-action">
        <a class="theme-back-link" href="#/themes">← 返回主題館</a>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <section class="platform-hall-banner theme-museum-banner">
      <div class="platform-hall-copy">
        <div class="page-kicker">主題館</div>
        <h1>從議題脈絡，讀懂地方行動</h1>
        <p class="theme-banner-slogan">依地方議題整理課程成果、社區故事與長期行動。</p>
        <p>主題館將邑米社區大學歷年課程、活動、走讀、展覽、社區服務與地方行動，依不同主題進行整理，讓使用者能從議題脈絡認識地方知識的累積。</p>
        <div class="theme-banner-actions">
          <button class="button" type="button" data-theme-scroll="theme-all">瀏覽主題</button>
          <button class="button secondary" type="button" data-theme-scroll="theme-featured">查看精選主題</button>
        </div>
      </div>
      <div class="platform-hall-media">
        <img src="assets/images/platform-home/banner-learning.jpg" alt="邑米社區大學地方課程與共同學習">
      </div>
    </section>

    <section id="theme-featured" class="theme-section" aria-labelledby="featured-theme-title">
      <div class="theme-section-heading">
        <div>
          <span class="section-label">FEATURED THEMES</span>
          <h2 id="featured-theme-title">精選主題</h2>
        </div>
        <p>從跨年度累積的課程與地方行動，看見學習如何回應社區與環境。</p>
      </div>
      <div class="featured-theme-grid">
        ${featured.map((item) => featuredThemeCard(item, themes)).join("")}
      </div>
    </section>

    <section id="theme-all" class="theme-section" aria-labelledby="all-theme-title">
      <div class="theme-section-heading">
        <div>
          <span class="section-label">ALL THEMES</span>
          <h2 id="all-theme-title">主題總覽</h2>
        </div>
        <p>依議題進入不同年度、鄉鎮與活動共同累積的地方知識。</p>
      </div>
      <div class="theme-archive-grid">
        ${themes.map((item) => themeArchiveCard(item, getThemeActivities(item))).join("")}
      </div>
    </section>
  `;
  app.querySelectorAll("[data-theme-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#${button.dataset.themeScroll}`)?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderDigitalTours(detail) {
  const app = document.querySelector("#app");
  if (detail === "game") {
    renderChilanGame();
    return;
  }
  if (detail === "early-life") {
    renderEarlyLifePodcast();
    return;
  }

  const selected = siteData.digitalTours.find((item) => item.slug === detail);
  if (selected) {
    app.innerHTML = `
      ${pageHeader(selected.title, selected.description)}
      <section class="placeholder-feature">
        <div>
          <h2>數位走讀內容待補</h2>
          <p>此區可加入走讀站點、地圖、歷史照片、文字故事與語音導覽。資料會維持靜態網站形式，適合部署至 GitHub Pages。</p>
          <a class="button secondary" href="#/digital">回數位走讀互動館</a>
        </div>
        <img src="${selected.image || PLACEHOLDER}" alt="${selected.title}">
      </section>
    `;
    return;
  }

  app.innerHTML = `
    ${pageHeader("數位走讀互動館", "整合遊戲、走讀路線、地方速寫與語音故事，讓民眾以不同方式認識赤蘭溪流域及朴子醫療地景。")}
    <section class="digital-tour-grid">
      ${siteData.digitalTours.map(digitalTourCard).join("")}
    </section>
  `;
}

function renderChilanGame() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${pageHeader("赤蘭溪闖關遊戲", siteData.chilan.description)}
    <section class="interactive-layout">
      <div class="guardian-panel">
        <div class="guardian-mark">赤靈</div>
        <h2>以互動方式認識流域文化</h2>
        <p>保留闖關答題、點數系統與赤靈 AR 入口，讓成果網站能連結既有的赤蘭溪互動體驗。</p>
        <div class="point-box">
          <span>目前點數</span>
          <strong id="point-count">${gameState.points}</strong>
        </div>
        <button class="button" type="button" id="summon-ar">召喚赤靈，開始流域闖關</button>
      </div>
      <div class="quiz-panel">
        ${siteData.chilan.questions.map((item, index) => questionCard(item, index)).join("")}
      </div>
    </section>
    <p class="interactive-note">${siteData.chilan.note}</p>
  `;
  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", handleAnswer);
  });
  document.querySelector("#summon-ar").addEventListener("click", summonChiling);
}

function renderEarlyLifePodcast() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${pageHeader("赤蘭溪早年生活型態", "以赤蘭溪速寫圖搭配 Podcast 聲音紀錄，讓學員與民眾透過畫面和語音，認識流域居民早年的生活方式。")}
    <section class="podcast-intro">
      <div>
        <div class="page-kicker">Sketch Podcast</div>
        <h2>一張速寫，一段地方聲音</h2>
        <p>每一張卡片可放一幅學員速寫、一段故事介紹與一個 MP3 音檔。點選播放後，就能像語音導覽一樣邊看畫面、邊聽地方故事。</p>
      </div>
      <div class="podcast-file-note">
        <strong>後續檔案位置</strong>
        <span>速寫圖：public/images/digital/early-life/</span>
        <span>音檔：public/audio/early-life/</span>
      </div>
    </section>
    <section class="podcast-grid">
      ${siteData.earlyLifePodcast.map(podcastCard).join("")}
    </section>
  `;
}

function renderClubs(detail) {
  const app = document.querySelector("#app");
  const selected = siteData.clubs.find((item) => item.slug === detail);
  if (selected) {
    app.innerHTML = `
      ${pageHeader(selected.title, selected.description)}
      <section class="placeholder-feature">
        <div>
          <h2>社團紀錄待補</h2>
          <p>此區可放入社團介紹、活動歷程、成員作品、展演照片、影片與年度成果。</p>
          <a class="button secondary" href="#/clubs">回社團記錄</a>
        </div>
        <img src="${PLACEHOLDER}" alt="${selected.title}">
      </section>
    `;
    return;
  }

  app.innerHTML = `
    ${pageHeader("社團記錄", "保存學習社團的練習歷程、作品成果、交流展演與地方參與，呈現課程之外持續發生的共同學習。")}
    <section class="club-grid">
      ${siteData.clubs.map(clubCard).join("")}
    </section>
  `;
}

function renderShowcase() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    ${pageHeader("活動與學員成果展示", "先建立分類展示區，之後可依年度與主題放入正式照片、作品、影片與出版教材。")}
    <section class="showcase-grid">
      ${siteData.showcase.map((item, index) => showcaseCard(item, index)).join("")}
    </section>
  `;
}

function renderAbout() {
  const app = document.querySelector("#app");
  const towns = ["朴子市", "水上鄉", "新港鄉", "太保市", "中埔鄉", "鹿草鄉", "六腳鄉", "義竹鄉", "東石鄉", "布袋鎮"];
  const halls = [
    { name: "成果故事館", description: "彙整歷年課程、地方行動與公共參與成果。", href: "#/overview" },
    { name: "主題館", description: "依地方議題累積深度故事與主題成果。", href: "#/themes" },
    { name: "地方探索館", description: "透過走讀、任務與數位內容認識地方。", href: "#/explore" },
    { name: "社團紀錄", description: "記錄社團學習、服務與地方連結。", href: "#/clubs" },
    { name: "成果展示", description: "保存活動影像、學員作品與教材。", href: "#/showcase" },
    { name: "關於邑米", description: "認識學校、平台理念與參與方式。", href: "#/about" },
  ];
  const participation = [
    "報名社區大學課程",
    "參與地方走讀活動",
    "提供老照片或地方故事",
    "參與田野調查或口述歷史",
    "合作辦理課程、展覽或地方行動",
    "提供場地、資源或社區協力",
  ];

  app.innerHTML = `
    ${pageHeader("關於邑米", "從學習出發，陪伴地方累積知識與行動。")}

    <section class="about-page-section about-intro-grid" aria-labelledby="about-yimi-title">
      <div class="about-page-copy">
        <p class="section-label">ABOUT YIMI</p>
        <h2 id="about-yimi-title">嘉義縣邑米社區大學</h2>
        <p>嘉義縣邑米社區大學長期深耕地方文化、社區參與與公共教育，透過課程、走讀、田野調查、社區服務與成果展現，陪伴居民共同認識家鄉、記錄地方故事，並將學習成果回到社區。</p>
      </div>
      <div class="about-page-image">
        <img src="assets/images/platform-home/about-place.jpg" alt="邑米社區大學學員參與地方課程與記錄">
      </div>
    </section>

    <section class="about-page-section about-soft-section" aria-labelledby="service-area-title">
      <div class="about-section-heading">
        <p class="section-label">SERVICE AREA</p>
        <h2 id="service-area-title">十個服務鄉鎮</h2>
        <p>從城鎮到沿海聚落，陪伴居民在生活的地方持續學習與行動。</p>
      </div>
      <ul class="town-grid">
        ${towns.map((town) => `<li>${town}</li>`).join("")}
      </ul>
    </section>

    <section class="about-page-section about-principle-grid" aria-labelledby="platform-idea-title">
      <div class="about-card">
        <p class="section-label">OUR PURPOSE</p>
        <h2 id="platform-idea-title">平台建置理念</h2>
        <p>邑米地方知識探索平台希望整合歷年成果、地方故事、影像紀錄、主題成果與數位探索內容，避免地方知識分散於紙本、照片資料夾、社群媒體或單次活動中，逐步建立可持續累積與更新的地方知識平台。</p>
      </div>
      <div class="about-card about-quote-card">
        <strong>從學習出發</strong>
        <p>讓每一次課程、走讀與地方行動，都成為能被保存、分享並繼續發展的公共知識。</p>
      </div>
    </section>

    <section class="about-page-section" aria-labelledby="platform-structure-title">
      <div class="about-section-heading">
        <p class="section-label">PLATFORM MAP</p>
        <h2 id="platform-structure-title">平台架構</h2>
        <p>六大館各自承接不同內容，也彼此串連地方學習的完整脈絡。</p>
      </div>
      <div class="about-hall-grid">
        ${halls.map((hall, index) => `
          <a class="about-hall-card" href="${hall.href}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${hall.name}</h3>
            <p>${hall.description}</p>
          </a>
        `).join("")}
      </div>
    </section>

    <section class="about-page-section about-collaboration-grid" aria-labelledby="participation-title">
      <div>
        <p class="section-label">JOIN & COLLABORATE</p>
        <h2 id="participation-title">參與與合作方式</h2>
        <p>地方知識來自每一位居民的經驗，也需要不同夥伴共同累積。</p>
      </div>
      <ul class="participation-list">
        ${participation.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </section>

    <section class="about-page-section contact-section" aria-labelledby="contact-title">
      <div class="about-section-heading">
        <p class="section-label">CONTACT</p>
        <h2 id="contact-title">聯絡資訊</h2>
      </div>
      <dl class="contact-list">
        <div><dt>單位名稱</dt><dd>嘉義縣邑米社區大學</dd></div>
        <div><dt>聯絡電話</dt><dd><a href="tel:052390519">05-2390519</a>／<a href="tel:053790898">05-3790898</a></dd></div>
        <div><dt>電子郵件</dt><dd><a href="mailto:cycc222@gmail.com">cycc222@gmail.com</a></dd></div>
        <div><dt>地址</dt><dd>校本部－嘉義縣中埔鄉91號B1<br>朴子分校－嘉義縣朴子市山通路7號B1</dd></div>
        <div><dt>Facebook</dt><dd><a href="https://www.facebook.com/IMDCC" target="_blank" rel="noopener noreferrer">邑米社區大學 Facebook</a></dd></div>
        <div><dt>Line</dt><dd><a href="tel:0905935899">0905935899</a></dd></div>
        <div><dt>服務時間</dt><dd>校本部－週一至週五 08:30–17:00<br>朴子分校－週二至週五 09:00–16:30</dd></div>
      </dl>
    </section>

    <section class="about-page-section rights-note" aria-labelledby="rights-title">
      <div>
        <p class="section-label">DATA & COPYRIGHT</p>
        <h2 id="rights-title">版權與資料使用</h2>
      </div>
      <p>本平台內容以地方學習、成果保存與公共教育為目的。若需引用文字、照片、影音或研究資料，請註明來源；涉及個人肖像、受訪內容或合作單位資料時，請先洽嘉義縣邑米社區大學確認授權方式。</p>
    </section>
  `;
}

function pageHeader(title, subtitle) {
  const route = getRoute();
  const routePage = route.page;
  const hallHeaders = {
    home: {
      label: "成果故事館",
      image: "assets/images/platform-home/latest-river.jpg",
    },
    overview: {
      label: "成果故事館",
      image: "assets/images/platform-home/latest-river.jpg",
    },
    themes: {
      label: "主題館",
      image: "assets/images/platform-home/banner-learning.jpg",
    },
    explore: {
      label: "地方探索館",
      image: "assets/images/platform-home/banner-river.jpg",
    },
    digital: {
      label: "地方探索館",
      image: "assets/images/platform-home/banner-river.jpg",
    },
    chilan: {
      label: "地方探索館",
      image: "assets/images/platform-home/banner-river.jpg",
    },
    clubs: {
      label: "社團紀錄",
      image: "assets/images/platform-home/banner-community.jpg",
    },
    showcase: {
      label: "成果展示",
      image: "assets/images/platform-home/latest-work.jpg",
    },
    about: {
      label: "關於邑米",
      image: "assets/images/platform-home/about-place.jpg",
    },
  };
  const hall = hallHeaders[routePage] || hallHeaders.overview;
  const hallIntroductions = {
    overview: "112–115 年成果故事館，從課程、地方行動到數位典藏，累積嘉義地方知識的軌跡。",
    themes: "依地方議題整理課程成果、社區故事與長期行動。",
    explore: "走進現場，用故事、任務與數位體驗認識地方。",
    digital: "走進現場，用故事、任務與數位體驗認識地方。",
    chilan: "走進現場，用故事、任務與數位體驗認識地方。",
    clubs: "讓學習走出教室，陪伴地方一起前進。",
    showcase: "以影像、圖文與創作，保存地方學習的精彩片段。",
    about: "從學習出發，陪伴地方累積知識與行動。",
  };
  const displaySubtitle = route.detail ? subtitle : hallIntroductions[routePage] || subtitle;
  return `
    <section class="page-title platform-hall-banner">
      <div class="platform-hall-copy">
        <div class="page-kicker">${hall.label}</div>
        <h1>${title}</h1>
        <p>${displaySubtitle}</p>
      </div>
      <div class="platform-hall-media">
        <img src="${hall.image}" alt="">
      </div>
    </section>
  `;
}

function homeStat(label, value, note) {
  return `
    <article class="home-stat-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${note}</p>
    </article>
  `;
}

function homeCarouselSlides(activities) {
  const secondHalf114 = activities.filter((activity) => activity.year === "114" && hasSecondHalfDate(activity.date));
  const source = secondHalf114.length ? secondHalf114 : activities.filter((activity) => activity.year === "114");
  return source
    .filter((activity) => activity.cover && activity.cover !== PLACEHOLDER)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 10)
    .map((activity) => ({
      image: activity.cover,
      title: activity.name,
      meta: `${activity.year} 年・${activity.districts.join("、") || activity.topic || "活動成果"}`,
    }));
}

function hasSecondHalfDate(dateText) {
  const months = String(dateText || "")
    .match(/(?:^|[^\d])(1[0-2]|[1-9])\s*(?=\/|月)/g)
    ?.map((item) => Number(item.match(/\d+/)?.[0])) || [];
  return months.some((month) => month >= 7 && month <= 12);
}

function heroPhotoCarousel(slides) {
  const items = slides.length
    ? slides
    : [{ image: "public/images/activities/112-014/cover.jpg", title: "地方走讀活動照片", meta: "112-115 年活動成果" }];
  return `
    <div class="hero-photo-panel hero-photo-carousel" aria-label="活動照片輪播">
      <div class="hero-carousel-stage">
        ${items
          .map(
            (item, index) => `
              <figure class="hero-carousel-slide ${index === 0 ? "active" : ""}">
                <img src="${item.image}" alt="${item.title}">
                <figcaption>
                  <span>${item.meta}</span>
                  <strong>${item.title}</strong>
                </figcaption>
              </figure>
            `
          )
          .join("")}
      </div>
      <div class="hero-carousel-dots" aria-hidden="true">
        ${items.map((_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("")}
      </div>
      <p class="hero-carousel-note">用活動、課程與地方故事，保存社大走進地方的四年軌跡。</p>
    </div>
  `;
}

function limitedCategoryList(items, renderItem, className, label) {
  const limit = 6;
  const id = `category-list-${Math.random().toString(36).slice(2)}`;
  const hiddenCount = Math.max(0, items.length - limit);
  return `
    <div id="${id}" class="category-list ${className} limited-category-list">
      ${items
        .map((item, index) => {
          const hiddenClass = index >= limit ? " mobile-collapsed-item" : "";
          return `<div class="category-list-item${hiddenClass}">${renderItem(item)}</div>`;
        })
        .join("")}
    </div>
    ${
      hiddenCount
        ? `<button class="category-expand-button" type="button" data-expand-target="${id}" data-label="${label}" data-hidden-count="${hiddenCount}">
            展開全部 ${label}（${items.length}）
          </button>`
        : ""
    }
  `;
}

function initCategoryExpanders() {
  document.querySelectorAll(".category-expand-button").forEach((button) => {
    button.addEventListener("click", () => {
      const list = document.getElementById(button.dataset.expandTarget);
      if (!list) return;
      const expanded = list.classList.toggle("expanded");
      button.textContent = expanded
        ? `收合${button.dataset.label}`
        : `展開全部 ${button.dataset.label}（${Number(button.dataset.hiddenCount) + 6}）`;
    });
  });
}

function initHomeCarousel() {
  const panel = document.querySelector(".hero-photo-carousel");
  if (!panel) return;
  const slides = [...panel.querySelectorAll(".hero-carousel-slide")];
  const dots = [...panel.querySelectorAll(".hero-carousel-dots span")];
  if (slides.length <= 1) return;
  let index = 0;
  homeCarouselTimer = window.setInterval(() => {
    slides[index].classList.remove("active");
    dots[index]?.classList.remove("active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("active");
    dots[index]?.classList.add("active");
  }, 4000);
}

function stopHomeCarousel() {
  if (!homeCarouselTimer) return;
  window.clearInterval(homeCarouselTimer);
  homeCarouselTimer = null;
}

function portalCard(item) {
  return `
    <a class="portal-card" href="${item.href}">
      <span>${item.kicker}</span>
      <h2>${item.title}</h2>
      <p>${item.description}</p>
    </a>
  `;
}

function hasThemeValue(value) {
  if (Array.isArray(value)) return value.some((item) => hasThemeValue(item));
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim() !== "";
}

function getThemeActivities(theme) {
  if (!theme) return [];
  const ids = Array.isArray(theme.relatedActivityIds)
    ? theme.relatedActivityIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  const activityMap = new Map(getActivities().map((activity) => [activity.id, activity]));
  return ids.map((id) => {
    const activity = activityMap.get(id);
    if (!activity) {
      const warningKey = `${theme.id}:${id}`;
      if (!warnedMissingThemeActivityIds.has(warningKey)) {
        console.warn(`[主題館] 找不到活動 ID：${id}（主題：${theme.id}）`);
        warnedMissingThemeActivityIds.add(warningKey);
      }
    }
    return activity;
  }).filter(Boolean)
    .sort((a, b) => String(b.year).localeCompare(String(a.year)) || a.id.localeCompare(b.id));
}

function selectThemeActivityImageCandidates(theme, activities, preferredActivityIds = []) {
  const termsByTheme = {
    "wood-repair": ["木工", "木作", "修繕", "家具", "敏道"],
    "food-agriculture": ["食農", "農產", "農場", "田間", "農業", "加工"],
    "marine-education": ["海洋", "海線", "漁村", "釣魚", "海龜", "貝殼", "海岸", "漁業"],
    "local-culture": ["走讀", "廟宇", "老街", "老照片", "工藝", "文化", "信仰", "古蹟"],
    "environmental-education": ["河流", "赤蘭溪", "水環境", "生態", "埤塘", "走讀", "流域", "河川"],
  };
  const terms = termsByTheme[theme?.id] || [];
  const rankedActivities = activities
    .map((activity, index) => {
      const text = [
        activity.name,
        activity.topic,
        activity.keywords,
        activity.summary,
        activity.project,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        activity,
        index,
        preferredIndex: preferredActivityIds.indexOf(activity.id),
        score: terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0),
      };
    })
    .sort((a, b) => {
      const aPreferred = a.preferredIndex >= 0 ? a.preferredIndex : Number.MAX_SAFE_INTEGER;
      const bPreferred = b.preferredIndex >= 0 ? b.preferredIndex : Number.MAX_SAFE_INTEGER;
      return aPreferred - bPreferred || b.score - a.score || a.index - b.index;
    })
    .map(({ activity }) => activity);

  return unique(
    rankedActivities.flatMap((activity) =>
      [
        activity.cover,
        ...(Array.isArray(activity.photos) ? activity.photos : []),
      ].filter(hasThemeValue)
    )
  );
}

function selectThemeCoverCandidates(theme, activities) {
  const preferredActivityIdsByTheme = {
    "wood-repair": ["114-022", "113-002"],
  };
  return unique(
    [
      ...selectThemeActivityImageCandidates(
        theme,
        activities,
        preferredActivityIdsByTheme[theme?.id] || []
      ),
      hasThemeValue(theme?.coverImage) ? theme.coverImage : "",
      PLACEHOLDER,
    ].filter(hasThemeValue)
  );
}

function selectFeaturedThemeCoverCandidates(item, theme, activities) {
  const preferredActivityIdsByFeatured = {
    "sustainable-woodwork": ["114-022", "113-002"],
    "chilan-river-knowledge": ["114-016", "114-017", "114-033"],
    "coastal-learning": ["113-014", "114-026", "114-027", "114-031", "114-032"],
  };
  return unique(
    [
      ...selectThemeActivityImageCandidates(
        theme,
        activities,
        preferredActivityIdsByFeatured[item?.id] || []
      ),
      hasThemeValue(item?.coverImage) ? item.coverImage : "",
      hasThemeValue(theme?.coverImage) ? theme.coverImage : "",
      PLACEHOLDER,
    ].filter(hasThemeValue)
  );
}

function enrichThemeWithActivities(theme, activities) {
  const years = unique(activities.map((activity) => activity.year).filter(Boolean))
    .sort((a, b) => String(b).localeCompare(String(a)));
  const townships = unique(activities.flatMap((activity) => activity.districts).filter(Boolean));
  const sdgs = unique(activities.flatMap((activity) => activity.sdgs).filter(Boolean))
    .sort((a, b) => sdgNumber(a) - sdgNumber(b));
  const photos = unique(
    activities.flatMap((activity) => [activity.cover, ...activity.photos]).filter(Boolean)
  ).slice(0, 9);
  return {
    ...theme,
    relatedYears: years,
    relatedTownships: townships,
    sdgs,
    relatedPhotos: photos,
  };
}

function renderThemeTags(tags) {
  const items = Array.isArray(tags) ? tags.filter(hasThemeValue) : [];
  if (!items.length) return "";
  return `<div class="theme-tags">${items.map((tag) => `<span>${tag}</span>`).join("")}</div>`;
}

function renderThemeBannerMeta(activities, theme) {
  const items = [];
  if (activities.length) items.push(`<span><strong>${activities.length}</strong> 項正式成果</span>`);
  if (hasThemeValue(theme.relatedYears)) {
    items.push(`<span><small>相關年度</small>${theme.relatedYears.join("、")}</span>`);
  }
  if (hasThemeValue(theme.relatedTownships)) {
    items.push(`<span><small>相關鄉鎮</small>${theme.relatedTownships.join("、")}</span>`);
  }
  const sdgs = Array.isArray(theme.sdgs) ? theme.sdgs.filter(hasThemeValue) : [];
  const sdgMarkup = sdgs.length
    ? `<div class="theme-banner-sdgs">${sdgs.map((sdg) => `<span>${sdg}</span>`).join("")}</div>`
    : "";
  if (!items.length && !sdgMarkup) return "";
  return `<div class="theme-banner-meta">${items.join("")}${sdgMarkup}</div>`;
}

function themeArchiveCard(item, activities = []) {
  if (!item || !hasThemeValue(item.title) || !hasThemeValue(item.id)) return "";
  const resultCount = activities.length;
  const cardCover = activities[0]?.cover || item.coverImage;
  return `
    <article class="theme-archive-card">
      <a class="theme-card-media" href="#/themes/${item.id}" aria-label="進入${item.title}主題">
        ${
          hasThemeValue(cardCover)
            ? `<img src="${cardCover}" alt="">`
            : `<span class="theme-card-placeholder" aria-hidden="true"></span>`
        }
        ${hasThemeValue(item.icon) ? `<span class="theme-card-icon" aria-hidden="true">${item.icon}</span>` : ""}
      </a>
      <div class="theme-card-body">
        <div class="theme-card-meta">
          ${resultCount ? `<span>成果已串接</span>` : hasThemeValue(item.status) ? `<span>${item.status}</span>` : ""}
          ${resultCount ? `<strong>${resultCount} 項相關成果</strong>` : ""}
        </div>
        <h3>${item.title}</h3>
        ${hasThemeValue(item.description) ? `<p>${item.description}</p>` : ""}
        ${renderThemeTags(item.tags)}
        <a class="button secondary" href="#/themes/${item.id}">進入主題</a>
      </div>
    </article>
  `;
}

function featuredThemeCard(item, themes = []) {
  if (!item || !hasThemeValue(item.title) || !hasThemeValue(item.themeId)) return "";
  const theme = themes.find((candidate) => candidate.id === item.themeId);
  const activities = theme ? getThemeActivities(theme) : [];
  const resultCount = activities.length;
  const coverCandidates = theme
    ? selectFeaturedThemeCoverCandidates(item, theme, activities)
    : unique([item.coverImage, PLACEHOLDER].filter(hasThemeValue));
  const cover = coverCandidates[0] || PLACEHOLDER;
  const coverFallbacks = coverCandidates.slice(1).join("|");
  return `
    <a class="featured-theme-card" href="#/themes/${item.themeId}">
      <img src="${cover}" data-image-fallbacks="${coverFallbacks}" alt="${item.title}精選主題圖片">
      <div class="featured-theme-overlay">
        ${hasThemeValue(item.badge) ? `<span>${item.badge}</span>` : ""}
        <h3>${item.title}</h3>
        ${hasThemeValue(item.description) ? `<p>${item.description}</p>` : ""}
        ${resultCount ? `<strong>${resultCount} 項正式成果</strong>` : ""}
      </div>
    </a>
  `;
}

function renderThemeTextPanel(title, content) {
  if (!hasThemeValue(content)) return "";
  return `
    <article class="theme-detail-panel">
      <h2>${title}</h2>
      <p>${content}</p>
    </article>
  `;
}

function renderThemeMeta(item) {
  const fields = [
    ["相關年度", item.relatedYears],
    ["相關鄉鎮", item.relatedTownships],
  ].filter(([, value]) => hasThemeValue(value));
  if (!fields.length) return "";
  return `
    <section class="theme-detail-section theme-meta-section">
      <h2>主題範圍</h2>
      <dl class="theme-meta-list">
        ${fields.map(([label, values]) => `
          <div>
            <dt>${label}</dt>
            <dd>${values.filter(hasThemeValue).map((value) => `<span>${value}</span>`).join("")}</dd>
          </div>
        `).join("")}
      </dl>
    </section>
  `;
}

function renderThemeListSection(title, values, className) {
  const items = Array.isArray(values) ? values.filter(hasThemeValue) : [];
  if (!items.length) return "";
  return `
    <section class="theme-detail-section">
      <h2>${title}</h2>
      <ul class="${className}">
        ${items.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderThemeRepresentativeResults(activities) {
  if (!Array.isArray(activities) || !activities.length) return "";
  return `
    <section class="theme-detail-section">
      <h2>代表成果</h2>
      <div class="theme-representative-grid">
        ${activities.map((activity) => {
          const townships = activity.districts?.filter(Boolean).join("、");
          const content = `
            <h3>${activity.name}</h3>
            <div class="theme-representative-meta">
              ${hasThemeValue(activity.year) ? `<span>${activity.year} 年</span>` : ""}
              ${hasThemeValue(townships) ? `<span>${townships}</span>` : ""}
            </div>
            <strong>查看成果 →</strong>
          `;
          return hasThemeValue(activity.id)
            ? `<a class="theme-representative-card" href="#/overview/activity/${encodeURIComponent(activity.id)}/${activity.year || ""}">${content}</a>`
            : `<article class="theme-representative-card">${content}</article>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderThemeActivitySection(activities) {
  if (!Array.isArray(activities) || !activities.length) {
    return `
      <section class="theme-detail-section theme-empty-state">
        <h2>相關活動</h2>
        <p>內容建置中</p>
      </section>
    `;
  }
  return `
    <section class="theme-detail-section">
      <div class="theme-related-heading">
        <h2>相關活動</h2>
        <div>
          <span>${activities.length} 項</span>
          <small>依年度由新到舊排列</small>
        </div>
      </div>
      <div class="activity-mini-grid theme-related-activity-grid">
        ${activities.map(themeActivityCard).join("")}
      </div>
    </section>
  `;
}

function themeActivityCard(activity) {
  if (!activity || !hasThemeValue(activity.id) || !hasThemeValue(activity.name)) return "";
  const meta = [
    activity.year ? `${activity.year} 年` : "",
    activity.districts?.length ? activity.districts.join("、") : "",
  ].filter(hasThemeValue);
  return `
    <a class="theme-activity-card" href="#/overview/activity/${encodeURIComponent(activity.id)}/${activity.year || ""}">
      ${
        hasThemeValue(activity.cover)
          ? `<img src="${activity.cover}" alt="${activity.name}封面照片">`
          : ""
      }
      <div class="theme-activity-card-body">
        ${meta.length ? `<div class="theme-activity-meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
        <h3>${activity.name}</h3>
        ${
          hasThemeValue(activity.type) || hasThemeValue(activity.topic)
            ? `<div class="theme-activity-classification">
                ${hasThemeValue(activity.type) ? `<span>${activity.type}</span>` : ""}
                ${hasThemeValue(activity.topic) ? `<span>${activity.topic}</span>` : ""}
              </div>`
            : ""
        }
        ${hasThemeValue(activity.summary) ? `<p>${activity.summary}</p>` : ""}
        ${renderThemeTags(activity.sdgs)}
      </div>
    </a>
  `;
}

function renderThemePhotoSection(photos, title) {
  const items = Array.isArray(photos) ? photos.filter(hasThemeValue) : [];
  if (!items.length) return "";
  return `
    <section class="theme-detail-section">
      <h2>相關照片</h2>
      <div class="theme-photo-grid">
        ${items.map((photo) => `<img src="${photo}" alt="${title}相關照片">`).join("")}
      </div>
    </section>
  `;
}

function digitalTourCard(item) {
  return `
    <a class="digital-tour-card" href="#/digital/${item.slug}">
      <img src="${item.image || PLACEHOLDER}" alt="${item.title}">
      <div>
        <span>Digital Walk</span>
        <h2>${item.title}</h2>
        <p>${item.description}</p>
      </div>
    </a>
  `;
}

function podcastCard(item, index) {
  return `
    <article class="podcast-card">
      <img src="${item.image || PLACEHOLDER}" alt="${item.title}速寫圖">
      <div class="podcast-card-body">
        <span>EP. ${String(index + 1).padStart(2, "0")}</span>
        <h2>${item.title}</h2>
        <p>${item.description}</p>
        ${
          item.audio
            ? `<audio controls preload="metadata"><source src="${item.audio}" type="audio/mpeg">您的瀏覽器不支援音訊播放。</audio>`
            : `<div class="audio-placeholder">Podcast 音檔待補</div>`
        }
      </div>
    </article>
  `;
}

function clubCard(item) {
  return `
    <a class="club-card" href="#/clubs/${item.slug}">
      <div class="club-number">${String(siteData.clubs.indexOf(item) + 1).padStart(2, "0")}</div>
      <div>
        <h2>${item.title}</h2>
        <p>${item.description}</p>
      </div>
      <span>查看社團記錄</span>
    </a>
  `;
}

function showcaseCard(item, index) {
  const sampleImages = [
    "public/images/activities/112-002/cover.jpg",
    "public/images/activities/112-004/cover.jpg",
    "public/images/activities/112-009/cover.jpg",
    "public/images/activities/112-006/cover.jpg",
    "public/images/activities/112-003/cover.jpg",
    "public/images/activities/112-015/cover.jpg",
  ];
  return `
    <article class="showcase-card">
      <img src="${sampleImages[index] || PLACEHOLDER}" alt="${item.title}">
      <div>
        <h2>${item.title}</h2>
        <p>${item.description}</p>
      </div>
    </article>
  `;
}

function getYearMetrics(activities) {
  return {
    activities: activities.length,
    districts: groupActivitiesByDistrict(activities).length,
    sdgs: groupActivitiesBySdg(activities).length,
    participants: activities.reduce((sum, activity) => sum + activity.participants, 0),
  };
}

function yearOverviewCard(year, allActivities) {
  const activities = allActivities.filter((activity) => activity.year === year);
  const metrics = getYearMetrics(activities);
  return `
    <article class="year-overview-card ${activities.length ? "has-data" : ""}">
      <div class="year-card-heading">
        <span>${year}</span>
        <strong>年度成果</strong>
      </div>
      <dl class="year-card-metrics">
        <div><dt>活動件數</dt><dd>${metrics.activities} 件</dd></div>
        <div><dt>服務地區數</dt><dd>${metrics.districts} 區</dd></div>
        <div><dt>對應 SDGs 數</dt><dd>${metrics.sdgs} 項</dd></div>
        <div><dt>總參與人次</dt><dd>${formatNumber(metrics.participants)} 人次</dd></div>
      </dl>
      <a href="#/overview/year/${year}">查看年度成果</a>
    </article>
  `;
}

function dashboardMetric(label, value, unit) {
  return `
    <article class="dashboard-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${unit}</small>
    </article>
  `;
}

function filterPill(label, count, type, value, active = false) {
  return `
    <button
      class="filter-pill ${active ? "active" : ""}"
      type="button"
      data-filter-${type}="${value}"
      aria-pressed="${active}"
    >
      <span>${label}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function sdgFilterButton(label, count, value, active = false, extra = false) {
  return `
    <button
      class="sdg-filter-button ${active ? "active" : ""} ${extra ? "is-extra" : ""} ${value ? "" : "no-icon"}"
      type="button"
      data-filter-sdg="${value}"
      aria-pressed="${active}"
    >
      ${value ? `<img src="${sdgIconPath(value)}" alt="">` : ""}
      <span>${label}${value ? ` ${SDG_INFO[value] || ""}` : ""}</span>
      <strong>${count}</strong>
    </button>
  `;
}

function initYearOverviewFilters(activities) {
  const grid = document.querySelector("[data-year-activity-grid]");
  const count = document.querySelector("[data-filter-result-count]");
  const districtButtons = [...document.querySelectorAll("[data-filter-district]")];
  const sdgButtons = [...document.querySelectorAll("[data-filter-sdg]")];
  const sdgList = document.querySelector(".sdg-filter-list");
  const expandButton = document.querySelector("[data-expand-sdgs]");
  let selectedDistrict = "";
  let selectedSdg = "";

  function updateButtons(buttons, selectedValue, dataKey) {
    buttons.forEach((button) => {
      const active = button.dataset[dataKey] === selectedValue;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateActivities() {
    const filtered = activities.filter(
      (activity) =>
        (!selectedDistrict || activity.districts.includes(selectedDistrict)) &&
        (!selectedSdg || activity.sdgs.includes(selectedSdg))
    );
    count.textContent = `${filtered.length} 件`;
    grid.innerHTML = filtered.length
      ? filtered.map(activityMiniCard).join("")
      : `
        <div class="filter-empty-state">
          <h3>沒有符合條件的活動</h3>
          <p>請更換地區或 SDGs 條件，再查看其他活動成果。</p>
        </div>
      `;
    bindImageFallbacks();
  }

  districtButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.filterDistrict;
      selectedDistrict = value === selectedDistrict && value ? "" : value;
      updateButtons(districtButtons, selectedDistrict, "filterDistrict");
      updateActivities();
    });
  });

  sdgButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.filterSdg;
      selectedSdg = value === selectedSdg && value ? "" : value;
      updateButtons(sdgButtons, selectedSdg, "filterSdg");
      updateActivities();
    });
  });

  if (expandButton && sdgList) {
    expandButton.addEventListener("click", () => {
      const expanded = sdgList.classList.toggle("expanded");
      expandButton.setAttribute("aria-expanded", String(expanded));
      expandButton.textContent = expanded ? "收合 SDGs" : "展開更多 SDGs";
    });
  }
}

function yearStatusPill(year, activities) {
  const count = activities.filter((activity) => activity.year === year).length;
  return `
    <div class="year-status ${count ? "ready" : ""}">
      <strong>${year} 年</strong>
      <span>${count ? `${count} 件活動已匯入` : "資料待補"}</span>
    </div>
  `;
}

function areaCategoryCard(district, items, year = "112") {
  return `
    <a class="category-card area-category" href="#/overview/areas/${encodeURIComponent(district)}/${year}">
      <span>${district}</span>
      <strong>${items.length} 件</strong>
    </a>
  `;
}

function sdgCategoryCard(sdg, items, year = "112") {
  return `
    <a class="category-card sdg-category" href="#/overview/sdgs/${encodeURIComponent(sdg)}/${year}">
      <img src="${sdgIconPath(sdg)}" alt="${sdg} icon">
      <span>${sdg}</span>
      <em>${SDG_INFO[sdg] || ""}</em>
      <strong>${items.length} 件</strong>
    </a>
  `;
}

function yearTab(type, id, year, selectedYear) {
  return `
    <a class="year-tab ${year === selectedYear ? "active" : ""}" href="#/overview/${type}/${encodeURIComponent(id)}/${year}">
      ${year}
    </a>
  `;
}

function activityMiniCard(activity) {
  const sdgTags = activity.sdgs.length
    ? `
        <div class="activity-sdg-tags">
          ${activity.sdgs.slice(0, 4).map((sdg) => `<span>${sdg}</span>`).join("")}
        </div>
      `
    : "";
  return `
    <a class="activity-mini-card" href="#/overview/activity/${encodeURIComponent(activity.id)}/${activity.year}">
      <img src="${activity.cover}" alt="${activity.name}">
      <div class="mini-card-body">
        <div class="activity-meta-line">
          <span>${activity.date || activity.year}</span>
          <strong>${activity.districts.join("、") || "地區待補"}</strong>
        </div>
        <h2>${activity.name}</h2>
        ${sdgTags}
      </div>
    </a>
  `;
}

function detailInfo(label, value) {
  const normalizedValue = normalizeDetailValue(value);
  if (!normalizedValue) return "";
  return `
    <div class="detail-info-row">
      <span>${label}</span>
      <strong>${normalizedValue}</strong>
    </div>
  `;
}

function normalizeDetailValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map(normalizeDetailValue)
      .filter(Boolean)
      .join("、");
  }
  const text = String(value).trim();
  if (!text) return "";
  const emptyMarkers = ["未填寫", "未填", "無", "null", "undefined", "n/a", "na", "-"];
  return emptyMarkers.includes(text.toLowerCase()) ? "" : text;
}

function combineDetailValues(...values) {
  return unique(
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map(normalizeDetailValue)
      .filter(Boolean)
  );
}

function emptyYearBlock(year) {
  return `
    <section class="empty-year-block">
      <h2>${year} 年資料待補</h2>
      <p>這個年度目前還沒有匯入活動資料。之後補上資料後，地區與 SDGs 分類會自動顯示相關活動、成果與照片。</p>
    </section>
  `;
}

function questionCard(item, index) {
  return `
    <article class="question-card" data-question="${index}">
      <h3>${index + 1}. ${item.question}</h3>
      <div class="answer-list">
        ${item.options
          .map(
            (option, optionIndex) => `
              <button type="button" data-answer="${optionIndex}" data-question-index="${index}">
                ${option}
              </button>
            `
          )
          .join("")}
      </div>
      <p class="answer-feedback" aria-live="polite"></p>
    </article>
  `;
}

function getActivities() {
  if (activityCache) return activityCache;
  activityCache = parseCsv(ACTIVITY_CSV)
    .map(normalizeActivity)
    .filter((activity) => activity.id && activity.name);
  return activityCache;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    return record;
  });
}

function normalizeActivity(record, index) {
  const id = pickField(record, ["活動ID", "id"]) || `activity-${index + 1}`;
  const districtText = pickField(record, ["鄉鎮市區", "地區"]) || "";
  const sdgText = pickField(record, ["對應SDGs", "SDGs", "SDG"]) || "";
  const photos = splitList(pickField(record, ["成果照片路徑", "照片路徑"]))
    .map((src) => normalizeImagePath(src, id))
    .filter(Boolean);
  const cover =
    normalizeImagePath(pickField(record, ["封面照片路徑", "封面照片"]), id) ||
    `public/images/activities/${id}/cover.jpg`;

  return {
    id,
    year: pickField(record, ["年度"]) || "112",
    name: pickField(record, ["活動名稱", "名稱"]) || "",
    date: pickField(record, ["活動日期", "日期"]) || "",
    districts: splitDistricts(districtText),
    place: pickField(record, ["活動地點", "地點"]) || "",
    project: pickField(record, ["計畫名稱", "計畫"]) || "",
    type: pickField(record, ["活動類型", "類型"]) || "",
    topic: pickField(record, ["活動主題", "主題"]) || "",
    keywords: pickField(record, ["成果關鍵字", "關鍵字", "keywords"]) || "",
    sdgs: parseSdgs(sdgText),
    summary: pickField(record, ["活動效益摘要", "效益摘要", "成果摘要"]) || "",
    participants: parseNumber(pickField(record, ["參與人次", "參與人數", "影響人次"])),
    cooperationUnits: pickField(record, ["合作單位", "cooperationUnits", "organizations"]) || "",
    partners: pickField(record, [
      "合作夥伴",
      "合作伙伴",
      "協力夥伴",
      "partners",
      "partner",
      "coPartners",
    ]) || "",
    leader: pickField(record, ["講師/帶領者", "講師", "帶領者"]) || "",
    cover,
    photos,
  };
}

function pickField(record, keys) {
  const key = keys.find((item) => Object.prototype.hasOwnProperty.call(record, item));
  return key ? record[key] : "";
}

function splitDistricts(value) {
  return unique(
    value
      .split(/[、,，/／;；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function splitList(value) {
  return value
    .split(/[\n;；,，|、]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSdgs(value) {
  const matches = value.match(/(?:SDG\s*)?0?(1[0-7]|[1-9])/gi) || [];
  return unique(
    matches
      .map((item) => Number(item.match(/(1[0-7]|[1-9])/)?.[1]))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((number) => `SDG ${number}`)
  );
}

function parseNumber(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeImagePath(src, id) {
  if (!src) return "";
  if (/^(https?:|data:)/.test(src)) return src;
  const clean = src.replace(/^\/+/, "");
  if (clean.startsWith("public/")) return clean;
  if (clean.startsWith("images/")) return `public/${clean}`;
  if (clean.includes("/")) return clean;
  return `public/images/activities/${id}/${clean}`;
}

function groupActivitiesByDistrict(activities) {
  const groups = new Map();
  activities.forEach((activity) => {
    activity.districts.forEach((district) => {
      if (!groups.has(district)) groups.set(district, []);
      groups.get(district).push(activity);
    });
  });
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hant"));
}

function groupActivitiesBySdg(activities) {
  const groups = new Map();
  activities.forEach((activity) => {
    activity.sdgs.forEach((sdg) => {
      if (!groups.has(sdg)) groups.set(sdg, []);
      groups.get(sdg).push(activity);
    });
  });
  return [...groups.entries()].sort((a, b) => sdgNumber(a[0]) - sdgNumber(b[0]));
}

function sdgNumber(sdg) {
  return Number(sdg.match(/\d+/)?.[0] || 0);
}

function sdgIconPath(sdg) {
  return `${SDG_ICON_BASE}/${sdgNumber(sdg)}.png`;
}

function unique(values) {
  return [...new Set(values)];
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-Hant");
}

function handleAnswer(event) {
  const button = event.currentTarget;
  const questionIndex = Number(button.dataset.questionIndex);
  const answerIndex = Number(button.dataset.answer);
  const question = siteData.chilan.questions[questionIndex];
  const card = button.closest(".question-card");
  const feedback = card.querySelector(".answer-feedback");

  card.querySelectorAll("button").forEach((item) => {
    item.disabled = true;
  });
  if (answerIndex === question.answer) {
    feedback.textContent = "答對了，獲得 10 點！";
    feedback.className = "answer-feedback correct";
    if (!gameState.answered.has(questionIndex)) {
      gameState.points += 10;
      gameState.answered.add(questionIndex);
    }
  } else {
    feedback.textContent = `再想想，正確答案是「${question.options[question.answer]}」。`;
    feedback.className = "answer-feedback wrong";
  }
  document.querySelector("#point-count").textContent = gameState.points;
}

function summonChiling() {
  window.open(siteData.chilan.arUrl, "_blank", "noopener,noreferrer");
}

function slugFromHref(href) {
  return href.split("/").pop();
}

function bindImageFallbacks() {
  document.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      const fallbacks = (image.dataset.imageFallbacks || "")
        .split("|")
        .map((path) => path.trim())
        .filter(Boolean);
      const next = fallbacks.shift();
      image.dataset.imageFallbacks = fallbacks.join("|");
      if (next) {
        image.src = next;
      } else if (!image.src.endsWith("placeholder.svg")) {
        image.src = PLACEHOLDER;
      }
    });
  });
}
