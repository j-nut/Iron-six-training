/* Exact equipment availability, shared by Profiles and first-run setup. */
(() => {
  const clean = values => [...new Set(values.filter(x => Number.isFinite(x) && x >= .5 && x <= 250))].sort((a,b) => a-b);
  const choices = (weights, selected) => weights.map(w => `<button type="button" class="db-weight" data-db-weight="${w}" aria-pressed="${selected.includes(w)}" aria-label="${w} lb per dumbbell">${w}</button>`).join('');
  function markup(cap = {}, prefix = 'profileDb', maxId = 'dumbbellMax', stepId = 'dumbbellStep') {
    const exact = Array.isArray(cap.dumbbellWeights) && cap.dumbbellWeights.length > 0;
    const step = Number(cap.dumbbellStep) === 2.5 ? 2.5 : 5;
    const maximum = Math.min(250,Math.max(.5,Number(cap.dumbbellMax)||30));
    const selected = exact ? clean(cap.dumbbellWeights).slice(0,128) : Array.from({length:Math.floor(maximum/step)}, (_,i) => (i+1)*step);
    const common = clean([...Array.from({length:24},(_,i)=>(i+1)*2.5),70,80,90,100,...selected]);
    return `<div class="db-inventory" data-db-prefix="${prefix}" data-db-max-field="${maxId}" data-db-step-field="${stepId}">
      <label for="${prefix}Mode">Which dumbbell weights do you have?</label>
      <select id="${prefix}Mode" data-db-mode><option value="regular" ${exact?'':'selected'}>Regular increments up to my maximum</option><option value="exact" ${exact?'selected':''}>Choose exact weights — my set has gaps</option></select>
      <div data-db-details ${exact?'':'hidden'}>
        <p class="helper">Tap the weights you own. Enter the weight of one dumbbell, not the pair.</p>
        <div class="db-weight-grid" role="group" aria-label="Available dumbbell weights in pounds">${choices(common,selected)}</div>
        <div class="db-range"><label for="${prefix}Through">Select a range through (lb)</label><input id="${prefix}Through" data-db-through type="number" min="5" max="250" step="any" value="30"><select data-db-range-step aria-label="Range increment"><option value="5">Every 5 lb</option><option value="2.5">Every 2.5 lb</option></select><button type="button" data-db-range>Use this range</button></div>
        <div class="db-range"><label for="${prefix}Custom">Another weight (lb)</label><input id="${prefix}Custom" data-db-custom type="number" min="0.5" max="250" step="any" placeholder="e.g. 12"><button type="button" data-db-add>Add weight</button></div>
        <button type="button" data-db-clear>Clear selection</button>
        <p class="helper" data-db-summary role="status" aria-live="polite"></p>
      </div>
    </div>`;
  }
  function rootFor(prefix) { return document.querySelector(`[data-db-prefix="${prefix}"]`); }
  function selected(root) { return clean([...root.querySelectorAll('[data-db-weight][aria-pressed="true"]')].map(b=>Number(b.dataset.dbWeight))); }
  function update(root) {
    if (!root) return;
    const exact = root.querySelector('[data-db-mode]').value === 'exact';
    root.querySelector('[data-db-details]').hidden = !exact;
    const max = document.getElementById(root.dataset.dbMaxField), step = document.getElementById(root.dataset.dbStepField);
    for (const field of [max,step]) { const group = field?.closest('.setting,[data-db-regular]'); if(group) group.hidden = exact; }
    document.querySelectorAll(`[data-db-regular="${root.dataset.dbPrefix}"]`).forEach(group=>{group.hidden=exact});
    const weights = selected(root);
    if (exact && weights.length && max) max.value = Math.max(5,weights.at(-1));
    root.querySelector('[data-db-summary]').textContent = weights.length ? `Selected: ${weights.join(', ')} lb each. Only these weights will be suggested.` : 'Select at least one weight.';
  }
  function read(prefix) {
    const root=rootFor(prefix);
    if(!root||root.querySelector('[data-db-mode]').value!=='exact')return {weights:null};
    const weights=selected(root);
    return weights.length ? {weights,max:Math.max(5,weights.at(-1))} : {error:'Select at least one dumbbell weight, or choose regular increments.'};
  }
  function selectWeights(root, weights) {
    const all=clean([...root.querySelectorAll('[data-db-weight]')].map(b=>Number(b.dataset.dbWeight)).concat(weights));
    root.querySelector('.db-weight-grid').innerHTML=choices(all,weights);update(root);
  }
  document.addEventListener('change',event=>{
    const root=event.target.closest?.('[data-db-prefix]');if(root&&event.target.matches('[data-db-mode]'))update(root);
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button'),root=button?.closest('[data-db-prefix]');if(!root)return;
    if(button.hasAttribute('data-db-weight'))button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
    else if(button.hasAttribute('data-db-clear'))selectWeights(root,[]);
    else if(button.hasAttribute('data-db-range')){
      const max=Number(root.querySelector('[data-db-through]').value),step=Number(root.querySelector('[data-db-range-step]').value);
      if(!(max>=5&&max<=250)){root.querySelector('[data-db-summary]').textContent='Choose a range through 5–250 lb.';return;}
      selectWeights(root,Array.from({length:Math.floor(max/step)},(_,i)=>(i+1)*step));
    } else if(button.hasAttribute('data-db-add')){
      const field=root.querySelector('[data-db-custom]'),value=Number(field.value);
      if(!Number.isFinite(value)||value<.5||value>250){root.querySelector('[data-db-summary]').textContent='Enter a weight from 0.5 to 250 lb.';return;}
      selectWeights(root,clean([...selected(root),value]));field.value='';
    }
    update(root);
  });
  function renderProfile(user) {
    const host=document.getElementById('dumbbellInventoryEditor');if(!host)return;
    host.innerHTML=markup(user.capacities);update(rootFor('profileDb'));
  }
  function shortcut(card, exercise) {
    if(typeof exerciseLoadEquipment!=='function'||exerciseLoadEquipment(exercise)!=='dumbbell')return;
    const button=document.createElement('button');button.type='button';button.className='exercise-help-btn db-weight-shortcut';button.textContent="Don't have this weight?";
    button.addEventListener('click',()=>{
      showView('profiles');renderProfileEditor();const root=rootFor('profileDb');if(!root)return;
      root.querySelector('[data-db-mode]').value='exact';update(root);
      const disclosure=root.closest('details');if(disclosure)disclosure.open=true;
      root.scrollIntoView?.({block:'center'});root.querySelector('[data-db-mode]').focus();
      if(typeof toast==='function')toast('Select the dumbbells you own, then Save profile. Logged sets are kept.');
    });
    card.querySelector('.exercise-title')?.appendChild(button);
  }
  window.IronSixDumbbellWeights={markup,update,read,renderProfile,shortcut};
})();
