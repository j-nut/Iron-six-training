/* Defensive email/password auth layer for web and native builds. */
(() => {
  if(window.__ironSixAuthHardened)return;window.__ironSixAuthHardened=true;
  const $=id=>document.getElementById(id);
  const ACTIONS={'Sign in':'login','Create account':'signup','Send sign-in link':'magic','Send password reset':'reset','Save new password':'password'};
  // The submit label is a presentation string. Prefer the mode the account UI declares
  // so a relabelled button can never silently turn a reset into a sign-in attempt.
  const MODES=new Set(['login','signup','magic','reset','password']);
  const EMAIL_AUTH_REDIRECT='https://iron-six-training.vercel.app/?auth=email';
  let submitting=false,restoring=false,restoreTimer=null;
  const message=text=>{const el=$('accountStatus');if(el)el.textContent=text};
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,300);
  const emailRedirectTo=()=>EMAIL_AUTH_REDIRECT;
  function timed(promise,ms=20000){
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('The sign-in service did not respond in time.'),{code:'auth_timeout'})),ms)})
    ]).finally(()=>clearTimeout(timer));
  }
  function friendly(error,action){
    const code=clean(error?.code),raw=clean(error?.message).toLowerCase();
    if(code==='auth_timeout')return 'The sign-in service did not respond. Check your connection and try again.';
    if(raw.includes('invalid login credentials'))return 'That email/password combination was not accepted. Use Forgot password? if needed.';
    if(raw.includes('email not confirmed'))return 'Confirm your email first, or use Email link / Forgot password?';
    if(raw.includes('rate limit'))return 'Too many sign-in attempts were made. Try again shortly.';
    if(raw.includes('network')||raw.includes('fetch'))return 'Could not reach the sign-in service. Check your connection and try again.';
    if(action==='login')return 'Could not sign in. Check the email/password or use Forgot password?.';
    return clean(error?.message)||'The account request could not be completed. Please try again.';
  }
  function restoreUi(active,text){
    const button=$('ironCloudButton');
    if(active&&button&&!window.IronSixCloud?.session?.()?.user){button.textContent='Restoring…';button.disabled=true}
    else if(button)button.disabled=false;
    if(text)message(text);
  }
  async function restorePersistedSession(){
    if(restoring)return;
    const expected=(()=>{try{return localStorage.getItem('ironSixAccountScope')}catch(_){return null}})();
    if(!expected)return;
    const client=window.IronSixCloud?.client?.();
    if(!client){clearTimeout(restoreTimer);restoreTimer=setTimeout(restorePersistedSession,150);return}
    restoring=true;restoreUi(true,'Restoring your signed-in session…');
    try{
      let result=await timed(client.auth.getSession(),8000);
      if(result?.error)throw result.error;
      if(!result?.data?.session){
        const refreshed=await timed(client.auth.refreshSession(),8000);
        if(refreshed?.error)throw refreshed.error;
        result=refreshed;
      }
      if(result?.data?.session?.user){
        message('Signed in. Loading and syncing your account…');
      }else{
        // Only declare a true sign-out after both persisted-session restore and refresh
        // have completed. Before this change the UI showed "Sign in" immediately on
        // refresh while Supabase was still restoring the saved session.
        message('Your previous session has expired. Sign in again to reconnect this device.');
      }
    }catch(error){
      const raw=clean(error?.message).toLowerCase();
      if(raw.includes('refresh token')||raw.includes('session')||raw.includes('token'))message('Your previous session has expired. Sign in again to reconnect this device.');
      else message('Could not verify your saved session yet. Your workout remains on this device; check your connection and try again.');
    }finally{
      restoring=false;restoreUi(false);
      const session=window.IronSixCloud?.session?.();
      if(session?.user){const button=$('ironCloudButton');if(button)button.textContent='Account'}
    }
  }
  async function submit(event){
    event.preventDefault();event.stopImmediatePropagation();if(submitting)return;
    const button=$('accountSubmit'),form=$('accountForm'),email=$('accountEmail')?.value.trim()||'',password=$('accountPassword')?.value||'',confirmPassword=$('accountConfirm')?.value||'';
    const declared=form?.dataset?.authMode;
    const action=MODES.has(declared)?declared:(ACTIONS[button?.textContent?.trim()]||'login'),client=window.IronSixCloud?.client?.();
    if(!client){message('Sign-in is still initializing. Your workout remains saved locally. Try again in a moment.');return}
    if(navigator.onLine===false){message('You are offline. Your workout is saved locally; sign in when the connection returns.');return}
    if(action!=='password'&&!/^\S+@\S+\.\S+$/.test(email)){message('Enter a valid email address.');$('accountEmail')?.focus();return}
    if(['login','signup','password'].includes(action)&&!password){message('Enter your password.');$('accountPassword')?.focus();return}
    if(['signup','password'].includes(action)&&(password.length<12||password!==confirmPassword)){message('Use at least 12 characters and matching passwords.');$('accountConfirm')?.focus();return}
    submitting=true;if(button)button.disabled=true;form?.setAttribute('aria-busy','true');
    message(action==='login'?'Signing in…':action==='signup'?'Creating account…':action==='magic'?'Sending sign-in link…':action==='reset'?'Sending password reset…':'Updating password…');
    try{
      let result;
      if(action==='login')result=await timed(client.auth.signInWithPassword({email,password}));
      if(action==='signup')result=await timed(client.auth.signUp({email,password,options:{emailRedirectTo:emailRedirectTo()}}));
      if(action==='magic')result=await timed(client.auth.signInWithOtp({email,options:{emailRedirectTo:emailRedirectTo(),shouldCreateUser:false}}));
      if(action==='reset')result=await timed(client.auth.resetPasswordForEmail(email,{redirectTo:emailRedirectTo()}));
      if(action==='password')result=await timed(client.auth.updateUser({password}));
      if(result?.error)throw result.error;
      if(action==='login'&&!result?.data?.session)throw Object.assign(new Error('No authenticated session was returned.'),{code:'missing_session'});
      if(action==='signup'&&result?.data?.user&&Array.isArray(result.data.user.identities)&&result.data.user.identities.length===0){
        message('An Iron Six account with this email already exists. Use Sign in or Forgot password? instead.');return;
      }
      if(action==='login')message('Signed in. Loading and syncing your account…');
      else if(action==='password')message('Password updated successfully.');
      else if(action==='signup'&&result?.data?.session)message('Account created and signed in. Syncing your workouts…');
      else if(action==='signup')message('Account created. Check your email to confirm it, then return to Iron Six.');
      else if(action==='magic')message('Sign-in link sent. Open the email link to finish on Iron Six.');
      else if(action==='reset')message('Password-reset email sent. Open the email link to set a new password on Iron Six.');
      if(['login','signup','password'].includes(action)){if($('accountPassword'))$('accountPassword').value='';if($('accountConfirm'))$('accountConfirm').value=''}
    }catch(error){message(friendly(error,action))}
    finally{submitting=false;if(button)button.disabled=!window.IronSixCloud?.client?.();form?.removeAttribute('aria-busy')}
  }
  function install(){
    const form=$('accountForm');if(!form)return false;
    if(form.dataset.authHardened==='true')return true;
    form.onsubmit=submit;form.dataset.authHardened='true';return true;
  }
  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  window.addEventListener('pageshow',()=>{install();restorePersistedSession()});
  restorePersistedSession();
})();
