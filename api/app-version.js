// Latest signed Android build, for the in-app update banner. The release workflow publishes every
// signed build as a public GitHub Release `android-build-<versionCode>` carrying iron-six.apk and
// SHA256SUMS.txt; this endpoint picks the newest one and hands the app the APK URL and its hash.
// Only URLs under this repository's release-download path are ever returned, and the phone checks
// the hash again after downloading. Android itself refuses an APK signed with a different key.
const REPO='j-nut/Iron-six-training';
const RELEASES_API=`https://api.github.com/repos/${REPO}/releases?per_page=30`;
const DOWNLOAD_PREFIX=`https://github.com/${REPO}/releases/download/`;
const TAG=/^android-build-([1-9][0-9]{0,8})$/;

function allowedDownload(url,tag,name){
  return typeof url==='string'&&url===DOWNLOAD_PREFIX+tag+'/'+name;
}

function parseSums(text){
  const sums={};
  for(const line of String(text).split(/\r?\n/)){
    const match=line.trim().match(/^([a-fA-F0-9]{64})\s+\*?([A-Za-z0-9._-]+)$/);
    if(match)sums[match[2]]=match[1].toLowerCase();
  }
  return sums;
}

export function pickRelease(releases){
  if(!Array.isArray(releases))return null;
  let best=null;
  for(const release of releases){
    if(!release||release.draft||release.prerelease)continue;
    const match=TAG.exec(String(release.tag_name||''));if(!match)continue;
    const build=Number(match[1]),tag=release.tag_name;
    const assets=Array.isArray(release.assets)?release.assets:[];
    const apk=assets.find(a=>a&&a.name==='iron-six.apk'&&(a.state===undefined||a.state==='uploaded'));
    const sums=assets.find(a=>a&&a.name==='SHA256SUMS.txt'&&(a.state===undefined||a.state==='uploaded'));
    if(!apk||!sums)continue;
    if(!allowedDownload(apk.browser_download_url,tag,'iron-six.apk')||!allowedDownload(sums.browser_download_url,tag,'SHA256SUMS.txt'))continue;
    if(!best||build>best.build)best={build,tag,apkUrl:apk.browser_download_url,sumsUrl:sums.browser_download_url,publishedAt:typeof release.published_at==='string'?release.published_at:null};
  }
  return best;
}

function minimumBuild(){
  const value=Number(process.env.MIN_ANDROID_BUILD);
  return Number.isInteger(value)&&value>0?value:null;
}

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Cache-Control','no-store');return res.status(405).json({error:'GET required'});}
  try{
    const headers={Accept:'application/vnd.github+json','User-Agent':'iron-six-app-version','X-GitHub-Api-Version':'2022-11-28'};
    if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
    const listing=await fetch(RELEASES_API,{headers,signal:AbortSignal.timeout(8000)});
    if(!listing.ok)throw Error('releases');
    const latest=pickRelease(await listing.json());
    if(!latest)throw Error('none');
    // GitHub redirects release downloads to its asset CDN; the request itself starts on the
    // allowlisted URL checked above.
    const sumsResponse=await fetch(latest.sumsUrl,{headers:{'User-Agent':'iron-six-app-version'},redirect:'follow',signal:AbortSignal.timeout(8000)});
    if(!sumsResponse.ok)throw Error('sums');
    const text=await sumsResponse.text();
    if(text.length>4096)throw Error('sums');
    const sha256=parseSums(text)['iron-six.apk'];
    if(!sha256)throw Error('sums');
    res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({android:{build:latest.build,tag:latest.tag,apkUrl:latest.apkUrl,sha256,publishedAt:latest.publishedAt},minimumAndroidBuild:minimumBuild()});
  }catch(_){
    res.setHeader('Cache-Control','no-store');
    return res.status(502).json({error:'Update information is unavailable right now.'});
  }
}
