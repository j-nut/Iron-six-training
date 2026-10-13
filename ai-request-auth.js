// Attaches the signed-in user's Supabase access token to Iron Six AI requests so the server
// can apply per-account limits (api/_lib/ai-guard.js). Guests send nothing extra and are
// limited per network address instead. Installed before every other fetch wrapper, so the
// header survives the Coach fallback and native API-origin rewrites layered on top.
(function(){
  if(window.__ironSixAiAuthFetch)return;
  const AI_PATHS=new Set(['/api/coach','/api/recalculate','/api/review-workout','/api/equipment-exercises']);
  const API_HOST='iron-six-training.vercel.app';
  const baseFetch=window.fetch.bind(window);
  function isAiRequest(input){
    try{
      const raw=typeof input==='string'?input:input?.url;if(!raw)return false;
      const url=new URL(raw,window.location.href);
      return AI_PATHS.has(url.pathname)&&(url.origin===window.location.origin||url.hostname===API_HOST);
    }catch(_){return false}
  }
  function accessToken(){
    try{const session=window.IronSixCloud?.session?.();return typeof session?.access_token==='string'?session.access_token:''}catch(_){return ''}
  }
  window.fetch=function ironSixAiAuthFetch(input,init){
    const token=isAiRequest(input)?accessToken():'';
    if(!token)return baseFetch(input,init);
    const headers=new Headers(init?.headers||(typeof input==='object'&&input?.headers)||undefined);
    if(!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
    return baseFetch(input,{...(init||{}),headers});
  };
  window.__ironSixAiAuthFetch=true;
})();
