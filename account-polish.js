/* Presentation-only account surface polish. Auth behavior stays in cloud-sync/social-auth. */
(() => {
  if(window.__ironSixAccountPolish)return;window.__ironSixAccountPolish=true;
  const $=id=>document.getElementById(id);
  function install(){
    const modal=$('cloudModal')?.querySelector('.modal');if(!modal)return false;
    modal.classList.add('account-modal');
    if(!$('accountBrand')){
      const brand=document.createElement('div');brand.id='accountBrand';brand.innerHTML='<div class="account-mark" aria-hidden="true">VI</div><div><div class="account-brand-name">IRON SIX</div><div class="account-brand-sub">Training that adapts with you</div></div>';
      modal.prepend(brand);
    }
    const title=$('accountTitle');if(title)title.textContent='Your training account';
    const tabs=$('accountTabs');if(tabs){tabs.classList.remove('cta');tabs.classList.add('account-mode-links');
      const labels={login:'Sign in',signup:'Create account',magic:'Email me a sign-in link',reset:'Forgot password?'};
      tabs.querySelectorAll('[data-auth]').forEach(btn=>{btn.classList.remove('btn','secondary');btn.classList.add('account-mode-link');btn.textContent=labels[btn.dataset.auth]||btn.textContent});
    }
    const form=$('accountForm');if(form)form.classList.add('account-form');
    const status=$('accountStatus');if(status)status.classList.add('account-status');
    const identity=$('accountIdentity');if(identity)identity.classList.add('account-identity');
    const close=$('cloudClose');if(close){close.classList.remove('secondary');close.classList.add('account-close');close.textContent='Done'}
    const note=[...modal.querySelectorAll(':scope > p')].find(p=>p!==identity&&p!==status);
    if(note){note.classList.add('account-privacy-note');note.textContent='Your workout remains saved on this device during sign-in. Cloud sync only starts after authentication succeeds.'}
    return true;
  }
  const style=document.createElement('style');style.textContent=`
#cloudModal{padding:max(16px,env(safe-area-inset-top)) 14px max(16px,env(safe-area-inset-bottom));background:rgba(3,5,8,.76);backdrop-filter:blur(12px)}
#cloudModal .account-modal{width:min(100%,440px);max-height:min(92vh,760px);padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(180deg,rgba(26,29,34,.99),rgba(14,16,20,.99));box-shadow:0 28px 80px rgba(0,0,0,.48)}
#accountBrand{display:flex;align-items:center;gap:12px;margin-bottom:22px}.account-mark{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#07100c;font-weight:950;letter-spacing:-.06em}.account-brand-name{font-size:13px;font-weight:900;letter-spacing:.16em}.account-brand-sub{font-size:11px;color:var(--muted);margin-top:2px}
#accountTitle{font-size:24px;line-height:1.15;margin:0 0 7px;letter-spacing:-.025em}.account-identity{margin:0 0 10px;color:var(--muted);font-size:13px;line-height:1.45}.account-status{min-height:20px;margin:0 0 14px;padding:0;color:var(--muted);font-size:12.5px;line-height:1.45;overflow-wrap:anywhere}
.account-mode-links{display:flex!important;flex-wrap:wrap;align-items:center;justify-content:center;gap:5px 14px;margin:13px 0 3px}.account-mode-link{border:0!important;background:none!important;padding:3px 0!important;color:var(--muted)!important;font-size:12px!important;font-weight:700!important;min-height:0!important;box-shadow:none!important}.account-mode-link[data-auth="login"],.account-mode-link[data-auth="signup"]{color:var(--accent)!important}.account-mode-link:hover{color:var(--text)!important;text-decoration:underline}
.account-form{display:flex;flex-direction:column;gap:12px;margin-top:8px}.account-form .setting{margin:0}.account-form label{display:block;margin:0 0 6px;font-size:12px;font-weight:760;color:var(--muted)}.account-form input{width:100%;min-height:50px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.035);padding:0 14px;font-size:15px}.account-form input:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px;border-color:var(--accent)}#accountSubmit{min-height:50px;border-radius:12px;margin-top:2px;font-weight:850}
#accountActions{display:grid!important;grid-template-columns:1fr 1fr;gap:9px;margin:12px 0}#accountActions[hidden]{display:none!important}#accountActions .btn{min-height:46px;border-radius:11px;font-size:13px}#accountSignOut{grid-column:1/-1}
.account-privacy-note{margin:16px 0 10px;padding:12px;border-radius:11px;background:rgba(255,255,255,.025);color:var(--muted);font-size:11px;line-height:1.45}.account-close{width:100%;border:0!important;background:transparent!important;color:var(--muted)!important;min-height:40px!important;margin-top:2px!important}
@media(max-width:420px){#cloudModal .account-modal{padding:20px 18px;border-radius:18px}#accountTitle{font-size:22px}#accountActions{grid-template-columns:1fr}.account-mode-links{gap:5px 11px}}
`;
  document.head.append(style);
  if(!install()){const obs=new MutationObserver(()=>{if(install())obs.disconnect()});obs.observe(document.documentElement,{childList:true,subtree:true})}
  window.addEventListener('pageshow',install);
})();
