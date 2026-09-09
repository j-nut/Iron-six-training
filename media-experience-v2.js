(() => {
  if(window.__ironSixMediaExperienceV2Loaded)return;
  window.__ironSixMediaExperienceV2Loaded=true;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function style(){if(document.getElementById('mediaExperienceV2Style'))return;const s=document.createElement('style');s.id='mediaExperienceV2Style';s.textContent=`
    .motion-demo{margin:8px 0}.motion-stage.composite{aspect-ratio:auto;max-width:none}.motion-stage.composite img{position:static;height:auto;width:100%}.motion-stage.composite a{display:block}.motion-stage{position:relative;aspect-ratio:1/1;max-width:260px;border-radius:14px;overflow:hidden;background:var(--surface2);border:1px solid var(--line)}.motion-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s ease}.motion-stage img:first-child{opacity:1}.motion-demo.playing .motion-stage img:first-child{animation:ironStart 2.6s infinite}.motion-demo.playing .motion-stage img:last-child{animation:ironEnd 2.6s infinite}.motion-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:5px}.motion-actions{display:flex;gap:7px;align-items:center;margin-top:7px}.motion-toggle{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:750}.motion-toggle.active{border-color:var(--accent)}.media-form-cues{font-size:11px;color:var(--muted);line-height:1.45;margin-top:7px}.media-coverage-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;font-size:10px;color:var(--muted);margin-top:6px}@keyframes ironStart{0%,40%{opacity:1}50%,90%{opacity:0}100%{opacity:1}}@keyframes ironEnd{0%,40%{opacity:0}50%,90%{opacity:1}100%{opacity:0}}@media(prefers-reduced-motion:reduce){.motion-demo.playing .motion-stage img{animation:none!important}.motion-demo.playing .motion-stage img:last-child{opacity:1}.motion-demo.playing .motion-stage img:first-child{opacity:0}}
  `;document.head.appendChild(s)}
  function cues(name){const x=String(name||'').toLowerCase();if(/squat|lunge|split squat/.test(x))return 'Brace before the descent · keep the whole foot planted · drive through a stable knee path.';if(/deadlift|romanian|good morning|hinge/.test(x))return 'Brace first · push the hips back · keep the load close and finish tall without leaning back.';if(/bench|press|push-up|push up/.test(x))return 'Set the shoulders · control the lowering phase · keep wrists stacked and finish without losing position.';if(/row|pulldown|pull-up|pull up/.test(x))return 'Start from a stable torso · pull with the elbows · pause briefly without shrugging.';if(/curl/.test(x))return 'Keep the upper arm quiet · use a full controlled range · avoid swinging.';if(/triceps|extension|skull/.test(x))return 'Keep the upper arm stable · control the stretch · extend without flaring excessively.';return 'Move through a controlled range · keep the prescribed tempo · stop if the movement causes sharp or worsening pain.'}
  function demo(name,media,compact){
    if(!media||!Array.isArray(media.frames)||!media.frames.length)return '';
    const composite=media.layout==='composite';
    const size=composite&&media.width&&media.height?` width="${esc(media.width)}" height="${esc(media.height)}"`:'';
    // A composite packs three phases into one frame, so on a phone the detail is small. It gets
    // an explicit tap-to-enlarge rather than relying on the reader to pinch a background image.
    const credit=media.author==='Iron Six'?'Iron Six original':`${esc(name)} · ${esc(media.license||'licensed media')}`;
    if(media.frames.length===1){
      const shot=`<img style="opacity:1" src="${esc(media.frames[0])}"${size} alt="${esc(name)}${composite?' — start, midpoint and finish positions':' position'}" loading="lazy" decoding="async">`;
      const stage=composite?`<a href="${esc(media.frames[0])}" target="_blank" rel="noopener noreferrer" aria-label="Enlarge the ${esc(name)} form guide">${shot}</a>`:shot;
      return `<figure class="exercise-media ${compact?'compact':''}"><div class="motion-stage${composite?' composite':''}">${stage}</div><figcaption>${credit}</figcaption><div class="media-form-cues">${esc(cues(name))}</div></figure>`;
    }
    return `<figure class="exercise-media ${compact?'compact':''} motion-demo" data-motion-demo><div class="motion-stage">${media.frames.slice(0,2).map((src,i)=>`<img src="${esc(src)}" alt="${esc(name)} — ${i?'finish':'start'} position" loading="lazy" decoding="async">`).join('')}</div><div class="motion-labels"><span>Start</span><span>Finish</span></div><div class="motion-actions"><button type="button" class="motion-toggle" data-motion-toggle>Auto demo</button><span class="media-coverage-chip">2-position exact movement</span></div><div class="media-form-cues">${esc(cues(name))}</div><figcaption>${esc(name)} · <a href="${esc(media.source)}" target="_blank" rel="noopener noreferrer">${esc(media.author)}</a> · <a href="${esc(media.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(media.license)}</a></figcaption></figure>`;
  }
  style();
  const prior=window.IronSixMediaView?.gallery;
  if(prior&&(window.IronSixMediaResolver?.legacyShape||window.IronSixExerciseMedia?.resolve)){
    window.IronSixMediaView.gallery=function(exercise,{compact=false}={}){
      return String(exercise?.name||'').split(' + ').map(name=>{
        // Resolver first so first-party art outranks legacy art and any substitution keeps
        // its label; the catalogue stays as a fallback if the resolver is unavailable.
        const media=window.IronSixMediaResolver?.legacyShape?.(name)||window.IronSixExerciseMedia?.resolve?.(name);
        if(!media)return prior({name},{compact});
        const notice=media.label?'<p class="media-variant">'+String(media.label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</p>':'';
        const variant=/paused|tempo/i.test(name)?'<p class="media-variant">Standard movement shown. Follow the prescribed pause or tempo.</p>':'';
        return demo(name,media,compact)+notice+variant;
      }).join('');
    };
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-motion-toggle]');if(!b)return;const root=b.closest('[data-motion-demo]');const on=root.classList.toggle('playing');b.classList.toggle('active',on);b.textContent=on?'Pause demo':'Auto demo'});
  function coverage(exercises){const names=[...new Set((exercises||[]).flatMap(x=>String(x.name||'').split(' + ')))];const covered=names.filter(n=>window.IronSixMediaResolver?.legacyShape?.(n)||window.IronSixExerciseMedia?.resolve?.(n));return {total:names.length,covered:covered.length,missing:names.filter(n=>!window.IronSixExerciseMedia?.resolve?.(n)),pct:names.length?Math.round(covered.length/names.length*100):100}}
  window.IronSixMediaV2={coverage,cues};
})();
