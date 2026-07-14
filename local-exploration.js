(function () {
  const data = window.LOCAL_EXPLORATION_DATA || { modules: [], flow: [] };
  const PLACEHOLDER_IMAGE = "public/images/placeholder.svg";
  const missingActivityWarnings = new Set();
  const MODULE_IMAGE_ACTIVITY_IDS = {
    "chilan-river": ["114-016", "114-017", "114-033", "114-032"],
    "puzi-medical-culture": ["114-015"],
    "coastal-life": ["113-014", "114-026", "114-032"],
    "food-agriculture-place": ["114-021", "114-023", "114-008"],
  };

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some(hasValue);
    const text = String(value).trim();
    const lower = text.toLowerCase();
    return Boolean(text) && !["null", "undefined", "nan", "n/a", "na", "-"].includes(lower);
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(hasValue) : hasValue(value) ? [value] : [];
  }

  function unique(values) {
    return [...new Set(values.filter(hasValue))];
  }

  function getAllActivities() {
    return typeof window.getActivities === "function"
      ? window.getActivities()
      : typeof getActivities === "function"
        ? getActivities()
        : [];
  }

  function activitiesByIds(ids, contextId = "exploration") {
    const activityMap = new Map(getAllActivities().map((activity) => [activity.id, activity]));
    return list(ids)
      .map(String)
      .map((id) => {
        const activity = activityMap.get(id);
        if (!activity && !missingActivityWarnings.has(`${contextId}:${id}`)) {
          console.warn(`[地方探索館] 找不到活動 ID：${id}`);
          missingActivityWarnings.add(`${contextId}:${id}`);
        }
        return activity;
      })
      .filter(Boolean)
      .sort((a, b) => String(b.year).localeCompare(String(a.year)) || String(a.id).localeCompare(String(b.id)));
  }

  function activitiesForModule(module) {
    return activitiesByIds(module.relatedActivityIds || [], module.id);
  }

  function activityImageCandidates(activity) {
    if (!activity) return [];
    return [
      activity.cover,
      ...(Array.isArray(activity.photos) ? activity.photos : []),
    ].filter(hasValue);
  }

  function expandImageVariants(src) {
    if (!hasValue(src)) return [];
    const clean = String(src).trim();
    if (/^(https?:|data:)/.test(clean)) return [clean];
    const variants = [clean];
    const match = clean.match(/\.(jpe?g|png|webp)$/i);
    if (match) {
      const ext = match[1];
      variants.push(clean.replace(new RegExp(`\\.${ext}$`, "i"), `.${ext.toLowerCase()}`));
      variants.push(clean.replace(new RegExp(`\\.${ext}$`, "i"), `.${ext.toUpperCase()}`));
    }
    return unique(variants);
  }

  function imageCandidates(module, activities = []) {
    const preferredActivities = activitiesByIds(
      MODULE_IMAGE_ACTIVITY_IDS[module.id] || module.relatedActivityIds || [],
      module.id || "exploration-image"
    );
    return unique([
      ...preferredActivities.flatMap(activityImageCandidates),
      ...activities.flatMap(activityImageCandidates),
      module.coverImage,
      PLACEHOLDER_IMAGE,
    ].flatMap(expandImageVariants));
  }

  function imageHtml(srcList, alt, className = "") {
    const candidates = unique(list(srcList));
    const [src = PLACEHOLDER_IMAGE, ...fallbacks] = candidates.length ? candidates : [PLACEHOLDER_IMAGE];
    const fallbackAttr = unique([...fallbacks, PLACEHOLDER_IMAGE]).filter((path) => path !== src).join("|");
    return `<img${className ? ` class="${className}"` : ""} src="${src}" alt="${alt || ""}" data-image-fallbacks="${fallbackAttr}">`;
  }

  function pillList(items, extraClass = "") {
    const values = list(items);
    if (!values.length) return "";
    return `<div class="exploration-pill-list ${extraClass}">${values.map((item) => `<span>${item}</span>`).join("")}</div>`;
  }

  function statusPill(status) {
    if (!hasValue(status)) return "";
    const isPlanned = String(status).includes("規劃");
    return `<span class="exploration-status ${isPlanned ? "is-planned" : ""}">${status}</span>`;
  }

  function guidePointStatus(status) {
    const text = hasValue(status) ? status : "資料整理中";
    return `<span class="guide-point-status">狀態：${text}</span>`;
  }

  function renderIndex() {
    const app = document.querySelector("#app");
    const modules = list(data.modules);
    app.innerHTML = `
      <section class="platform-hall-banner exploration-hero">
        <div class="platform-hall-copy">
          <span class="section-label">LOCAL EXPLORATION</span>
          <h1>${data.title || "地方探索館"}</h1>
          ${hasValue(data.subtitle) ? `<p class="exploration-hero-slogan">${data.subtitle}</p>` : ""}
          ${hasValue(data.description) ? `<p>${data.description}</p>` : ""}
          <div class="theme-banner-actions">
            <button class="button" type="button" data-exploration-scroll="exploration-modules">開始探索</button>
            <button class="button secondary" type="button" data-exploration-scroll="exploration-flow">查看探索模組</button>
          </div>
        </div>
        <div class="platform-hall-media exploration-hero-media">
          ${imageHtml(imageCandidates({ id: "chilan-river", coverImage: "assets/images/platform-home/banner-river.jpg" }), "地方探索館主視覺")}
        </div>
      </section>

      <section id="exploration-modules" class="exploration-section" aria-labelledby="exploration-modules-title">
        <div class="theme-section-heading">
          <div>
            <span class="section-label">EXPLORATION MODULES</span>
            <h2 id="exploration-modules-title">探索模組</h2>
          </div>
          <p>第一版先建立赤蘭溪探索模組入口，其他地方主題作為後續擴充預留。</p>
        </div>
        <div class="exploration-module-grid">
          ${modules.map(moduleCard).join("")}
        </div>
      </section>

      ${renderFlowSection()}
    `;
    bindScrollButtons(app);
  }

  function moduleCard(module) {
    const activities = activitiesForModule(module);
    const isMain = module.id === "chilan-river";
    const href = module.route || `#/explore/${module.id}`;
    const content = `
      <div class="exploration-module-media">
        ${imageHtml(imageCandidates(module, activities), `${module.title}代表圖片`)}
        ${statusPill(module.status)}
      </div>
      <div class="exploration-module-body">
        <div class="exploration-module-kicker">${isMain ? "正式模組" : "未來擴充"}</div>
        <h3>${module.title}</h3>
        ${hasValue(module.subtitle) ? `<p class="exploration-module-subtitle">${module.subtitle}</p>` : ""}
        ${hasValue(module.description) ? `<p>${module.description}</p>` : ""}
        ${pillList(module.tags)}
        ${pillList(module.relatedThemes, "exploration-related-themes")}
        <span class="exploration-card-action">${isMain ? "進入模組" : "查看預留內容"} →</span>
      </div>
    `;
    return isMain
      ? `<a class="exploration-module-card is-featured" href="${href}">${content}</a>`
      : `<article class="exploration-module-card is-planned">${content}</article>`;
  }

  function renderFlowSection() {
    const flow = list(data.flow);
    if (!flow.length) return "";
    return `
      <section id="exploration-flow" class="exploration-section" aria-labelledby="exploration-flow-title">
        <div class="theme-section-heading">
          <div>
            <span class="section-label">HOW TO EXPLORE</span>
            <h2 id="exploration-flow-title">探索流程</h2>
          </div>
          <p>V1.0 先呈現地方探索模組未來的使用流程，完整互動功能會在後續階段逐步建置。</p>
        </div>
        <div class="exploration-flow-grid">
          ${flow.map((item, index) => `
            <article class="exploration-flow-card">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <h3>${item}</h3>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderModuleDetail(module) {
    const app = document.querySelector("#app");
    const activities = activitiesForModule(module);
    const detail = module.detailContent || {};
    app.innerHTML = `
      <div class="theme-detail-back exploration-detail-back">
        <a class="theme-back-link" href="#/explore">← 返回地方探索館</a>
      </div>
      <section class="platform-hall-banner exploration-detail-banner">
        <div class="platform-hall-copy">
          <span class="section-label">LOCAL MODULE</span>
          <h1>${module.title}</h1>
          ${hasValue(detail.slogan) ? `<p class="exploration-hero-slogan">${detail.slogan}</p>` : ""}
          ${hasValue(detail.intro) ? `<p>${detail.intro}</p>` : ""}
          <div class="exploration-meta-row">
            ${statusPill(module.status)}
            ${activities.length ? `<span>${activities.length} 項相關成果</span>` : ""}
            ${hasValue(module.arStatus) ? `<span>${module.arStatus}</span>` : ""}
          </div>
          ${pillList(module.tags)}
        </div>
        <div class="platform-hall-media exploration-detail-media">
          ${imageHtml(imageCandidates(module, activities), `${module.title}主圖`)}
        </div>
      </section>

      <section class="exploration-section exploration-intro-grid" aria-labelledby="exploration-intro-title">
        ${hasValue(detail.future) ? `
          <article class="exploration-panel">
            <span class="section-label">MODULE INTRO</span>
            <h2 id="exploration-intro-title">模組介紹</h2>
            <p>${detail.future}</p>
          </article>
        ` : ""}
        ${renderPreviewPanel(detail.preview)}
      </section>

      ${renderFlowSection()}
      ${renderGuidePoints(module.guidePoints)}
      ${renderArPanel(module)}
      ${renderRelatedThemes(module)}
      ${renderRelatedActivities(activities)}
    `;
  }

  function renderPreviewPanel(items) {
    const values = list(items);
    if (!values.length) return "";
    return `
      <article class="exploration-panel">
        <span class="section-label">NEXT BUILD</span>
        <h2>探索內容預告</h2>
        <ul class="exploration-check-list">
          ${values.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </article>
    `;
  }

  function renderGuidePoints(points) {
    const items = list(points);
    if (!items.length) return "";
    return `
      <section class="exploration-section" aria-labelledby="guide-points-title">
        <div class="theme-section-heading">
          <div>
            <span class="section-label">GUIDE POINTS</span>
            <h2 id="guide-points-title">導覽點預留區</h2>
          </div>
          <p>導覽點內容目前以「資料整理中」呈現，後續可逐步補入地圖、故事與任務。</p>
        </div>
        <div class="guide-point-grid">
          ${items.map((point) => `
            <article class="guide-point-card">
              ${hasValue(point.code) ? `<span>${point.code}</span>` : ""}
              <h3>${point.title}</h3>
              ${hasValue(point.description) ? `<p>${point.description}</p>` : ""}
              ${guidePointStatus(point.status)}
              <button class="button secondary" type="button" disabled>查看內容</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderArPanel(module) {
    const description = module.detailContent?.arDescription;
    if (!hasValue(description) && !hasValue(module.arStatus)) return "";
    return `
      <section class="exploration-section ar-placeholder" aria-labelledby="ar-placeholder-title">
        <div>
          <span class="section-label">AR EXPERIENCE</span>
          <h2 id="ar-placeholder-title">AR 體驗預留區</h2>
          ${hasValue(description) ? `<p>${description}</p>` : ""}
        </div>
        ${statusPill(module.arStatus)}
      </section>
    `;
  }

  function renderRelatedThemes(module) {
    const themes = list(module.relatedThemes);
    const ids = list(module.relatedThemeIds);
    if (!themes.length && !ids.length) return "";
    return `
      <section class="exploration-section" aria-labelledby="related-themes-title">
        <div class="theme-section-heading">
          <div>
            <span class="section-label">RELATED THEMES</span>
            <h2 id="related-themes-title">相關主題</h2>
          </div>
        </div>
        <div class="exploration-theme-link-grid">
          ${themes.map((themeName, index) => {
            const themeId = ids[index] || "";
            const href = themeId ? `#/themes/${themeId}` : "#/themes";
            return `<a class="exploration-theme-link" href="${href}">${themeName}<span>查看主題 →</span></a>`;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderRelatedActivities(activities) {
    if (!activities.length) {
      return `
        <section class="exploration-section theme-empty-state">
          <h2>相關成果活動</h2>
          <p>內容建置中</p>
        </section>
      `;
    }
    return `
      <section class="exploration-section" aria-labelledby="related-activities-title">
        <div class="theme-related-heading">
          <h2 id="related-activities-title">相關成果活動</h2>
          <div>
            <span>${activities.length} 項</span>
            <small>依年度由新到舊排列</small>
          </div>
        </div>
        <div class="activity-mini-grid theme-related-activity-grid">
          ${activities.map(activityCard).join("")}
        </div>
      </section>
    `;
  }

  function activityCard(activity) {
    if (typeof window.themeActivityCard === "function") return window.themeActivityCard(activity);
    if (typeof themeActivityCard === "function") return themeActivityCard(activity);
    const meta = [
      activity.year ? `${activity.year} 年` : "",
      activity.districts?.length ? activity.districts.join("、") : "",
    ].filter(hasValue);
    return `
      <a class="theme-activity-card" href="#/overview/activity/${encodeURIComponent(activity.id)}/${activity.year || ""}">
        ${imageHtml(activityImageCandidates(activity).flatMap(expandImageVariants), `${activity.name}封面照片`)}
        <div class="theme-activity-card-body">
          ${meta.length ? `<div class="theme-activity-meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
          <h3>${activity.name}</h3>
          ${
            hasValue(activity.type) || hasValue(activity.topic)
              ? `<div class="theme-activity-classification">
                  ${hasValue(activity.type) ? `<span>${activity.type}</span>` : ""}
                  ${hasValue(activity.topic) ? `<span>${activity.topic}</span>` : ""}
                </div>`
              : ""
          }
          ${hasValue(activity.summary) ? `<p>${activity.summary}</p>` : ""}
          ${Array.isArray(activity.sdgs) && activity.sdgs.length ? `<div class="theme-tags">${activity.sdgs.map((sdg) => `<span>${sdg}</span>`).join("")}</div>` : ""}
        </div>
      </a>
    `;
  }

  function renderPlanned(module) {
    const app = document.querySelector("#app");
    app.innerHTML = `
      <div class="theme-detail-back exploration-detail-back">
        <a class="theme-back-link" href="#/explore">← 返回地方探索館</a>
      </div>
      <section class="platform-hall-banner exploration-detail-banner">
        <div class="platform-hall-copy">
          <span class="section-label">PLANNED MODULE</span>
          <h1>${module.title}</h1>
          ${hasValue(module.subtitle) ? `<p class="exploration-hero-slogan">${module.subtitle}</p>` : ""}
          ${hasValue(module.description) ? `<p>${module.description}</p>` : ""}
          <div class="exploration-meta-row">${statusPill(module.status)}</div>
          ${pillList(module.tags)}
        </div>
        <div class="platform-hall-media exploration-detail-media">
          ${imageHtml(imageCandidates(module, []), `${module.title}代表圖片`)}
        </div>
      </section>
      <section class="exploration-section exploration-panel theme-empty-state">
        <h2>內容建置中</h2>
        <p>此探索模組目前為後續擴充預留，待資料整理完成後即可逐步加入導覽點、故事任務與互動內容。</p>
      </section>
    `;
  }

  function bindScrollButtons(scope) {
    scope.querySelectorAll("[data-exploration-scroll]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelector(`#${button.dataset.explorationScroll}`)?.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  function render(detail) {
    const modules = list(data.modules);
    if (!hasValue(detail)) {
      renderIndex();
      return;
    }
    const module = modules.find((item) =>
      item.id === detail ||
      (hasValue(item.slug) && item.slug === detail) ||
      list(item.aliases).includes(detail)
    );
    if (!module) {
      renderIndex();
      return;
    }
    if (module.id === "chilan-river") renderModuleDetail(module);
    else renderPlanned(module);
  }

  window.LocalExploration = { render };
})();
