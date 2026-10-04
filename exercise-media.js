(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const videoFor = name => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' exercise form tutorial');

  function missing(name, failed = false) {
    const guide = window.IronSixExerciseGuide?.guideFor?.({name});
    const cues = (guide?.cues || []).slice(0, 2);
    return `<div class="exercise-media-missing${failed ? ' media-load-error' : ''}" data-exercise-name="${esc(name)}">`
      + '<span class="media-placeholder-icon" aria-hidden="true">▶</span>'
      + `<strong>${esc(name)}</strong><span>${failed ? 'Illustration could not load' : 'Illustration unavailable'}</span>`
      + `<a class="media-video-link" href="${esc(videoFor(name))}" target="_blank" rel="noopener noreferrer" aria-label="Search YouTube for ${esc(name)} form videos">Find form videos ↗</a>`
      + '<small>Opens YouTube search results</small>'
      + (cues.length ? `<div class="media-cues"><ul>${cues.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '')
      + '</div>';
  }

  function attribution(media) {
    if (!media) return '';
    if (media.author === 'Iron Six') return `<span class="media-credit">Iron Six original</span>`;
    const source = media.source ? `<a href="${esc(media.source)}" target="_blank" rel="noopener noreferrer">${esc(media.author)}</a>` : esc(media.author);
    const licence = media.licenseUrl ? `<a href="${esc(media.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(media.license)}</a>` : esc(media.license);
    return `<span class="media-credit">${source} · ${licence}</span>`;
  }

  function cueList(media) {
    if (!media || !media.cues || !media.cues.length) return '';
    const cues = media.cues.slice(0, 4).map(c => `<li>${esc(c)}</li>`).join('');
    const mistake = media.mistake ? `<p class="media-mistake"><b>Avoid:</b> ${esc(media.mistake)}</p>` : '';
    return `<div class="media-cues"><ul>${cues}</ul>${mistake}</div>`;
  }

  function one(name, resolved, compact) {
    if (!resolved.media || resolved.tier >= 4) return missing(name);
    const media = resolved.media;
    const notice0 = resolved.label ? `<p class="media-variant">${esc(resolved.label)}</p>` : '';
    // A tempo or paused variant reuses the standard movement's illustration, so the card has to
    // keep saying the prescription differs from what is pictured.
    const variant0 = /paused|tempo/i.test(name) ? `<p class="media-variant">Standard movement shown. Follow the prescribed pause or tempo.</p>` : '';
    // A composite illustration already contains every phase of the lift with its own labels
    // burned in. Splitting it across the two-up "Start / Finish" grid would show the same
    // picture twice at half width, so it gets one full-width frame and no phase caption.
    if (media.layout === 'composite') {
      const src = media.start;
      const size = media.width && media.height ? ` width="${esc(media.width)}" height="${esc(media.height)}"` : '';
      return `<figure class="exercise-media composite ${compact ? 'compact' : ''}" data-exercise-name="${esc(name)}" data-media-tier="${esc(resolved.tier)}" data-media-id="${esc(media.id)}">`
        + `<div class="exercise-media-frames composite">`
        + `<a href="${esc(src)}" target="_blank" rel="noopener" aria-label="Enlarge the ${esc(name)} form guide">`
        + `<img src="${esc(src)}" alt="${esc(name)} — start, midpoint and finish positions"${size} loading="lazy" decoding="async"></a></div>`
        + (compact ? '' : cueList(media))
        + `<figcaption>${notice0}${variant0}${attribution(media)}</figcaption></figure>`;
    }
    const frames = [media.start, media.finish].filter(Boolean);
    const shown = compact ? frames.slice(0, 1) : frames;
    const phase = ['Start', 'Finish'];
    // Anything below an exact match says so on the card. A near-miss shown without a label is
    // how someone ends up confidently practising the wrong movement.
    const notice = resolved.label ? `<p class="media-variant">${esc(resolved.label)}</p>` : '';
    const variant = /paused|tempo/i.test(name) ? `<p class="media-variant">Standard movement shown. Follow the prescribed pause or tempo.</p>` : '';
    const images = shown.map((src, i) => `<a href="${esc(src)}" target="_blank" rel="noopener" aria-label="Enlarge ${esc(name)} ${esc(phase[i] || 'position ' + (i + 1))}">`
      + `<img src="${esc(src)}" alt="${esc(name)} — ${esc(phase[i] || 'position ' + (i + 1))} position" loading="lazy" decoding="async" width="480" height="480">`
      + `<span>${esc(phase[i] || 'Position ' + (i + 1))}</span></a>`).join('');
    return `<figure class="exercise-media ${compact ? 'compact' : ''}" data-exercise-name="${esc(name)}" data-media-tier="${esc(resolved.tier)}" data-media-id="${esc(media.id)}">`
      + `<div class="exercise-media-frames">${images}</div>`
      + (compact ? '' : cueList(media))
      + `<figcaption>${notice}${variant}${attribution(media)}</figcaption></figure>`;
  }

  function gallery(exercise, { compact = false } = {}) {
    const name = String(exercise?.name || '');
    const resolver = window.IronSixMediaResolver;
    // Without the resolver the safest thing is an honest empty state, never a guess.
    if (!resolver) return missing(name);
    const resolved = resolver.resolve(name);
    // A superset needs a separate guide for each movement, never a generic arms image.
    if (resolved.superset) return resolved.parts.map(part => one(part.name, part, compact)).join('');
    return one(name, resolved, compact);
  }

  window.IronSixMediaView = { gallery };
  document.addEventListener('error', event => {
    const img = event.target; if (img.tagName !== 'IMG') return;
    const figure = img.closest('.exercise-media'); if (!figure) return;
    const name = figure.dataset.exerciseName;
    if (!name) return;
    const template = document.createElement('template');
    template.innerHTML = missing(name, true);
    figure.replaceWith(template.content);
  }, true);
})();
