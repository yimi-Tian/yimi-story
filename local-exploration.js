(function () {
  const data = window.LOCAL_EXPLORATION_DATA;

  function topicCard(topic) {
    const content = `
      <img src="${topic.image}" alt="${topic.title}">
      <div class="exploration-card-body">
        <span>${topic.location}</span>
        <h2>${topic.title}</h2>
        <p>${topic.description}</p>
        <strong>${topic.status === "ready" ? "進入探索" : "資料建置中"}</strong>
      </div>
    `;
    return topic.status === "ready"
      ? `<a class="exploration-card" href="#/explore/${topic.slug}">${content}</a>`
      : `<article class="exploration-card planned" aria-label="${topic.title}，資料建置中">${content}</article>`;
  }

  function renderIndex() {
    const app = document.querySelector("#app");
    app.innerHTML = `
      ${pageHeader(data.title, data.description)}
      <section class="exploration-grid" aria-label="地方探索主題">
        ${data.topics.map(topicCard).join("")}
      </section>
    `;
  }

  function renderChilanAr(topic) {
    const app = document.querySelector("#app");
    app.innerHTML = `
      <section class="exploration-detail-head">
        <a class="text-link" href="#/explore">返回地方探索館</a>
        <div class="page-kicker">${topic.location}</div>
        <h1>${topic.title}</h1>
        <p>${topic.description}</p>
      </section>
      <section class="exploration-feature">
        <img src="${topic.image}" alt="${topic.title}">
        <div class="exploration-feature-copy">
          <span>Interactive Experience</span>
          <h2>跟著赤靈認識赤蘭溪</h2>
          <p>透過 AR 相機互動與流域闖關任務，從地方故事進入赤蘭溪的文化與生活記憶。</p>
          <ul>
            <li>赤靈角色引導</li>
            <li>AR 相機互動</li>
            <li>地方故事闖關</li>
          </ul>
          <a class="exploration-action" href="${topic.arUrl}" target="_blank" rel="noopener">${topic.actionText}</a>
        </div>
      </section>
      <p class="exploration-note">${topic.note}</p>
    `;
  }

  function renderPlanned(topic) {
    const app = document.querySelector("#app");
    app.innerHTML = `
      <section class="exploration-detail-head">
        <a class="text-link" href="#/explore">返回地方探索館</a>
        <div class="page-kicker">${topic.location}</div>
        <h1>${topic.title}</h1>
        <p>${topic.description}</p>
      </section>
      <section class="exploration-planned">
        <img src="${topic.image}" alt="">
        <div>
          <h2>主題資料建置中</h2>
          <p>後續可在獨立資料檔中加入主題介紹、圖片、站點、音檔、影片與外部互動連結。</p>
        </div>
      </section>
    `;
  }

  function render(detail) {
    if (!data) return;
    const topic = data.topics.find((item) => item.slug === detail);
    if (!topic) {
      renderIndex();
      return;
    }
    if (topic.slug === "chilan-ar") renderChilanAr(topic);
    else renderPlanned(topic);
  }

  window.LocalExploration = { render };
})();
