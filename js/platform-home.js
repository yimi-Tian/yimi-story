(function () {
  "use strict";

  const DATA_URL = "data/platform-home.json";
  const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "日期待公布";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
  }

  function renderHero(hero) {
    const slides = hero.slides.map((slide, index) => `
      <figure class="hero-slide${index === 0 ? " active" : ""}" data-slide="${index}">
        <img src="${escapeHtml(slide.image)}" alt="${escapeHtml(slide.alt)}"${index === 0 ? "" : ' loading="lazy"'}>
        <figcaption>${escapeHtml(slide.caption)}</figcaption>
      </figure>
    `).join("");

    document.querySelector("#hero").innerHTML = `
      <div class="hero-media">${slides}</div>
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <p class="hero-slogan">${escapeHtml(hero.slogan)}</p>
        <h1>${escapeHtml(hero.platformName)}</h1>
        <p class="hero-intro">${escapeHtml(hero.intro)}</p>
        <a class="button button-primary" href="${escapeHtml(hero.buttonHref)}">${escapeHtml(hero.buttonText)}</a>
      </div>
      <div class="hero-controls" aria-label="輪播控制">
        ${hero.slides.map((_, index) => `
          <button type="button" data-slide-target="${index}" class="${index === 0 ? "active" : ""}" aria-label="顯示第 ${index + 1} 張圖片"></button>
        `).join("")}
      </div>
    `;

    let current = 0;
    let timer;
    const slideElements = [...document.querySelectorAll(".hero-slide")];
    const controls = [...document.querySelectorAll("[data-slide-target]")];

    function showSlide(index) {
      current = index;
      slideElements.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === index));
      controls.forEach((control, controlIndex) => {
        control.classList.toggle("active", controlIndex === index);
        control.setAttribute("aria-current", controlIndex === index ? "true" : "false");
      });
    }

    function startCarousel() {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      window.clearInterval(timer);
      timer = window.setInterval(() => showSlide((current + 1) % slideElements.length), 5500);
    }

    controls.forEach((control) => {
      control.addEventListener("click", () => {
        showSlide(Number(control.dataset.slideTarget));
        startCarousel();
      });
    });
    startCarousel();
  }

  function renderHalls(halls) {
    document.querySelector(".hall-section").id = "halls";
    document.querySelector("#hall-grid").innerHTML = halls.map((hall) => `
      <a class="hall-card" href="${escapeHtml(hall.href)}">
        <span class="hall-icon" data-icon-slot aria-hidden="true">
          ${hall.iconSrc
            ? `<img src="${escapeHtml(hall.iconSrc)}" alt="">`
            : `<span>${escapeHtml(hall.icon)}</span>`}
        </span>
        <span>
          <strong>${escapeHtml(hall.name)}</strong>
          <small>${escapeHtml(hall.description)}</small>
        </span>
        <span class="card-arrow" aria-hidden="true">→</span>
      </a>
    `).join("");
  }

  function renderPlatformStats(stats) {
    const container = document.querySelector("#platform-results-grid");
    if (!container || !Array.isArray(stats)) return;
    container.innerHTML = stats.map((stat) => `
      <article class="platform-result-card">
        <div class="platform-result-value">
          <strong>${escapeHtml(stat.value)}</strong>
          <span>${escapeHtml(stat.unit)}</span>
        </div>
        <h3>${escapeHtml(stat.label)}</h3>
        ${stat.description ? `<p>${escapeHtml(stat.description)}</p>` : ""}
      </article>
    `).join("");
  }

  function renderFeaturedResults(results) {
    const container = document.querySelector("#featured-results-grid");
    if (!container || !Array.isArray(results)) return;
    const placeholder = "public/images/placeholder.svg";
    container.innerHTML = results.map((result) => `
      <a class="featured-result-card" href="${escapeHtml(result.link)}">
        <span class="featured-result-image">
          <img src="${escapeHtml(result.image || placeholder)}" alt="${escapeHtml(result.title)}" loading="lazy">
        </span>
        <span class="featured-result-body">
          <span class="featured-result-category">${escapeHtml(result.category)}</span>
          <strong>${escapeHtml(result.title)}</strong>
          <span class="featured-result-description">${escapeHtml(result.description)}</span>
          <span class="featured-result-link">查看成果 <span aria-hidden="true">→</span></span>
        </span>
      </a>
    `).join("");

    container.querySelectorAll("img").forEach((image) => {
      image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied === "true") return;
        image.dataset.fallbackApplied = "true";
        image.src = placeholder;
        image.alt = "圖片資料整理中";
      });
    });
  }

  function renderPlaces(places) {
    document.querySelector("#place-grid").innerHTML = places.map((place, index) => `
      <a href="${escapeHtml(place.href)}" style="--place-order:${index}">
        <span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        ${escapeHtml(place.name)}
      </a>
    `).join("");
  }

  function renderLatest(items) {
    const sortedItems = [...items]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);

    document.querySelector("#latest-grid").innerHTML = sortedItems.map((item, index) => `
      <article class="latest-card${index === 0 ? " featured" : ""}">
        <a class="latest-image" href="${escapeHtml(item.href)}">
          <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
        </a>
        <div class="latest-body">
          <div class="latest-meta">
            <span>${escapeHtml(item.type)}</span>
            <time datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time>
          </div>
          <h3><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></h3>
          <p>${escapeHtml(item.summary)}</p>
        </div>
      </article>
    `).join("");
  }

  function renderAbout(about) {
    const image = document.querySelector("#about-image");
    image.src = about.image;
    image.alt = about.imageAlt;
    document.querySelector("#about-text").textContent = about.text;
  }

  function renderStats(stats) {
    const normalizedStats = stats.map((stat) => (
      stat.label === "成果資料" && stat.value === "112–115"
        ? { ...stat, value: "4" }
        : stat
    ));
    document.querySelector("#stats-grid").innerHTML = normalizedStats.map((stat) => `
      <div class="stat-item">
        <strong>${escapeHtml(stat.value)}</strong>
        <span class="stat-unit">${escapeHtml(stat.unit)}</span>
        <span>${escapeHtml(stat.label)}</span>
      </div>
    `).join("");
  }

  function renderNews(news) {
    document.querySelector("#news-list").innerHTML = news.map((item) => `
      <a class="news-item" href="${escapeHtml(item.href)}">
        <time datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time>
        <span class="news-category">${escapeHtml(item.category)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span aria-hidden="true">→</span>
      </a>
    `).join("");
  }

  function setupNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector("#platform-nav");
    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("open", !isOpen);
    });
    nav.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
    });
  }

  function showError() {
    document.querySelector("#hero").innerHTML = `
      <div class="load-error">
        <h1>首頁資料暫時無法載入</h1>
        <p>請透過網站伺服器開啟 platform.html，或稍後重新整理頁面。</p>
      </div>
    `;
  }

  async function init() {
    setupNavigation();
    try {
      let data;
      if (window.location.protocol === "file:") {
        data = window.PLATFORM_HOME_DATA;
      } else {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
      }
      if (!data) throw new Error("Platform home data is unavailable");
      renderHero(data.hero);
      renderHalls(data.halls);
      renderPlatformStats(data.platformStats || data.stats);
      renderFeaturedResults(data.featuredResults || []);
      renderPlaces(data.places);
      renderLatest(data.latest);
      renderAbout(data.about);
      renderNews(data.news);
      document.querySelector("#last-updated").textContent = `最後更新：${formatDate(data.meta.lastUpdated)}`;
    } catch (error) {
      console.error("Platform home data failed to load:", error);
      showError();
    }
  }

  init();
})();
