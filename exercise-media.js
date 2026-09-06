(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function gallery(exercise,{compact=false}={}){
    // A superset needs a separate guide for each movement, never a generic arms image.
    return String(exercise.name||'').split(' + ').map(name=>{
      const media=window.IronSixExerciseMedia?.resolve(name);
      const video='https://www.youtube.com/results?search_query='+encodeURIComponent(name+' exercise form tutorial');
      if(!media)return `<div class="exercise-media-missing"><strong>${esc(name)}</strong><span>Exact illustration not yet available.</span><a href="${esc(video)}" target="_blank" rel="noopener noreferrer">Find a video demonstration ↗</a></div>`;
      const frames=compact?media.frames.slice(0,1):media.frames;
      const variant=/paused|tempo/i.test(name)?'<p class="media-variant">Standard movement shown. Follow the prescribed pause or tempo.</p>':'';
      return `<figure class="exercise-media ${compact?'compact':''}"><div class="exercise-media-frames">${frames.map((src,i)=>`<a href="${esc(src)}" target="_blank" rel="noopener" aria-label="Enlarge ${esc(name)} position ${i+1}"><img src="${esc(src)}" alt="${esc(name)} — position ${i+1}" loading="lazy" decoding="async" width="480" height="480"><span>Position ${i+1}</span></a>`).join('')}</div><figcaption>${esc(name)} · <a href="${esc(media.source)}" target="_blank" rel="noopener noreferrer">${esc(media.author)}</a> · <a href="${esc(media.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(media.license)}</a>${variant}</figcaption></figure>`;
    }).join('');
  }
  window.IronSixMediaView={gallery};
  document.addEventListener('error',event=>{
    const img=event.target;if(img.tagName!=='IMG'||!img.closest('.exercise-media'))return;
    const text=document.createElement('span');text.className='media-load-error';text.textContent='Image unavailable. Open to retry, or use the video demonstration.';img.replaceWith(text);
  },true);
})();
