// ===========================
// 検索フィルター
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const sections = document.querySelectorAll('.category-section');
  const noResults = document.getElementById('no-results');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    let totalVisible = 0;

    sections.forEach(section => {
      const cards = section.querySelectorAll('.link-card');
      let sectionVisible = 0;

      cards.forEach(card => {
        const label = card.querySelector('.card-label').textContent.toLowerCase();
        if (!query || label.includes(query)) {
          card.classList.remove('hidden');
          sectionVisible++;
        } else {
          card.classList.add('hidden');
        }
      });

      // カウンターを更新
      const countEl = section.querySelector('.category-count');
      if (countEl) {
        countEl.textContent = `${sectionVisible} 件`;
      }

      if (sectionVisible === 0) {
        section.classList.add('hidden');
      } else {
        section.classList.remove('hidden');
      }

      totalVisible += sectionVisible;
    });

    // 検索結果なしメッセージ
    if (totalVisible === 0 && query) {
      noResults.classList.add('visible');
    } else {
      noResults.classList.remove('visible');
    }
  });

  // ===========================
  // リップルエフェクト
  // ===========================
  document.querySelectorAll('.link-card').forEach(card => {
    card.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');

      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';

      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  // ===========================
  // 時計の更新
  // ===========================
  function updateClock() {
    const now = new Date();
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    };
    const formatted = now.toLocaleDateString('ja-JP', options)
      + ' ' + now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const clockEl = document.getElementById('header-clock');
    if (clockEl) {
      clockEl.textContent = formatted;
    }
  }

  updateClock();
  setInterval(updateClock, 30000);

  // ===========================
  // カード数の初期化
  // ===========================
  sections.forEach(section => {
    const cards = section.querySelectorAll('.link-card');
    const countEl = section.querySelector('.category-count');
    if (countEl) {
      countEl.textContent = `${cards.length} 件`;
    }
  });
});
